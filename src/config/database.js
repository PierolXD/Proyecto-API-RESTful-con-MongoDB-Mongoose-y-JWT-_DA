// ============================================================================
// config/database.js — Conexión a la base de datos MongoDB
// ============================================================================
// Este archivo centraliza toda la lógica de conexión a MongoDB.
// Se conecta usando Mongoose (el ODM) y verifica que la instancia de MongoDB
// soporte transacciones (requiere un Replica Set o MongoDB Atlas).
//
// ¿Por qué se necesitan transacciones?
//   Cuando un cliente compra 3 productos, necesitamos:
//     1. Verificar stock de cada producto
//     2. Descontar stock de cada producto
//     3. Crear el documento de la orden
//   Si el paso 2 falla a la mitad (ej: se cae el servidor), sin transacciones
//   algunos productos quedarían descontados y otros no → datos inconsistentes.
//   Las transacciones garantizan: o TODO se aplica, o NADA se aplica (ACID).
//
// ¿Qué es un Replica Set?
//   Es un grupo de servidores MongoDB que mantienen copias de los mismos datos.
//   Si el servidor principal falla, otro toma su lugar automáticamente.
//   MongoDB Atlas (la nube) siempre usa replica sets.
//   MongoDB local standalone NO soporta transacciones por defecto.
// ============================================================================

import mongoose from 'mongoose';

// Importamos los modelos para que Mongoose los registre y cree sus índices
// al conectarse. Sin estas importaciones, los modelos no estarían disponibles
// cuando los controladores los necesiten.
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

/**
 * connectDatabase(uri)
 * --------------------
 * Establece la conexión con MongoDB y verifica que soporte transacciones.
 *
 * @param {string} uri - La cadena de conexión de MongoDB.
 *   Ejemplos:
 *     - Local con replica set: "mongodb://127.0.0.1:27017/huella?replicaSet=rs0"
 *     - Atlas (nube):          "mongodb+srv://user:pass@cluster.mongodb.net/huella"
 *
 * @throws {Error} Si falta el URI o si MongoDB no tiene replica set configurado.
 */
export async function connectDatabase(uri) {
  // ── Paso 1: Validar que se proporcionó un URI ─────────────────────────
  if (!uri) throw new Error('Falta MONGODB_URI.');

  // ── Paso 2: Conectar con Mongoose ─────────────────────────────────────
  // mongoose.connect() establece la conexión TCP con el servidor de MongoDB.
  // serverSelectionTimeoutMS: cuántos milisegundos esperar antes de rendirse
  // si no puede encontrar un servidor disponible (5 segundos).
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  // ── Paso 3: Verificar que es un Replica Set ───────────────────────────
  // El comando "hello" devuelve información sobre la topología del servidor.
  // - hello.setName → nombre del replica set (ej: "rs0", "atlas-xxx")
  // - hello.msg === 'isdbgrid' → es un clúster sharded (también soporta transacciones)
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('Las compras requieren un replica set de MongoDB o MongoDB Atlas.');
  }

  // ── Paso 4: Inicializar índices de los modelos ────────────────────────
  // Model.init() espera a que MongoDB cree los índices definidos en los esquemas
  // (como unique: true en email o sku). Promise.all() los ejecuta en paralelo.
  await Promise.all([User.init(), Product.init(), Order.init()]);
}
