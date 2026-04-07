import express from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';

const router = express.Router();
const loginSchema = z.object({ user: z.string().min(3), password: z.string().min(6) });

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' });

  const { user, password } = parsed.data;
  const result = await pool.query('SELECT id, username, password_hash, role, is_2fa_enabled FROM users WHERE username=$1', [user]);
  const account = result.rows[0];
  if (!account) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await argon2.verify(account.password_hash, password);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  // TODO: validar OTP TOTP quando is_2fa_enabled for true.
  const token = jwt.sign({ userId: account.id, role: account.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.cookie('session_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  return res.json({ ok: true, role: account.role });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('session_token');
  res.json({ ok: true });
});

export default router;
