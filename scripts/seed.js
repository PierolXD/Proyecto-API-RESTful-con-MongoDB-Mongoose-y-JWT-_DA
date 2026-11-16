import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database.js';
import Product from '../src/models/Product.js';

const catalog = [
  { sku: 'HUE-001', nombre: 'Croquetas para perro 2 kg', categoria: 'alimento', precioCentavos: 24900, stock: 20 },
  { sku: 'HUE-002', nombre: 'Pelota de goma', categoria: 'juguetes', precioCentavos: 8900, stock: 12 },
  { sku: 'HUE-003', nombre: 'Arena para gato 4 kg', categoria: 'higiene', precioCentavos: 16900, stock: 15 },
  { sku: 'HUE-004', nombre: 'Correa de nylon', categoria: 'accesorios', precioCentavos: 11900, stock: 8 }
];

try {
  await connectDatabase(process.env.MONGODB_URI);
  for (const product of catalog) {
    await Product.updateOne({ sku: product.sku }, { $setOnInsert: product }, { upsert: true, runValidators: true });
  }
  console.log('Catálogo de ejemplo listo.');
} finally {
  await mongoose.disconnect();
}
