// ============================================================================
// middleware/errors.js — Middleware centralizado de manejo de errores
// ============================================================================
// En Express, un middleware de errores se reconoce porque tiene 4 parámetros:
//   (error, req, res, next)
// Express lo invoca automáticamente cuando:
//   - Un controlador lanza una excepción (throw)
//   - Se llama a next(error) desde cualquier middleware
//
// Este archivo define:
//   1. HttpError: clase personalizada para errores con código HTTP
//   2. handleError: middleware que convierte errores en respuestas JSON
//
// Ventaja: los controladores no necesitan bloques try/catch individuales
// para cada error. Solo lanzan un HttpError y este middleware se encarga
// de enviar la respuesta apropiada al cliente.
// ============================================================================

// ── Clase HttpError ─────────────────────────────────────────────────────────
// Extiende la clase Error nativa de JavaScript para agregar un campo "status".
// Así podemos hacer: throw new HttpError(404, 'Producto no encontrado.')
// Y el middleware sabe que debe responder con HTTP 404.
export class HttpError extends Error {
  /**
   * @param {number} status - Código HTTP (400, 401, 404, 409, etc.)
   * @param {string} message - Mensaje descriptivo para el cliente
   */
  constructor(status, message) {
    super(message);        // Llama al constructor de Error con el mensaje
    this.status = status;  // Agrega la propiedad "status" que Error no tiene
  }
}

// ── Middleware de manejo de errores ─────────────────────────────────────────
/**
 * handleError(error, req, res, next)
 * -----------------------------------
 * Recibe cualquier error que ocurra en la aplicación y lo convierte
 * en una respuesta JSON con el código HTTP apropiado.
 *
 * Flujo de decisión:
 *   1. Si los headers ya se enviaron → delegar a Express (no podemos responder 2 veces)
 *   2. Si es un HttpError nuestro → usar su status y message
 *   3. Si es error de clave duplicada (code 11000) → 409 Conflict
 *   4. Si el body es demasiado grande → 413 Payload Too Large
 *   5. Si el JSON es inválido o falla la validación → 400 Bad Request
 *   6. Cualquier otro error → 500 Internal Server Error (genérico)
 *
 * IMPORTANTE: Nunca exponemos detalles internos (stack traces, nombres de
 * campos internos) al cliente. Solo mensajes genéricos y seguros.
 */
export function handleError(error, req, res, next) {
  // Si Express ya envió la respuesta HTTP (headers), no podemos enviar otra.
  // Delegamos al manejador por defecto de Express.
  if (res.headersSent) return next(error);

  // ── Error controlado (HttpError nuestro) ────────────────────────────
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  // ── Error de MongoDB: clave duplicada (code 11000) ──────────────────
  // Ocurre cuando se intenta insertar un documento con un campo unique
  // que ya existe (ej: email duplicado, SKU duplicado).
  if (error.code === 11000) {
    return res.status(409).json({ error: 'El registro ya existe.' });
  }

  // ── Error de Express: body demasiado grande ─────────────────────────
  // Nuestro app.js limita el body a 32kb. Si se excede, Express genera
  // este error automáticamente.
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Cuerpo demasiado grande.' });
  }

  // ── Error de parseo JSON o validación de Mongoose ───────────────────
  // entity.parse.failed: el JSON del body no es válido (ej: falta una coma)
  // ValidationError: un campo no cumple las validaciones del esquema
  if (error.type === 'entity.parse.failed' || error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Los datos enviados no son válidos.' });
  }

  // ── Error inesperado (bug, caída de la base de datos, etc.) ─────────
  // Lo registramos en consola para depuración pero NO lo exponemos al cliente.
  console.error('Error interno:', error.name, error.code ?? '');
  return res.status(500).json({ error: 'No se pudo completar la operación.' });
}
