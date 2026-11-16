// ============================================================================
// scripts/seed.js — Script de siembra (seed) de datos iniciales
// ============================================================================
// Este script puebla la base de datos con un catálogo de productos de prueba.
// Utiliza "upsert" con $setOnInsert para asegurar idempotencia: si el producto
// ya existe (por su SKU), no lo sobrescribe ni reinicia el stock que los clientes
// hayan modificado en pruebas anteriores.
// ============================================================================

import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database.js';
import Product from '../src/models/Product.js';

// Catálogo de demostración de productos para mascotas
// Incluye el campo "description" integrado del proyecto del compañero
const catalog = [
  {
    sku: 'HUE-001',
    nombre: 'Croquetas para perro 2 kg',
    description: 'Alimento balanceado premium para perros adultos de raza mediana',
    categoria: 'alimento',
    precioCentavos: 24900, // $249.00 MXN
    stock: 20
  },
  {
    sku: 'HUE-002',
    nombre: 'Pelota de goma',
    description: 'Pelota de caucho resistente para entrenamiento canino',
    categoria: 'juguetes',
    precioCentavos: 8900,  // $89.00 MXN
    stock: 12
  },
  {
    sku: 'HUE-003',
    nombre: 'Arena para gato 4 kg',
    description: 'Arena aglomerante con control avanzado de olores para felinos',
    categoria: 'higiene',
    precioCentavos: 16900, // $169.00 MXN
    stock: 15
  },
  {
    sku: 'HUE-004',
    nombre: 'Correa de nylon',
    description: 'Correa ajustable de alta resistencia con mosquetón de seguridad',
    categoria: 'accesorios',
    precioCentavos: 11900, // $119.00 MXN
    stock: 8
  }
];

try {
  // Conectar a la base de datos usando la variable de entorno
  await connectDatabase(process.env.MONGODB_URI);

  // Insertar cada producto usando operación atómica upsert
  for (const product of catalog) {
    await Product.updateOne(
      { sku: product.sku },
      { $setOnInsert: product },
      { upsert: true, runValidators: true }
    );
  }

  console.log('Catálogo de ejemplo listo con productos iniciales.');
} finally {
  // Garantizar el cierre de la conexión pase lo que pase
  await mongoose.disconnect();
}
