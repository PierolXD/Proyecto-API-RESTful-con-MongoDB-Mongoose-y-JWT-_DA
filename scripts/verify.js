import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import Product from '../src/models/Product.js';

const key = randomBytes(6).toString('hex');
const qty = 2;
const secret = randomBytes(32).toString('hex');
let server;

try {
  await connectDatabase(process.env.MONGODB_URI);
  const sample = n => ({sku: 'TEST-' + key + '-' + n, nombre: 'Pelota de prueba ' + n,
    categoria: 'juguetes', precioCentavos: 8900, stock: n === 1 ? 5 : 1});
  const [first, second] = await Product.create([sample(1), sample(2)]);
  server = await new Promise((resolve, reject) => {
    const instance = createApp(secret).listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });

  async function request(method, path, expected, body, token, show = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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

  const credentials = { email: 'demo-' + key + '@example.com', password: 'Solo-Pruebas-2026' };
  await request('POST', '/auth/register', 201, { nombre: 'Cliente de prueba', ...credentials });
  await request('POST', '/auth/register', 409, { nombre: 'Cliente de prueba', ...credentials });
  await request('POST', '/auth/login', 401, { ...credentials, password: 'Incorrecta123' });
  const { token } = await request('POST', '/auth/login', 200, credentials);
  const item = { producto: first.id, cantidad: qty };
  const { productos } = await request('GET', '/products', 200, undefined, undefined, false);
  assert.ok(productos.some(p => p._id === first.id));
  await request('POST', '/orders', 401, { items: [item] });
  await request('POST', '/orders', 409,
    { items: [item, { producto: second.id, cantidad: qty }] }, token);
  const stock = async () => (await Product.findById(first.id)).stock;
  assert.equal(await stock(), 5, 'Una compra fallida debe revertir todo el stock');
  assert.equal((await request('GET', '/orders', 200, undefined, token, false)).ordenes.length, 0);

  const { orden } = await request('POST', '/orders', 201, { items: [{ ...item, precioCentavos: 1 }] }, token);
  assert.equal(orden.totalCentavos, 17800);
  assert.equal(await stock(), 3);

  const other = { ...credentials, email: 'otra-' + key + '@example.com' };
  await request('POST', '/auth/register', 201, { nombre: 'Otra persona', ...other }, undefined, false);
  const otherLogin = await request('POST', '/auth/login', 200, other, undefined, false);
  const path = '/orders/' + orden._id + '/return';
  await request('PATCH', path, 404, undefined, otherLogin.token);
  assert.equal(await stock(), 3);

  const returned = await request('PATCH', path, 200, undefined, token);
  assert.equal(returned.orden.estado, 'devuelta');
  await request('PATCH', path, 409, undefined, token);
  assert.equal(await stock(), 5);
  const orders = await request('GET', '/orders', 200, undefined, token, false);
  assert.equal(orders.ordenes[0]._id, orden._id);

  const { orden: last } = await request('POST', '/orders', 201,
    { items: [{ producto: second.id, cantidad: 1 }] }, token, false);
  await request('POST', '/orders', 409, { items: [{ producto: second.id, cantidad: 1 }] }, token, false);
  await request('PATCH', '/orders/' + last._id + '/return', 200, undefined, token, false);
  console.log('OK: autenticación, catálogo, precios del servidor, stock, reversión de compra y devoluciones.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
}
