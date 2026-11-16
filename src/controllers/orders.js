// ============================================================================
// controllers/orders.js — Controlador de órdenes (compra, devolución, historial)
// ============================================================================
// Este es el controlador más complejo de la API porque usa TRANSACCIONES
// de MongoDB para garantizar la integridad de los datos.
//
// ¿Qué es una transacción?
//   Es un grupo de operaciones que se ejecutan como una unidad atómica:
//   o TODAS se aplican exitosamente, o NINGUNA se aplica.
//   Esto previene estados inconsistentes como:
//   - Descontar stock de un producto pero fallar al crear la orden
//   - Devolver una orden pero fallar al reponer el stock
//
// Principio ACID:
//   - Atomicity (Atomicidad): todo o nada
//   - Consistency (Consistencia): los datos siempre quedan válidos
//   - Isolation (Aislamiento): transacciones concurrentes no interfieren
//   - Durability (Durabilidad): una vez confirmada, los cambios persisten
//
// Tres acciones:
//   1. purchase: crear una orden (comprar productos)
//   2. returnOrder: devolver una orden (reponer stock)
//   3. listOrders: ver el historial de compras del usuario
// ============================================================================

import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { HttpError } from '../middleware/errors.js';

// ── Validación de los items del pedido ──────────────────────────────────────
/**
 * validateItems(items)
 * --------------------
 * Valida y normaliza el array de productos que el cliente quiere comprar.
 * Se ejecuta ANTES de tocar la base de datos para rechazar datos inválidos
 * lo más pronto posible (fail fast).
 *
 * @param {Array} items - Array de objetos { producto: "id", cantidad: N }
 * @returns {Array} Array normalizado con IDs en minúsculas
 * @throws {HttpError} Si los datos son inválidos
 */
function validateItems(items) {
  // ── Validar que items sea un array con entre 1 y 50 elementos ─────
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw new HttpError(400, 'Envía entre 1 y 50 productos.');
  }

  // ── Verificar que no haya productos duplicados ────────────────────
  // Un Set es una estructura de datos que solo permite valores únicos.
  // Si intentamos agregar un ID que ya existe, lo detectamos.
  const seen = new Set();

  return items.map(item => {
    const { producto, cantidad } = item ?? {};
    //                              ↑ item ?? {} protege contra null/undefined

    // Validar que "producto" sea un ObjectId válido de MongoDB (24 chars hexadecimales)
    // y que "cantidad" sea un entero entre 1 y 100
    if (typeof producto !== 'string' || !mongoose.isObjectIdOrHexString(producto) ||
        !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      throw new HttpError(400, 'Cada producto requiere un ID válido y una cantidad de 1 a 100.');
    }

    // Normalizar el ID a minúsculas (MongoDB ObjectIds son case-insensitive)
    const id = producto.toLowerCase();

    // Verificar que no se repita el mismo producto en la orden
    if (seen.has(id)) throw new HttpError(400, 'Cada producto debe aparecer una sola vez.');
    seen.add(id);

    return { producto: id, cantidad };
  });
}

// ── Controlador de compra ───────────────────────────────────────────────────
/**
 * purchase(req, res)
 * ------------------
 * Crea una orden de compra. Este es el flujo más crítico de la API.
 *
 * POST /api/orders (requiere JWT)
 * Body esperado:
 *   { "items": [{ "producto": "6afb...", "cantidad": 2 }] }
 *
 * NOTA DE SEGURIDAD: el cliente puede intentar enviar "precioCentavos" en el body,
 * pero este controlador IGNORA ese valor y lee el precio directamente de la base
 * de datos. Así prevenimos que un atacante compre a precios falsificados.
 *
 * Flujo detallado dentro de la transacción:
 *   1. Para cada producto solicitado:
 *      a. Buscar el producto Y descontar stock atómicamente
 *         (findOneAndUpdate con condición stock >= cantidad)
 *      b. Si no hay stock suficiente → abortar TODA la transacción
 *      c. Guardar nombre y precio del producto (snapshot)
 *   2. Calcular el total sumando (cantidad × precio) de cada item
 *   3. Crear el documento de la orden
 *   4. Si todo sale bien → MongoDB confirma (commit) la transacción
 *   5. Si algo falla → MongoDB revierte (rollback) TODOS los cambios
 */
export async function purchase(req, res) {
  // Validar los items antes de iniciar la transacción
  const requested = validateItems(req.body?.items);

  // ── Iniciar transacción de MongoDB ──────────────────────────────────
  // mongoose.connection.transaction() ejecuta el callback dentro de una
  // sesión transaccional. Si el callback lanza una excepción, MongoDB
  // revierte automáticamente todos los cambios hechos en esa sesión.
  const order = await mongoose.connection.transaction(async session => {
    // ↑ "session" es el objeto que identifica esta transacción.
    //   Todas las operaciones dentro del callback DEBEN pasar { session }
    //   para que MongoDB las agrupe en la misma transacción.

    const items = [];

    // ── Procesar cada producto solicitado ──────────────────────────────
    for (const { producto, cantidad } of requested) {

      // findOneAndUpdate: busca UN documento que cumpla el filtro y lo modifica.
      // Filtro: { _id: producto, stock: { $gte: cantidad } }
      //   → Solo encuentra el producto SI tiene stock suficiente.
      //   $gte = "greater than or equal" (mayor o igual que).
      //
      // Modificación: { $inc: { stock: -cantidad } }
      //   $inc = "increment" (incrementar). Con valor negativo, resta.
      //   Ejemplo: stock era 10, cantidad es 3 → stock queda 7.
      //
      // CLAVE: la búsqueda y la modificación son ATÓMICAS (una sola operación).
      // No hay momento entre "verificar stock" y "descontar stock" donde otro
      // usuario podría comprar el mismo producto (race condition).
      const product = await Product.findOneAndUpdate(
        { _id: producto, stock: { $gte: cantidad } },
        { $inc: { stock: -cantidad } },
        { session }  // ← Vincula esta operación a la transacción
      );

      // Si no se encontró el producto (null), puede ser por dos razones:
      if (!product) {
        // Caso 1: el producto no existe en absoluto
        if (!await Product.exists({ _id: producto }).session(session)) {
          throw new HttpError(404, 'Producto no encontrado.');
        }
        // Caso 2: existe pero no tiene stock suficiente
        throw new HttpError(409, 'Stock insuficiente.');
        // ↑ Al lanzar la excepción, la transacción se aborta automáticamente.
        //   Cualquier stock ya descontado en iteraciones anteriores del for
        //   se REVIERTE (rollback). ¡Los datos quedan intactos!
      }

      // Guardar el snapshot del producto (nombre y precio al momento de la compra)
      items.push({
        producto,
        cantidad,
        nombre: product.nombre,
        precioCentavos: product.precioCentavos
        // ↑ Usamos el precio de la base de datos, NO el del cliente.
        //   Aunque el cliente envíe { precioCentavos: 1 }, se ignora.
      });
    }

    // ── Calcular el total de la orden ───────────────────────────────────
    // .reduce() acumula un valor recorriendo el array.
    // Para cada item: sum + (cantidad × precioCentavos)
    // Ejemplo: 2 pelotas a 8900 + 1 correa a 11900 = 29700 centavos ($297.00)
    const totalCentavos = items.reduce((sum, i) => sum + i.cantidad * i.precioCentavos, 0);

    // ── Crear el documento de la orden ──────────────────────────────────
    // new Order({...}).save({ session }) crea y guarda dentro de la transacción.
    // res.locals.userId fue inyectado por el middleware authenticate().
    return new Order({
      usuario: res.locals.userId,
      items,
      totalCentavos
      // estado: 'comprada' → se asigna automáticamente por el default del esquema
    }).save({ session });
  });
  // ↑ Si llegamos aquí sin excepciones, MongoDB confirma (commit) la transacción.
  //   Todos los cambios de stock y la orden se guardan permanentemente.

  // Responder con la orden creada
  res.status(201).json({ orden: order });
}

// ── Controlador de devolución ───────────────────────────────────────────────
/**
 * returnOrder(req, res)
 * ---------------------
 * Devuelve una orden completa: cambia su estado a "devuelta" y repone el stock.
 *
 * PATCH /api/orders/:id/return (requiere JWT)
 * No requiere body.
 *
 * Validaciones:
 *   - El ID debe ser un ObjectId válido → 400 si no lo es
 *   - La orden debe existir y pertenecer al usuario autenticado → 404 si no
 *   - La orden debe estar en estado "comprada" → 409 si ya fue devuelta
 *   - Todos los productos de la orden deben seguir existiendo → 409 si no
 *
 * Todo se ejecuta dentro de una transacción para garantizar atomicidad.
 */
export async function returnOrder(req, res) {
  const { id } = req.params;
  // ↑ req.params contiene los parámetros de la URL.
  //   Para la ruta /api/orders/:id/return, req.params.id es el valor de :id

  // Validar formato del ID
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new HttpError(400, 'ID de orden inválido.');
  }

  // Filtro: la orden debe pertenecer al usuario autenticado
  const filter = { _id: id, usuario: res.locals.userId };

  const order = await mongoose.connection.transaction(async session => {

    // ── Paso 1: Cambiar estado de "comprada" a "devuelta" ─────────────
    // findOneAndUpdate con filtro adicional { estado: 'comprada' }:
    //   → Solo encuentra la orden si NO ha sido devuelta antes.
    //   → Esto previene la "doble devolución" de forma atómica.
    //
    // $set: establece campos a valores específicos.
    // { new: true }: devuelve el documento DESPUÉS de la modificación
    //   (por defecto devolvería el estado anterior, que no nos interesa).
    const updated = await Order.findOneAndUpdate(
      { ...filter, estado: 'comprada' },
      { $set: { estado: 'devuelta', devueltaEn: new Date() } },
      { new: true, session }
    );

    // Si no se encontró, puede ser porque:
    if (!updated) {
      // La orden no existe o pertenece a otro usuario
      if (!await Order.exists(filter).session(session)) {
        throw new HttpError(404, 'Orden no encontrada.');
      }
      // Existe pero ya fue devuelta
      throw new HttpError(409, 'La orden ya fue devuelta.');
    }

    // ── Paso 2: Reponer el stock de cada producto ─────────────────────
    for (const item of updated.items) {
      // $inc con valor positivo SUMA al stock (reposición)
      const result = await Product.updateOne(
        { _id: item.producto },
        { $inc: { stock: item.cantidad } },
        { session }
      );

      // Si el producto fue eliminado del catálogo, no podemos reponer stock
      if (!result.matchedCount) {
        throw new HttpError(409, 'Falta un producto de la orden; no se aplicó la devolución.');
        // ↑ La transacción se revierte: el estado de la orden vuelve a "comprada"
        //   y cualquier stock ya repuesto se deshace.
      }
    }

    return updated;
  });

  // Responder con la orden actualizada
  res.json({ orden: order });
}

// ── Controlador de historial ────────────────────────────────────────────────
/**
 * listOrders(req, res)
 * --------------------
 * Devuelve todas las órdenes del usuario autenticado, ordenadas de la más
 * reciente a la más antigua.
 *
 * GET /api/orders (requiere JWT)
 *
 * .find({ usuario: id }): filtra solo las órdenes de este usuario.
 *   Gracias al índice que definimos en el esquema (index: true en "usuario"),
 *   esta consulta es muy rápida incluso con millones de órdenes.
 *
 * .sort({ createdAt: -1 }): -1 = descendente (más reciente primero).
 *
 * .lean(): devuelve objetos planos de JavaScript (más rápido y menos memoria).
 */
export async function listOrders(req, res) {
  const ordenes = await Order.find({ usuario: res.locals.userId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ ordenes });
}
