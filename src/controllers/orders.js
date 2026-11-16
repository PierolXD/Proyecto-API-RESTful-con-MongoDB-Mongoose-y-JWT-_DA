import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { HttpError } from '../middleware/errors.js';

function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw new HttpError(400, 'Envía entre 1 y 50 productos.');
  }
  const seen = new Set();
  return items.map(item => {
    const { producto, cantidad } = item ?? {};
    if (typeof producto !== 'string' || !mongoose.isObjectIdOrHexString(producto) ||
        !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      throw new HttpError(400, 'Cada producto requiere un ID válido y una cantidad de 1 a 100.');
    }
    const id = producto.toLowerCase();
    if (seen.has(id)) throw new HttpError(400, 'Cada producto debe aparecer una sola vez.');
    seen.add(id);
    return { producto: id, cantidad };
  });
}

export async function purchase(req, res) {
  const requested = validateItems(req.body?.items);
  const order = await mongoose.connection.transaction(async session => {
    const items = [];
    for (const { producto, cantidad } of requested) {
      const product = await Product.findOneAndUpdate(
        { _id: producto, stock: { $gte: cantidad } },
        { $inc: { stock: -cantidad } }, { session }
      );
      if (!product) {
        if (!await Product.exists({ _id: producto }).session(session)) {
          throw new HttpError(404, 'Producto no encontrado.');
        }
        throw new HttpError(409, 'Stock insuficiente.');
      }
      items.push({ producto, cantidad, nombre: product.nombre, precioCentavos: product.precioCentavos });
    }
    const totalCentavos = items.reduce((sum, i) => sum + i.cantidad * i.precioCentavos, 0);
    return new Order({ usuario: res.locals.userId, items, totalCentavos }).save({ session });
  });
  res.status(201).json({ orden: order });
}

export async function returnOrder(req, res) {
  const { id } = req.params;
  if (!mongoose.isObjectIdOrHexString(id)) throw new HttpError(400, 'ID de orden inválido.');
  const filter = { _id: id, usuario: res.locals.userId };
  const order = await mongoose.connection.transaction(async session => {
    const updated = await Order.findOneAndUpdate(
      { ...filter, estado: 'comprada' },
      { $set: { estado: 'devuelta', devueltaEn: new Date() } },
      { new: true, session }
    );
    if (!updated) {
      if (!await Order.exists(filter).session(session)) throw new HttpError(404, 'Orden no encontrada.');
      throw new HttpError(409, 'La orden ya fue devuelta.');
    }
    for (const item of updated.items) {
      const result = await Product.updateOne({ _id: item.producto }, { $inc: { stock: item.cantidad } }, { session });
      if (!result.matchedCount) throw new HttpError(409, 'Falta un producto de la orden; no se aplicó la devolución.');
    }
    return updated;
  });
  res.json({ orden: order });
}

export async function listOrders(req, res) {
  const ordenes = await Order.find({ usuario: res.locals.userId }).sort({ createdAt: -1 }).lean();
  res.json({ ordenes });
}
