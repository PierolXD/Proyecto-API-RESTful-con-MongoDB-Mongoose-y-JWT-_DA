import mongoose from 'mongoose';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';

try {
  const app = createApp(process.env.JWT_SECRET);
  await connectDatabase(process.env.MONGODB_URI);
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log('API Huella en el puerto ' + port));
  server.on('error', async error => {
    console.error('No se pudo abrir el puerto:', error.code ?? error.name);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
} catch (error) {
  console.error('No se pudo iniciar:', error.name === 'Error' ? error.message : error.name);
  await mongoose.disconnect();
  process.exitCode = 1;
}
