import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

export async function connectDatabase(uri) {
  if (!uri) throw new Error('Falta MONGODB_URI.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('Las compras requieren un replica set de MongoDB o MongoDB Atlas.');
  }
  await Promise.all([User.init(), Product.init(), Order.init()]);
}
