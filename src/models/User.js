// ============================================================================
// models/User.js — Esquema (Schema) de Mongoose para la colección "users"
// ============================================================================
// Mongoose es un ODM (Object-Document Mapper) que nos permite definir la
// estructura de los documentos de MongoDB usando JavaScript. Cada "Schema"
// describe qué campos tiene un documento, sus tipos, validaciones y opciones.
// Al exportar un "Model", obtenemos una interfaz para hacer CRUD (Create,
// Read, Update, Delete) sobre la colección correspondiente en MongoDB.
// ============================================================================

import mongoose from 'mongoose';
// ↑ Importamos mongoose usando la sintaxis ESM (ES Modules).
//   ESM usa "import/export" en lugar de "require/module.exports" (CommonJS).
//   Para que Node.js use ESM, el package.json tiene "type": "module".

// ── Definición del esquema ──────────────────────────────────────────────────
// mongoose.Schema() recibe un objeto con los campos y un segundo objeto
// con opciones globales del esquema.
const schema = new mongoose.Schema({

  // Campo "nombre": el nombre completo del usuario
  nombre: {
    type: String,          // Tipo de dato: cadena de texto
    required: true,        // Obligatorio: MongoDB rechaza documentos sin este campo
    trim: true,            // trim: elimina espacios al inicio y final automáticamente
    maxlength: 100         // Longitud máxima permitida: 100 caracteres
  },

  // Campo "email": correo electrónico del usuario
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,       // Convierte automáticamente a minúsculas antes de guardar
    unique: true,          // Crea un índice único en MongoDB → no puede haber dos
                           // usuarios con el mismo email. Si se intenta, MongoDB
                           // lanza un error con code 11000 (duplicate key).
    maxlength: 254,        // RFC 5321 limita emails a 254 caracteres
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    // ↑ Expresión regular (regex) que valida el formato básico de un email:
    //   - [^\s@]+ → uno o más caracteres que NO sean espacio ni @
    //   - @       → el símbolo arroba obligatorio
    //   - [^\s@]+ → el dominio (ej: "gmail")
    //   - \.      → un punto literal
    //   - [^\s@]+ → la extensión (ej: "com")
  },

  // Campo "passwordHash": el hash (cifrado) de la contraseña
  passwordHash: {
    type: String,
    required: true,
    select: false
    // ↑ select: false → MUY IMPORTANTE para seguridad.
    //   Cuando hacemos User.find() o User.findOne(), este campo NO se incluye
    //   en los resultados por defecto. Solo se puede obtener explícitamente con:
    //     User.findOne({ email }).select('+passwordHash')
    //   Esto evita que el hash de la contraseña se filtre accidentalmente
    //   en respuestas de la API o en logs.
  },

  // Campo "role": rol del usuario para control de acceso (RBAC)
  // Integrado del proyecto del compañero para distinguir administradores
  // de clientes normales.
  role: {
    type: String,
    enum: ['client', 'admin'],
    // ↑ enum: solo permite estos dos valores exactos.
    //   Si se intenta guardar otro valor (ej: "superuser"), Mongoose
    //   lanza un ValidationError automáticamente.
    default: 'client'
    // ↑ default: si no se envía un rol al registrarse, se asigna "client".
  }

}, {
  timestamps: true
  // ↑ timestamps: true → Mongoose agrega automáticamente dos campos:
  //   - createdAt: fecha/hora de creación del documento
  //   - updatedAt: fecha/hora de la última modificación
  //   Ambos se actualizan automáticamente, no hay que hacerlo manualmente.
});

// ── Exportar el modelo ──────────────────────────────────────────────────────
// mongoose.model('User', schema) hace dos cosas:
//   1. Registra el modelo con el nombre 'User' en Mongoose
//   2. Crea/conecta la colección "users" en MongoDB (nombre en minúsculas y plural)
// El modelo exportado (User) es lo que usamos en los controladores para
// hacer operaciones como User.create(), User.findOne(), User.find(), etc.
export default mongoose.model('User', schema);
