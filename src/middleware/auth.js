import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { HttpError } from './errors.js';

const options = { issuer: 'huella-tienda', audience: 'huella-api' };

export const issueToken = (id, secret) =>
  jwt.sign({}, secret, { ...options, subject: String(id), algorithm: 'HS256', expiresIn: '1h' });

export function authenticate(secret) {
  return (req, res, next) => {
    try {
      const token = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '')?.[1];
      const claims = jwt.verify(token, secret, { ...options, algorithms: ['HS256'] });
      if (!mongoose.isObjectIdOrHexString(claims.sub) || !Number.isInteger(claims.exp)) throw new Error();
      res.locals.userId = claims.sub;
    } catch {
      return next(new HttpError(401, 'Token ausente, inválido o vencido.'));
    }
    next();
  };
}
