import express from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { z } from 'zod';

const router = express.Router();
const loginSchema = z.object({
  user: z.string().optional(),
  password: z.string().optional(),
  usuario: z.string().optional(),
  senha: z.string().optional(),
  otp: z.string().optional(),
}).superRefine((val, ctx) => {
  const user = (val.user || val.usuario || '').trim();
  const password = (val.password || val.senha || '').trim();

  if (user.length < 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'user/usuario inválido' });
  }
  if (password.length < 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'password/senha inválida' });
  }
});

const usersCache = [];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

async function getUsers() {
  if (usersCache.length) return usersCache;

  const adminUser = getRequiredEnv('ALPHA_USER');
  const adminPass = getRequiredEnv('ALPHA_PASS');
  const columnist1User = getRequiredEnv('COL1_USER');
  const columnist1Pass = getRequiredEnv('COL1_PASS');
  const columnist2User = getRequiredEnv('COL2_USER');
  const columnist2Pass = getRequiredEnv('COL2_PASS');

  const defaults = [
    { id: 1, username: adminUser, password: adminPass, role: 'alpha_admin', is2fa: true },
    { id: 2, username: columnist1User, password: columnist1Pass, role: 'columnist', is2fa: false, columnistId: 'fulano' },
    { id: 3, username: columnist2User, password: columnist2Pass, role: 'columnist', is2fa: false, columnistId: 'cicrano' },
  ];

  for (const u of defaults) {
    usersCache.push({
      id: u.id,
      username: u.username,
      role: u.role,
      columnistId: u.columnistId || null,
      is2fa: u.is2fa,
      password_hash: await argon2.hash(u.password),
    });
  }
  return usersCache;
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' });

  const user = (parsed.data.user || parsed.data.usuario || '').trim();
  const password = (parsed.data.password || parsed.data.senha || '').trim();
  const otp = parsed.data.otp;
  let users;
  try {
    users = await getUsers();
  } catch (error) {
    return res.status(500).json({ error: 'Configuração de autenticação inválida no servidor', detail: error.message });
  }

  const account = users.find((u) => u.username === user);
  if (!account) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await argon2.verify(account.password_hash, password);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  if (account.is2fa) {
    if (!otp) return res.status(401).json({ error: 'OTP obrigatório para Admin Alpha' });
    const secret = process.env.ADMIN_2FA_SECRET;
    if (!secret) return res.status(500).json({ error: 'ADMIN_2FA_SECRET não configurado no servidor' });
    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: otp, window: 1 });
    if (!valid) return res.status(401).json({ error: 'OTP inválido' });
  }

  const token = jwt.sign(
    { userId: account.id, role: account.role, username: account.username, columnistId: account.columnistId },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('session_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  return res.json({ ok: true, role: account.role, columnistId: account.columnistId || null, username: account.username });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user: data });
  } catch {
    res.status(401).json({ error: 'Sessão inválida' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('session_token');
  res.json({ ok: true });
});

export default router;
