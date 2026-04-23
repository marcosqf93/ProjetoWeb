import express from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  usuario: z.string().optional(),
  senha: z.string().optional(),
  otp: z.string().optional(),
}).superRefine((val, ctx) => {
  const user = (val.email || val.user || val.usuario || '').trim();
  const password = (val.password || val.senha || '').trim();

  if (user.length < 5 || !user.includes('@')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'email inválido' });
  }
  if (password.length < 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'password/senha inválida' });
  }
});

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(120),
  role: z.enum(['alpha_admin', 'columnist']),
  adminSecret: z.string().optional(),
});

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(12), newPassword: z.string().min(8).max(120) });
const changeSchema = z.object({ currentPassword: z.string().min(3), newPassword: z.string().min(8).max(120) });
const googleSchema = z.object({ credential: z.string().min(20) });

const usersCache = [];
const registeredUsers = [];
const resetTokens = new Map();

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function generateColumnistId(name = '', fallback = 'columnist') {
  const base = String(name || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || fallback;
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

function withRegisteredUsers(defaultUsers = []) {
  return [...defaultUsers, ...registeredUsers];
}

async function getUsers() {
  if (usersCache.length) return withRegisteredUsers(usersCache);

  const adminUser = process.env.ALPHA_EMAIL || 'quintana.mqf@gmail.com';
  const adminPass = getRequiredEnv('ALPHA_PASS');
  const columnist1User = process.env.COL1_EMAIL || getRequiredEnv('COL1_USER');
  const columnist1Pass = getRequiredEnv('COL1_PASS');
  const columnist2User = process.env.COL2_EMAIL || getRequiredEnv('COL2_USER');
  const columnist2Pass = getRequiredEnv('COL2_PASS');

  const defaults = [
    { id: 1, name: 'Admin Alpha', username: adminUser, password: adminPass, role: 'alpha_admin', is2fa: true },
    { id: 2, name: 'Fulano', username: columnist1User, password: columnist1Pass, role: 'columnist', is2fa: false, columnistId: 'fulano' },
    { id: 3, name: 'Cicrano', username: columnist2User, password: columnist2Pass, role: 'columnist', is2fa: false, columnistId: 'cicrano' },
  ];

  for (const u of defaults) {
    usersCache.push({
      id: u.id,
      name: u.name,
      username: normalizeEmail(u.username),
      role: u.role,
      columnistId: u.columnistId || null,
      is2fa: u.is2fa,
      provider: 'password',
      password_hash: await argon2.hash(u.password),
    });
  }
  return withRegisteredUsers(usersCache);
}

async function findUserByEmail(email) {
  const users = await getUsers();
  return users.find((u) => normalizeEmail(u.username) === normalizeEmail(email));
}

function signSessionAndRespond(res, account) {
  const token = jwt.sign(
    { userId: account.id, role: account.role, username: account.username, email: account.username, columnistId: account.columnistId, name: account.name || '' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('session_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  return res.json({
    ok: true,
    role: account.role,
    columnistId: account.columnistId || null,
    username: account.username,
    email: account.username,
    name: account.name || '',
  });
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' });

  const user = normalizeEmail(parsed.data.email || parsed.data.user || parsed.data.usuario || '');
  const password = (parsed.data.password || parsed.data.senha || '').trim();
  const otp = (parsed.data.otp || '').trim();

  let account;
  try {
    account = await findUserByEmail(user);
  } catch (error) {
    return res.status(500).json({ error: 'Configuração de autenticação inválida no servidor', detail: error.message });
  }

  if (!account) return res.status(401).json({ error: 'Credenciais inválidas' });

  const ok = await argon2.verify(account.password_hash, password);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  if (account.is2fa) {
    if (!otp) return res.status(401).json({ error: 'Confirmação em 2 etapas necessária', code: 'OTP_REQUIRED' });
    const secret = process.env.ADMIN_2FA_SECRET;
    if (!secret) return res.status(500).json({ error: 'ADMIN_2FA_SECRET não configurado no servidor' });
    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: otp, window: 1 });
    if (!valid) return res.status(401).json({ error: 'Código do Authenticator inválido', code: 'OTP_INVALID' });
  }

  return signSessionAndRespond(res, account);
});

router.post('/google', async (req, res) => {
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para login Google' });
  if (!googleClient) return res.status(501).json({ error: 'Login Google não configurado no servidor (GOOGLE_CLIENT_ID ausente).' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email || '');
    if (!email) return res.status(400).json({ error: 'Conta Google sem e-mail válido.' });

    let account = await findUserByEmail(email);
    if (account && account.role === 'alpha_admin') {
      return res.status(403).json({ error: 'Login Google para Alpha Admin não permitido. Use e-mail/senha e 2FA.' });
    }

    if (!account) {
      account = {
        id: Date.now(),
        name: payload?.name || email.split('@')[0],
        username: email,
        role: 'columnist',
        columnistId: generateColumnistId(payload?.name || email.split('@')[0]),
        is2fa: false,
        provider: 'google',
        password_hash: await argon2.hash(crypto.randomBytes(24).toString('hex')),
      };
      registeredUsers.push(account);
    }

    return signSessionAndRespond(res, account);
  } catch (_error) {
    return res.status(401).json({ error: 'Falha ao validar token do Google.' });
  }
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para cadastro.' });

  const email = normalizeEmail(parsed.data.email);
  const exists = await findUserByEmail(email);
  if (exists) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });

  let role = parsed.data.role;
  if (role === 'alpha_admin') {
    const requiredSecret = process.env.ADMIN_SIGNUP_SECRET;
    if (!requiredSecret || parsed.data.adminSecret !== requiredSecret) {
      return res.status(403).json({ error: 'Cadastro Alpha exige chave administrativa válida.' });
    }
  }

  if (!['alpha_admin', 'columnist'].includes(role)) role = 'columnist';
  const newUser = {
    id: Date.now(),
    name: parsed.data.name,
    username: email,
    role,
    columnistId: role === 'columnist' ? generateColumnistId(parsed.data.name) : null,
    is2fa: role === 'alpha_admin',
    provider: 'password',
    password_hash: await argon2.hash(parsed.data.password),
  };

  registeredUsers.push(newUser);
  return res.status(201).json({ ok: true, user: { email: newUser.username, role: newUser.role, columnistId: newUser.columnistId } });
});

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'E-mail inválido.' });

  const email = normalizeEmail(parsed.data.email);
  const account = await findUserByEmail(email);

  if (account) {
    const token = crypto.randomBytes(24).toString('hex');
    resetTokens.set(token, { userId: account.id, expiresAt: Date.now() + 30 * 60 * 1000 });
    console.log(`[AUTH] Reset token para ${email}: ${token}`);
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ok: true, message: 'Token de redefinição gerado (ambiente dev).', devToken: token });
    }
  }

  return res.json({ ok: true, message: 'Se o e-mail existir, você receberá instruções de redefinição.' });
});

router.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para redefinição.' });

  const tokenData = resetTokens.get(parsed.data.token);
  if (!tokenData || tokenData.expiresAt < Date.now()) {
    resetTokens.delete(parsed.data.token);
    return res.status(400).json({ error: 'Token inválido ou expirado.' });
  }

  const users = await getUsers();
  const account = users.find((u) => u.id === tokenData.userId);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });

  account.password_hash = await argon2.hash(parsed.data.newPassword);
  account.provider = 'password';
  resetTokens.delete(parsed.data.token);

  return res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para alterar senha.' });

  const users = await getUsers();
  const account = users.find((u) => u.id === req.user?.userId);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });

  const valid = await argon2.verify(account.password_hash, parsed.data.currentPassword);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta.' });

  account.password_hash = await argon2.hash(parsed.data.newPassword);
  account.provider = 'password';
  return res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
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
