// ============================================================================
// models/Product.js — Esquema de Mongoose para la colección "products"
// ============================================================================
// Este modelo define la estructura de cada producto en la tienda de mascotas.
// Combina campos de ambos proyectos del equipo:
//   - Del proyecto original: sku, nombre, categoria, precioCentavos, stock
//   - Del proyecto del compañero: description (descripción del producto)
// ============================================================================

import mongoose from 'mongoose';

// ── Definición del esquema de Producto ──────────────────────────────────────
const schema = new mongoose.Schema({

  // Campo "sku": código único de inventario (Stock Keeping Unit)
  // Ejemplo: "HUE-001", "HUE-002"
  sku: {
    type: String,
    required: true,        // No se puede crear un producto sin SKU
    trim: true,            // Elimina espacios sobrantes
    uppercase: true,       // Convierte automáticamente a MAYÚSCULAS ("hue-001" → "HUE-001")
    unique: true           // Índice único → no pueden existir dos productos con el mismo SKU
  },

  // Campo "nombre": nombre legible del producto
  nombre: {
    type: String,
    required: true,
    trim: true
  },

  // Campo "description": descripción detallada del producto
  // (Integrado del proyecto del compañero para dar más contexto al catálogo)
  description: {
    type: String,
    default: ''            // Si no se envía descripción, queda como cadena vacía
    // ↑ "default" asigna un valor automáticamente cuando el campo no se incluye
    //   en el documento al crearlo. Así no es obligatorio pero siempre existe.
  },

  // Campo "categoria": categoría del catálogo de mascotas
  categoria: {
    type: String,
    required: true,
    enum: ['alimento', 'juguetes', 'higiene', 'accesorios']
    // ↑ enum: lista blanca de valores permitidos.
    //   Si alguien intenta guardar categoria: "electrónica", Mongoose
    //   rechaza el documento con un ValidationError.
    //   Esto mantiene el catálogo organizado y consistente.
  },

  // Campo "precioCentavos": precio en centavos de MXN (entero, sin decimales)
  // Ejemplo: 24900 = $249.00 MXN
  // ¿Por qué centavos? Porque los números de punto flotante (como 249.99)
  // pueden tener errores de precisión en JavaScript:
  //   0.1 + 0.2 === 0.30000000000000004  // ¡no es 0.3!
  // Usar centavos (enteros) elimina ese problema completamente.
  precioCentavos: {
    type: Number,
    required: true,
    min: 1,                // El precio mínimo es 1 centavo (no puede ser gratis ni negativo)
    max: 100000000,        // Máximo: $1,000,000.00 MXN (protección contra datos absurdos)
    validate: Number.isSafeInteger
    // ↑ Validación personalizada: Number.isSafeInteger(valor) verifica que
    //   el número sea un entero seguro de JavaScript (entre -2^53+1 y 2^53-1).
    //   Rechaza valores como 99.5, NaN, Infinity, o números demasiado grandes.
  },

  // Campo "stock": cantidad disponible en inventario
  stock: {
    type: Number,
    required: true,
    min: 0,                // No puede ser negativo (0 = agotado)
    validate: Number.isSafeInteger
  }

}, {
  timestamps: true         // Agrega createdAt y updatedAt automáticamente
});

// ── Exportar el modelo ──────────────────────────────────────────────────────
// La colección en MongoDB se llamará "products" (plural en minúsculas de 'Product')
export default mongoose.model('Product', schema);
