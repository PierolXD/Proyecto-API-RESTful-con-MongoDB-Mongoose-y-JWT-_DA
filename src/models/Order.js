// ============================================================================
// models/Order.js — Esquema de Mongoose para la colección "orders"
// ============================================================================
// Una orden representa una compra realizada por un usuario. Contiene:
//   - Referencia al usuario que compró (por ObjectId)
//   - Lista de artículos comprados con cantidad y precio congelado
//   - Total de la compra en centavos
//   - Estado del ciclo de vida: "comprada" o "devuelta"
//
// ¿Qué es un subdocumento (sub-schema)?
//   Mongoose permite definir esquemas dentro de esquemas. Cada "item" dentro
//   de la orden es un subdocumento con su propia estructura y validaciones,
//   pero se almacena embebido dentro del documento de la orden (no en otra
//   colección). Esto es una ventaja de MongoDB sobre SQL: datos relacionados
//   se guardan juntos, evitando JOINs costosos.
// ============================================================================

import mongoose from 'mongoose';

// ── Sub-esquema para cada artículo de la orden ──────────────────────────────
// Este esquema NO crea una colección aparte; se embebe dentro de cada orden.
const item = new mongoose.Schema({

  // Referencia al producto comprado (ObjectId apuntando a la colección "products")
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',        // ref: indica a Mongoose que este ID pertenece al modelo 'Product'
                           // Esto permite usar .populate('producto') para obtener los datos
                           // completos del producto en una consulta (similar a un JOIN en SQL)
    required: true
  },

  // Nombre del producto AL MOMENTO DE LA COMPRA (snapshot/congelado)
  // ¿Por qué guardamos el nombre aquí si ya tenemos la referencia?
  // Porque si el producto cambia de nombre después, la orden debe reflejar
  // lo que el cliente compró originalmente. Es un patrón llamado "snapshot".
  nombre: {
    type: String,
    required: true
  },

  // Cantidad de unidades compradas de este producto
  cantidad: {
    type: Number,
    required: true,
    min: 1,                // Mínimo 1 unidad
    max: 100,              // Máximo 100 unidades por artículo (protección anti-abuso)
    validate: Number.isSafeInteger
  },

  // Precio unitario del producto AL MOMENTO DE LA COMPRA (snapshot/congelado)
  // Mismo principio: si el precio cambia después, la orden conserva el precio original
  precioCentavos: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger
  }

}, {
  _id: false
  // ↑ _id: false → Por defecto, Mongoose asigna un _id a cada subdocumento.
  //   Como estos items son parte de la orden y no necesitan ser referenciados
  //   individualmente desde fuera, desactivamos el _id para mantener
  //   los documentos más limpios y pequeños.
});

// ── Esquema principal de la orden ───────────────────────────────────────────
const schema = new mongoose.Schema({

  // Referencia al usuario que realizó la compra
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
    // ↑ index: true → Crea un índice en MongoDB sobre este campo.
    //   Los índices aceleran enormemente las consultas de búsqueda.
    //   Como frecuentemente buscamos "todas las órdenes de un usuario",
    //   indexar este campo hace que esa consulta sea O(log n) en vez de O(n).
    //   Sin índice, MongoDB tendría que revisar TODOS los documentos.
  },

  // Array de artículos comprados (subdocumentos usando el sub-esquema "item")
  items: {
    type: [item],          // [item] = array de subdocumentos con el esquema "item"
    required: true,
    validate: v => v.length >= 1 && v.length <= 50
    // ↑ Validación personalizada con función arrow:
    //   - Al menos 1 artículo (no se puede crear una orden vacía)
    //   - Máximo 50 artículos (protección contra pedidos absurdos)
  },

  // Total de la compra en centavos (suma de cantidad × precio de cada artículo)
  totalCentavos: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger
  },

  // Estado del ciclo de vida de la orden
  estado: {
    type: String,
    enum: ['comprada', 'devuelta'],  // Solo estos dos estados son válidos
    default: 'comprada',             // Al crear, siempre empieza como "comprada"
    required: true
  },

  // Fecha en la que se realizó la devolución (solo existe si estado === 'devuelta')
  devueltaEn: Date
  // ↑ Sin "required", porque solo se establece cuando se devuelve la orden.
  //   Mongoose acepta valores Date o null/undefined.

}, {
  timestamps: true
  // ↑ Agrega automáticamente:
  //   - createdAt: cuándo se hizo la compra
  //   - updatedAt: cuándo fue la última modificación (ej: cuando se devolvió)
});

export default mongoose.model('Order', schema);
