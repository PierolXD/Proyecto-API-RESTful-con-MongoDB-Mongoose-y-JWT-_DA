// ============================================================================
// controllers/products.js — Controlador de productos (catálogo y creación)
// ============================================================================
// Maneja dos acciones:
//   1. listProducts (GET /api/products): cualquiera puede ver el catálogo
//   2. createProduct (POST /api/products): solo admins pueden crear productos
//      (integrado del proyecto del compañero)
//
// El catálogo es público porque una tienda necesita que los visitantes
// puedan ver los productos antes de registrarse.
// ============================================================================

import Product from '../models/Product.js';
import { HttpError } from '../middleware/errors.js';

// ── Listar todos los productos (público) ────────────────────────────────────
/**
 * listProducts(req, res)
 * ----------------------
 * Devuelve todos los productos ordenados alfabéticamente por nombre.
 *
 * GET /api/products → 200 OK
 * Respuesta:
 *   {
 *     "moneda": "MXN",
 *     "productos": [
 *       { "_id": "...", "sku": "HUE-001", "nombre": "Croquetas...", "precioCentavos": 24900, ... },
 *       ...
 *     ]
 *   }
 *
 * .find() sin argumentos devuelve TODOS los documentos de la colección.
 * .sort({ nombre: 1 }) ordena alfabéticamente (1 = ascendente, -1 = descendente).
 * .lean() devuelve objetos JavaScript planos en vez de documentos de Mongoose,
 *   lo cual es más rápido y usa menos memoria (ideal para lecturas simples).
 */
export async function listProducts(req, res) {
  const productos = await Product.find().sort({ nombre: 1 }).lean();
  res.json({ moneda: 'MXN', productos });
}

// ── Crear un producto nuevo (solo admin) ────────────────────────────────────
/**
 * createProduct(req, res)
 * -----------------------
 * Crea un nuevo producto en el catálogo.
 * Solo usuarios con rol "admin" pueden usar este endpoint.
 * La verificación de rol se hace aquí en el controlador (no en el middleware de auth,
 * que solo verifica el token).
 *
 * POST /api/products (requiere JWT de admin)
 * Body esperado (JSON):
 *   {
 *     "sku": "HUE-005",
 *     "nombre": "Shampoo para perro",
 *     "description": "Shampoo hipoalergénico para perros sensibles",
 *     "categoria": "higiene",
 *     "precioCentavos": 15900,
 *     "stock": 25
 *   }
 *
 * Respuesta exitosa (201 Created):
 *   { "producto": { "_id": "...", "sku": "HUE-005", ... } }
 */
export async function createProduct(req, res) {
  // ── Verificar que el usuario tiene rol de admin ───────────────────────
  // res.locals.userRole fue inyectado por el middleware authenticate()
  // Si no es admin, lanzamos 403 Forbidden (autenticado pero sin permisos)
  if (res.locals.userRole !== 'admin') {
    throw new HttpError(403, 'Solo los administradores pueden crear productos.');
  }

  // ── Extraer y validar datos del body ──────────────────────────────────
  const { sku, nombre, description, categoria, precioCentavos, stock } = req.body ?? {};

  // Validaciones básicas antes de intentar guardar en la base de datos.
  // Mongoose también valida (por las restricciones del esquema), pero es
  // mejor fallar temprano con mensajes claros.
  if (typeof sku !== 'string' || !sku.trim()) {
    throw new HttpError(400, 'El SKU es obligatorio.');
  }
  if (typeof nombre !== 'string' || !nombre.trim()) {
    throw new HttpError(400, 'El nombre del producto es obligatorio.');
  }

  // ── Crear el producto en MongoDB ──────────────────────────────────────
  // Product.create() inserta un nuevo documento en la colección "products".
  // Si el SKU ya existe, MongoDB lanza error code 11000 y nuestro middleware
  // lo convierte en 409 Conflict automáticamente.
  const producto = await Product.create({
    sku,
    nombre,
    description: description || '',    // Si no se envía descripción, cadena vacía
    categoria,
    precioCentavos,
    stock
  });

  // 201 = "Created" (recurso creado exitosamente)
  res.status(201).json({ producto });
}
