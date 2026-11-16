import mongoose from 'mongoose';

const item = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  nombre: { type: String, required: true },
  cantidad: { type: Number, required: true, min: 1, max: 100, validate: Number.isSafeInteger },
  precioCentavos: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
}, { _id: false });

const schema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: { type: [item], required: true, validate: v => v.length >= 1 && v.length <= 50 },
  totalCentavos: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  estado: { type: String, enum: ['comprada', 'devuelta'], default: 'comprada', required: true },
  devueltaEn: Date
}, { timestamps: true });

export default mongoose.model('Order', schema);
