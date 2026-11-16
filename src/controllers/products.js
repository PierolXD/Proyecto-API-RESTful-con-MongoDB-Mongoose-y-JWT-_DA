import Product from '../models/Product.js';

export async function listProducts(req, res) {
  const productos = await Product.find().sort({ nombre: 1 }).lean();
  res.json({ moneda: 'MXN', productos });
}
