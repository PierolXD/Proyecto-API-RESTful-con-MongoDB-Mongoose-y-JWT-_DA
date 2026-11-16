// ============================================================================
// scripts/verify.js — Suite de pruebas automatizadas de extremo a extremo (E2E)
// ============================================================================
// Este script levanta un servidor Express de prueba en un puerto aleatorio libre,
// se conecta a la base de datos de MongoDB especificada en MONGODB_URI y ejecuta
// solicitudes HTTP reales con fetch() para verificar el comportamiento de toda la API:
//   1. Registro de usuario (201 Created) y prevención de duplicados (409 Conflict).
//   2. Autenticación con contraseña errónea (401) y login exitoso con JWT (200).
//   3. Consulta pública del catálogo de productos (200 OK).
//   4. Creación de producto con rol 'admin' (201) y rechazo a usuario normal (403).
//   5. Protección de rutas privadas sin token (401).
//   6. Control de stock insuficiente con rollback atómico total (409).
//   7. Creación de orden exitosa usando precios seguros del servidor (201).
//   8. Intento de devolución por usuario ajeno (404 Not Found).
//   9. Devolución exitosa con reposición automática del stock (200).
//  10. Prevención de doble devolución sobre la misma orden (409 Conflict).
// ============================================================================

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';

// Claves únicas por ejecución para no colisionar con datos previos
const key = randomBytes(6).toString('hex');
const qty = 2;
const secret = randomBytes(32).toString('hex');
let server;

try {
  // ── Conexión a la base de datos de prueba ────────────────────────────────
  await connectDatabase(process.env.MONGODB_URI);

  // Crear 2 productos de muestra con stock controlado
  const sample = n => ({
    sku: 'TEST-' + key + '-' + n,
    nombre: 'Pelota de prueba ' + n,
    description: 'Producto temporal para validación automatizada',
    categoria: 'juguetes',
    precioCentavos: 8900,
    stock: n === 1 ? 5 : 1
  });
  const [first, second] = await Product.create([sample(1), sample(2)]);

  // Levantar la app Express en un puerto efímero (0 = asignado por el SO)
  server = await new Promise((resolve, reject) => {
    const instance = createApp(secret).listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });

  /**
   * Función auxiliar para realizar peticiones HTTP e imprimir evidencia limpia
   */
  async function request(method, path, expected, body, token, show = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json();

    if (show) {
      console.log(method + ' /api' + path);
      console.log('Headers: ' + JSON.stringify({ ...headers, ...(token && { Authorization: 'Bearer <JWT omitido>' }) }));
      console.log('Request: ' + (body === undefined ? '(sin cuerpo)' : JSON.stringify(body)));
      console.log('HTTP ' + res.status + ' ' + res.statusText);
      console.log('Response: ' + JSON.stringify({ ...data, ...(data.token && { token: '<JWT omitido>' }) }, null, 2));
      console.log();
    }

    assert.equal(res.status, expected, JSON.stringify(data));
    return data;
  }

  // ── 1. Pruebas de Registro y Autenticación ───────────────────────────────
  const credentials = { email: 'demo-' + key + '@example.com', password: 'Solo-Pruebas-2026' };

  // Registro exitoso
  await request('POST', '/auth/register', 201, { nombre: 'Cliente de prueba', ...credentials });

  // Intento de duplicado de email (debe responder 409)
  await request('POST', '/auth/register', 409, { nombre: 'Cliente de prueba', ...credentials });

  // Login con contraseña incorrecta (401)
  await request('POST', '/auth/login', 401, { ...credentials, password: 'Incorrecta123' });

  // Login exitoso (200 con JWT)
  const { token } = await request('POST', '/auth/login', 200, credentials);

  // El registro público ignora cualquier intento de asignarse el rol admin.
  const adminCreds = { email: 'admin-' + key + '@example.com', password: 'Admin-Pruebas-2026' };
  const { usuario: admin } = await request('POST', '/auth/register', 201, {
    nombre: 'Admin de prueba', role: 'admin', ...adminCreds
  });
  assert.equal(admin.role, 'client');
  const beforePromotion = await request('POST', '/auth/login', 200, adminCreds, undefined, false);

  // ── 2. Pruebas de Catálogo y Creación de Producto ─────────────────────────
  // Cliente normal intenta crear producto (debe fallar con 403 Forbidden)
  await request('POST', '/products', 403, {
    sku: 'HUE-FORBIDDEN-' + key,
    nombre: 'Intento no autorizado',
    categoria: 'accesorios',
    precioCentavos: 5000,
    stock: 10
  }, beforePromotion.token);

  // Admin crea producto nuevo (debe ser 201 Created)
  await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } });
  const { token: adminToken } = await request('POST', '/auth/login', 200, adminCreds, undefined, false);
  await request('POST', '/products', 201, {
    sku: 'HUE-ADMIN-' + key,
    nombre: 'Producto creado por Admin',
    description: 'Verificación de endpoint integrado',
    categoria: 'accesorios',
    precioCentavos: 12500,
    stock: 15
  }, adminToken);

  // Consulta pública del catálogo
  const { productos } = await request('GET', '/products', 200, undefined, undefined, false);
  assert.ok(productos.some(p => p._id === first.id));

  // ── 3. Pruebas de Compras, Control de Stock y Rollback ────────────────────
  const item = { producto: first.id, cantidad: qty };

  // Compra sin token (debe responder 401)
  await request('POST', '/orders', 401, { items: [item] });

  // Compra que excede stock de uno de los artículos (debe abortar con 409)
  await request('POST', '/orders', 409, {
    items: [item, { producto: second.id, cantidad: qty }]
  }, token);

  // Verificar que el stock no fue alterado tras el fallo (Rollback atómico)
  const stock = async () => (await Product.findById(first.id)).stock;
  assert.equal(await stock(), 5, 'Una compra fallida debe revertir todo el stock');
  assert.equal((await request('GET', '/orders', 200, undefined, token, false)).ordenes.length, 0);

  // Compra exitosa (intento de manipular precio con precioCentavos: 1 es ignorado por el servidor)
  const { orden } = await request('POST', '/orders', 201, {
    items: [{ ...item, precioCentavos: 1 }]
  }, token);
  assert.equal(orden.totalCentavos, 17800); // 2 * 8900 = 17800
  assert.equal(await stock(), 3);          // 5 - 2 = 3

  // ── 4. Pruebas de Devolución de Órdenes ───────────────────────────────────
  // Usuario diferente intenta devolver la orden ajena (404 Not Found)
  const other = { ...credentials, email: 'otra-' + key + '@example.com' };
  await request('POST', '/auth/register', 201, { nombre: 'Otra persona', ...other }, undefined, false);
  const otherLogin = await request('POST', '/auth/login', 200, other, undefined, false);
  const path = '/orders/' + orden._id + '/return';
  await request('PATCH', path, 404, undefined, otherLogin.token);
  assert.equal(await stock(), 3);

  // Propietario devuelve su orden (200 OK con reposición a 5 de stock)
  const returned = await request('PATCH', path, 200, undefined, token);
  assert.equal(returned.orden.estado, 'devuelta');
  assert.equal(await stock(), 5);

  // Intento de segunda devolución sobre orden ya devuelta (409 Conflict)
  await request('PATCH', path, 409, undefined, token);
  assert.equal(await stock(), 5);

  // Historial contiene la orden devuelta
  const orders = await request('GET', '/orders', 200, undefined, token, false);
  assert.equal(orders.ordenes[0]._id, orden._id);

  console.log('OK: autenticación, roles, catálogo, precios del servidor, stock, reversión de compra y devoluciones.');
} finally {
  // Limpieza de servidor y conexiones al terminar
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
}
