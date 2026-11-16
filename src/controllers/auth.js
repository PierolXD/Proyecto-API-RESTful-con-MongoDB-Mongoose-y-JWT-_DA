import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { issueToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

const publicUser = ({ _id, nombre, email }) => ({ id: _id, nombre, email });
const validPassword = p => typeof p === 'string' && p.length >= 8 && Buffer.byteLength(p) <= 72;
const cleanEmail = e => typeof e === 'string' ? e.trim().toLowerCase() : '';

export async function register(req, res) {
  const { nombre, email, password } = req.body ?? {};
  const address = cleanEmail(email);
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254 || !validPassword(password)) {
    throw new HttpError(400, 'Ingresa nombre, correo válido y contraseña de al menos 8 caracteres y hasta 72 bytes.');
  }
  const user = await User.create({ nombre, email: address, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ usuario: publicUser(user) });
}

export const login = secret => async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!cleanEmail(email) || !validPassword(password)) throw new HttpError(401, 'Credenciales incorrectas.');
  const user = await User.findOne({ email: cleanEmail(email) }).select('+passwordHash');
  if (!user || !await bcrypt.compare(password, user.passwordHash)) throw new HttpError(401, 'Credenciales incorrectas.');
  res.json({ token: issueToken(user.id, secret), usuario: publicUser(user) });
};
