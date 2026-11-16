import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  sku: { type: String, required: true, trim: true, uppercase: true, unique: true },
  nombre: { type: String, required: true, trim: true },
  categoria: { type: String, required: true, enum: ['alimento', 'juguetes', 'higiene', 'accesorios'] },
  precioCentavos: { type: Number, required: true, min: 1, max: 100000000, validate: Number.isSafeInteger },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
}, { timestamps: true });

export default mongoose.model('Product', schema);
