// ============================================================================
// controllers/auth.js — Controlador de autenticación (registro y login)
// ============================================================================
// Un controlador en MVC contiene la "lógica de negocio": las reglas que
// definen cómo responde la aplicación a cada acción del usuario.
//
// Este controlador maneja dos acciones:
//   1. register: crear una cuenta nueva
//   2. login: iniciar sesión y obtener un token JWT
//
// Flujo de registro:
//   Cliente → POST /api/auth/register { nombre, email, password }
//   Servidor → valida datos → hashea contraseña → guarda en MongoDB → responde 201
//
// Flujo de login:
//   Cliente → POST /api/auth/login { email, password }
//   Servidor → busca usuario → compara hash → genera JWT → responde 200
// ============================================================================

import bcrypt from 'bcryptjs';
// ↑ bcryptjs: librería para hashear contraseñas de forma segura.
//   Hashear = convertir la contraseña en una cadena irreversible.
//   Ejemplo: "MiClave123" → "$2a$12$LJ3m4ys..." (no se puede revertir)
//   Esto significa que ni siquiera los administradores de la base de datos
//   pueden ver las contraseñas originales de los usuarios.

import User from '../models/User.js';
import { issueToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

// ── Funciones auxiliares (helpers) ──────────────────────────────────────────

/**
 * publicUser(user) — Extrae solo los campos seguros para enviar al cliente.
 * NUNCA enviamos el passwordHash ni otros campos internos en las respuestas.
 */
const publicUser = ({ _id, nombre, email, role }) => ({ id: _id, nombre, email, role });

/**
 * validPassword(p) — Verifica que la contraseña cumpla requisitos mínimos.
 * - Debe ser un string (no null, undefined, number, etc.)
 * - Al menos 8 caracteres (seguridad básica contra ataques de fuerza bruta)
 * - Máximo 72 bytes (límite técnico de bcrypt; más allá se trunca silenciosamente)
 */
const validPassword = p => typeof p === 'string' && p.length >= 8 && Buffer.byteLength(p) <= 72;

/**
 * cleanEmail(e) — Normaliza el email: elimina espacios y convierte a minúsculas.
 * "  Juan@Gmail.COM  " → "juan@gmail.com"
 * Si el valor no es un string, devuelve cadena vacía (para que falle la validación).
 */
const cleanEmail = e => typeof e === 'string' ? e.trim().toLowerCase() : '';

// ── Controlador de registro ─────────────────────────────────────────────────
/**
 * register(req, res)
 * ------------------
 * Crea una nueva cuenta de usuario.
 *
 * Body esperado (JSON):
 *   { "nombre": "Juan", "email": "juan@mail.com", "password": "MiClave123" }
 *
 * El registro público siempre crea una cuenta de cliente.
 *
 * Respuesta exitosa (201 Created):
 *   { "usuario": { "id": "...", "nombre": "Juan", "email": "juan@mail.com", "role": "client" } }
 */
export async function register(req, res) {
  // ── Extraer datos del body ────────────────────────────────────────────
  // req.body contiene el JSON que el cliente envió en la petición.
  // El operador ?? {} protege contra req.body siendo undefined (si no hay body).
  const { nombre, email, password } = req.body ?? {};
  const address = cleanEmail(email);

  // ── Validar todos los campos ──────────────────────────────────────────
  // Si alguna validación falla, lanzamos HttpError(400) y el middleware
  // de errores se encarga de enviar la respuesta apropiada.
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254 || !validPassword(password)) {
    throw new HttpError(400, 'Ingresa nombre, correo válido y contraseña de al menos 8 caracteres y hasta 72 bytes.');
  }

  // ── Hashear la contraseña ─────────────────────────────────────────────
  // bcrypt.hash(contraseña, saltRounds):
  //   - saltRounds = 12: cuántas "rondas" de cifrado aplicar.
  //     Más rondas = más seguro pero más lento.
  //     12 es un buen balance: toma ~250ms por hash (suficiente para frustrar
  //     ataques de fuerza bruta pero no tanto para molestar al usuario).
  //   - El "salt" es un valor aleatorio que se agrega para que dos usuarios
  //     con la misma contraseña tengan hashes diferentes.
  const hashedPassword = await bcrypt.hash(password, 12);

  // ── Crear el usuario en MongoDB ───────────────────────────────────────
  // User.create() inserta un nuevo documento en la colección "users".
  // Si el email ya existe, MongoDB lanza error code 11000 (duplicate key)
  // y nuestro middleware de errores lo convierte en HTTP 409 Conflict.
  const user = await User.create({
    nombre,
    email: address,
    passwordHash: hashedPassword,
    role: 'client'
  });

  // ── Responder con los datos públicos del usuario ──────────────────────
  // 201 = "Created" (se creó un recurso nuevo exitosamente)
  res.status(201).json({ usuario: publicUser(user) });
}

// ── Controlador de login ────────────────────────────────────────────────────
/**
 * login(secret)
 * -------------
 * Es una "factory function": recibe el secreto JWT y devuelve el controlador.
 * Esto permite que el secreto se inyecte desde la configuración sin usar
 * variables globales ni process.env dentro del controlador.
 *
 * Body esperado (JSON):
 *   { "email": "juan@mail.com", "password": "MiClave123" }
 *
 * Respuesta exitosa (200 OK):
 *   { "token": "eyJhbG...", "usuario": { "id": "...", ... } }
 *
 * @param {string} secret - Clave secreta para firmar el JWT
 * @returns {Function} Controlador async de Express
 */
export const login = secret => async (req, res) => {
  const { email, password } = req.body ?? {};

  // ── Validación rápida ─────────────────────────────────────────────────
  // Si el email o password no son válidos ni siquiera en formato,
  // respondemos 401 sin revelar cuál falló (seguridad).
  if (!cleanEmail(email) || !validPassword(password)) {
    throw new HttpError(401, 'Credenciales incorrectas.');
  }

  // ── Buscar al usuario por email ───────────────────────────────────────
  // .select('+passwordHash') es necesario porque definimos passwordHash
  // con select: false en el esquema. Sin esto, el campo sería undefined
  // y bcrypt.compare() siempre fallaría.
  const user = await User.findOne({ email: cleanEmail(email) }).select('+passwordHash');

  // ── Comparar la contraseña con el hash almacenado ─────────────────────
  // bcrypt.compare() toma la contraseña en texto plano y el hash guardado,
  // aplica el mismo proceso de hashing y compara los resultados.
  // Retorna true si coinciden, false si no.
  // Es "timing-safe": siempre tarda lo mismo para evitar ataques de temporización.
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    // ↑ Si el usuario no existe O la contraseña no coincide → mismo error genérico.
    //   NUNCA decimos "usuario no encontrado" vs "contraseña incorrecta"
    //   porque eso ayudaría a un atacante a enumerar emails válidos.
    throw new HttpError(401, 'Credenciales incorrectas.');
  }

  // ── Generar token JWT y responder ─────────────────────────────────────
  // issueToken() crea un JWT firmado con el ID del usuario.
  // El cliente debe guardar este token y enviarlo en cada petición protegida.
  res.json({ token: issueToken(user.id, secret, user.role), usuario: publicUser(user) });
};
