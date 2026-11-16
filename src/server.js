// ============================================================================
// server.js — Punto de entrada principal para el inicio del servidor HTTP
// ============================================================================
// Este archivo se encarga del ciclo de vida del proceso del servidor:
//   1. Lee las variables de entorno (JWT_SECRET, MONGODB_URI, PORT).
//   2. Crea la aplicación Express invocando la fábrica createApp().
//   3. Conecta a la base de datos MongoDB verificando soporte de replica set.
//   4. Abre el puerto HTTP para comenzar a escuchar solicitudes de clientes.
//   5. Maneja errores de arranque y desconexión segura (graceful shutdown).
// ============================================================================

import mongoose from 'mongoose';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';

try {
  // ── Paso 1: Inicializar la aplicación Express ─────────────────────────────
  // Se le inyecta la clave secreta desde la variable de entorno JWT_SECRET.
  const app = createApp(process.env.JWT_SECRET);

  // ── Paso 2: Conectar a la base de datos MongoDB ───────────────────────────
  // Lee el URI desde process.env.MONGODB_URI (Atlas o Replica Set local).
  console.log('Conectando a MongoDB...');
  await connectDatabase(process.env.MONGODB_URI);
  console.log('Conexión a MongoDB establecida exitosamente.');

  // ── Paso 3: Abrir el puerto HTTP y escuchar peticiones ────────────────────
  // Por defecto usa el puerto 3000 si process.env.PORT no está definido.
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => {
    console.log(`====================================================`);
    console.log(` Servidor API Huella - Tienda Virtual Activo        `);
    console.log(` Puerto: http://localhost:${port}                    `);
    console.log(` Catálogo: http://localhost:${port}/api/products     `);
    console.log(`====================================================`);
  });

  // Manejador de errores si el puerto ya está ocupado (EADDRINUSE)
  server.on('error', async error => {
    console.error('No se pudo abrir el puerto:', error.code ?? error.name);
    await mongoose.disconnect();
    process.exitCode = 1;
  });

} catch (error) {
  // Captura cualquier error de inicialización (ej. falta MONGODB_URI o JWT_SECRET inválido)
  console.error('No se pudo iniciar el servidor:', error.name === 'Error' ? error.message : error.name);
  await mongoose.disconnect();
  process.exitCode = 1;
}
