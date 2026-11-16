// ============================================================================
// middleware/auth.js — Middleware de autenticación con JWT
// ============================================================================
// JWT (JSON Web Token) es un estándar para transmitir información de forma
// segura entre dos partes como un objeto JSON firmado digitalmente.
//
// Estructura de un JWT (3 partes separadas por puntos):
//   HEADER.PAYLOAD.SIGNATURE
//   ───────────────────────
//   eyJhbGciOiJI...  ←  Header:    algoritmo (HS256) y tipo (JWT)
//   eyJzdWIiOiI2...  ←  Payload:   datos del usuario (id, expiración, etc.)
//   SflKxwRJSMeK...  ←  Signature: firma digital (HMAC del header+payload con la clave secreta)
//
// Flujo de autenticación:
//   1. El usuario hace login → el servidor le devuelve un JWT firmado
//   2. El cliente guarda el JWT (localStorage, cookie, etc.)
//   3. En cada petición protegida, el cliente envía:
//        Authorization: Bearer eyJhbGciOiJI...
//   4. El middleware verifica la firma → si es válida, extrae el ID del usuario
//   5. Si el token es inválido, expirado, o ausente → responde 401
//
// ¿Por qué JWT y no sesiones?
//   - Las sesiones guardan estado en el servidor (requieren base de datos/memoria)
//   - Los JWT son "stateless": toda la info está en el token, el servidor
//     solo verifica la firma. Esto escala mejor para APIs REST.
// ============================================================================

import jwt from 'jsonwebtoken';
// ↑ Librería para crear y verificar JSON Web Tokens.

import mongoose from 'mongoose';
import { HttpError } from './errors.js';

// ── Opciones de emisión y verificación del JWT ──────────────────────────────
// issuer (iss): quién emitió el token (nuestra API)
// audience (aud): para quién está destinado el token
// Estas opciones se verifican al decodificar: si no coinciden, el token se rechaza.
// Es una capa extra de seguridad contra tokens de otras aplicaciones.
const options = { issuer: 'huella-tienda', audience: 'huella-api' };

// ── Función para CREAR un JWT ───────────────────────────────────────────────
/**
 * issueToken(id, secret)
 * ----------------------
 * Genera un token JWT firmado para un usuario autenticado.
 *
 * @param {string} id     - El _id del usuario en MongoDB
 * @param {string} secret - La clave secreta para firmar (de la variable de entorno)
 * @returns {string} El token JWT como cadena de texto
 *
 * jwt.sign(payload, secreto, opciones):
 *   - payload: datos a incluir (aquí usamos {} vacío porque los datos van en las opciones)
 *   - subject (sub): identificador del usuario → se extrae al verificar
 *   - algorithm: 'HS256' (HMAC con SHA-256) → algoritmo de firma
 *   - expiresIn: '1h' → el token expira en 1 hora (después hay que hacer login de nuevo)
 */
export const issueToken = (id, secret, role = 'client') =>
  jwt.sign({ role }, secret, { ...options, subject: String(id), algorithm: 'HS256', expiresIn: '1h' });
//                        ^^^^^^^^^^^
//                        Spread operator: copia issuer y audience de "options"
//                        y agrega subject, algorithm y expiresIn.

// ── Middleware para VERIFICAR un JWT ────────────────────────────────────────
/**
 * authenticate(secret)
 * --------------------
 * Devuelve un middleware de Express que verifica el token JWT.
 * Es una "factory function": se llama con el secreto y devuelve la función middleware.
 *
 * Uso en las rutas:
 *   const auth = authenticate(process.env.JWT_SECRET);
 *   router.get('/orders', auth, listOrders);
 *                         ^^^^
 *                         Este middleware se ejecuta ANTES del controlador.
 *                         Si el token es inválido, el controlador nunca se ejecuta.
 *
 * @param {string} secret - La clave secreta para verificar la firma
 * @returns {Function} Middleware de Express (req, res, next)
 */
export function authenticate(secret) {
  return (req, res, next) => {
    try {
      // ── Paso 1: Extraer el token del header Authorization ─────────
      // Formato esperado: "Bearer eyJhbGciOiJI..."
      // La regex captura lo que viene después de "Bearer " (con espacio)
      const token = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '')?.[1];
      //             ^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^
      //             Regex que busca "Bearer X"  Lee el header Authorization  Captura grupo 1 (el token)
      //                                                                     ?.[1] = optional chaining
      //                                                                     Si no hay match, devuelve undefined

      // ── Paso 2: Verificar la firma y decodificar ──────────────────
      // jwt.verify() hace varias comprobaciones:
      //   - ¿La firma es válida? (¿fue firmado con nuestra clave secreta?)
      //   - ¿El token ha expirado? (¿pasó más de 1 hora?)
      //   - ¿El algoritmo es HS256? (previene ataques de "algorithm confusion")
      //   - ¿El issuer y audience coinciden?
      // Si cualquiera falla, lanza una excepción que capturamos abajo.
      const claims = jwt.verify(token, secret, { ...options, algorithms: ['HS256'] });
      //                                                      ^^^^^^^^^^^^^^^^^^^^^
      //                                                      Whitelist de algoritmos aceptados.
      //                                                      NUNCA confiar en el algoritmo del header
      //                                                      (previene ataques de tipo "none" algorithm).

      // ── Paso 3: Validar el contenido del token ────────────────────
      // claims.sub contiene el ID del usuario (lo pusimos en issueToken)
      // Verificamos que sea un ObjectId válido de MongoDB y que tenga expiración
      if (!mongoose.isObjectIdOrHexString(claims.sub) || !Number.isInteger(claims.exp)) {
        throw new Error();
      }

      // ── Paso 4: Inyectar el ID del usuario en la petición ─────────
      // res.locals es un objeto que Express proporciona para compartir datos
      // entre middlewares y controladores dentro de la misma petición.
      // Los controladores pueden acceder a res.locals.userId para saber
      // quién es el usuario autenticado.
      res.locals.userId = claims.sub;
      res.locals.userRole = claims.role || 'client';

    } catch {
      // Si CUALQUIER cosa falla (token ausente, expirado, firma inválida,
      // formato incorrecto), respondemos con 401 Unauthorized.
      // No damos detalles específicos del error por seguridad.
      return next(new HttpError(401, 'Token ausente, inválido o vencido.'));
    }

    // ── Paso 5: Continuar al siguiente middleware/controlador ──────
    // next() sin argumentos = "todo bien, seguí adelante"
    next();
  };
}
