import express from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { hasDatabase, pool } from '../db.js';

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
const MAX_PROFILE_PHOTO_LENGTH = 900000;
const dataImagePrefix = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function uploadBufferToCloudinary(buffer, { folder, publicId, resourceType = 'image' }) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: resourceType, overwrite: true },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result?.secure_url || result?.url || '');
      }
    ).end(buffer);
  });
}

function isValidProfilePhoto(value) {
  if (!value) return true;
  const normalized = String(value).trim();
  if (!normalized) return true;
  if (normalized.length > MAX_PROFILE_PHOTO_LENGTH) return false;
  if (dataImagePrefix.test(normalized)) return true;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function storeProfilePhotoDataUrl(photoUrl, req, userId) {
  const raw = String(photoUrl || '').trim();
  if (!dataImagePrefix.test(raw)) return raw;
  const match = raw.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
  if (!match) return '';
  const buffer = Buffer.from(match[2], 'base64');
  if (hasCloudinaryConfig) {
    const cloudUrl = await uploadBufferToCloudinary(buffer, {
      folder: process.env.CLOUDINARY_PROFILE_FOLDER || 'podben/profiles',
      publicId: `user-${Number(userId) || 'x'}-${Date.now()}`,
      resourceType: 'image',
    });
    if (cloudUrl) return cloudUrl;
  }
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'profiles');
  await fs.mkdir(uploadsDir, { recursive: true });
  const fileName = `user-${Number(userId) || 'x'}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, fileName), buffer);
  const baseUrl = getPublicBaseUrl(req);
  return `${baseUrl}/uploads/profiles/${fileName}`;
}

async function storeMediaDataUrl(fileDataUrl, req, folder = 'gallery') {
  const raw = String(fileDataUrl || '').trim();
  const match = raw.match(/^data:(image\/(png|jpe?g|webp|gif)|video\/(mp4|webm|ogg));base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
  const body = match[4];
  const buffer = Buffer.from(body, 'base64');
  const maxBytes = mime.startsWith('image/') ? 8 * 1024 * 1024 : 40 * 1024 * 1024;
  if (buffer.length > maxBytes) return null;
  if (hasCloudinaryConfig) {
    const cloudUrl = await uploadBufferToCloudinary(buffer, {
      folder: process.env.CLOUDINARY_MEDIA_FOLDER || `podben/${folder}`,
      publicId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      resourceType: mime.startsWith('video/') ? 'video' : 'image',
    });
    if (cloudUrl) return { url: cloudUrl, mime };
  }
  const uploadsDir = path.resolve(process.cwd(), 'uploads', folder);
  await fs.mkdir(uploadsDir, { recursive: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, fileName), buffer);
  const baseUrl = getPublicBaseUrl(req);
  return { url: `${baseUrl}/uploads/${folder}/${fileName}`, mime };
}

function getPublicBaseUrl(req) {
  const envUrl = String(process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

const profileSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  photoUrl: z.string().optional().or(z.literal('')),
}).superRefine((value, ctx) => {
  if (!isValidProfilePhoto(value.photoUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['photoUrl'],
      message: 'Foto de perfil inválida. Use URL http(s) ou upload de imagem.',
    });
  }
});

const usersCache = [];
const registeredUsers = [];
const resetTokens = new Map();

let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

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

function adaptDbUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    username: normalizeEmail(row.email),
    password_hash: row.password_hash,
    role: row.role,
    columnistId: row.columnist_id || null,
    is2fa: Boolean(row.is_2fa),
    provider: row.provider || 'password',
    photoUrl: row.photo_url || '',
  };
}

async function dbFindUserByEmail(email) {
  if (!hasDatabase || !pool) return null;
  const result = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [normalizeEmail(email)]);
  return adaptDbUser(result.rows[0]);
}

async function dbCreateUser({ name, email, passwordHash, role, columnistId, is2fa, provider, photoUrl = '' }) {
  if (!hasDatabase || !pool) return null;
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, columnist_id, is_2fa, provider, photo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [name, normalizeEmail(email), passwordHash, role, columnistId, is2fa, provider || 'password', photoUrl]
  );
  return adaptDbUser(result.rows[0]);
}

async function dbUpsertProfileByEmail(currentEmail, { name, email, photoUrl, role, columnistId, is2fa, provider, passwordHash }) {
  if (!hasDatabase || !pool) return null;
  const lookup = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [normalizeEmail(currentEmail)]);
  if (!lookup.rows.length) {
    const byNewEmail = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [normalizeEmail(email)]);
    if (byNewEmail.rows.length) {
      const result = await pool.query(
        `UPDATE users
         SET name = $1, email = $2, photo_url = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [name, normalizeEmail(email), photoUrl || '', byNewEmail.rows[0].id]
      );
      return adaptDbUser(result.rows[0]);
    }
    try {
      const created = await dbCreateUser({
        name,
        email,
        passwordHash,
        role,
        columnistId: columnistId || null,
        is2fa: Boolean(is2fa),
        provider: provider || 'password',
        photoUrl: photoUrl || '',
      });
      return created;
    } catch (error) {
      if (String(error?.code || '') === '23505') {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [normalizeEmail(email)]);
        if (existing.rows.length) {
          const result = await pool.query(
            `UPDATE users
             SET name = $1, email = $2, photo_url = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [name, normalizeEmail(email), photoUrl || '', existing.rows[0].id]
          );
          return adaptDbUser(result.rows[0]);
        }
      }
      throw error;
    }
  }
  const userId = lookup.rows[0].id;
  const result = await pool.query(
    `UPDATE users
     SET name = $1, email = $2, photo_url = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [name, normalizeEmail(email), photoUrl || '', userId]
  );
  return adaptDbUser(result.rows[0]);
}

async function dbUpsertProfileById(userId, { name, email, photoUrl, role, columnistId, is2fa, provider, passwordHash }) {
  if (!hasDatabase || !pool) return null;
  const normalizedId = Number(userId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
  const lookup = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [normalizedId]);
  if (!lookup.rows.length) {
    const created = await dbCreateUser({
      name,
      email,
      passwordHash,
      role,
      columnistId: columnistId || null,
      is2fa: Boolean(is2fa),
      provider: provider || 'password',
      photoUrl: photoUrl || '',
    });
    return created;
  }
  const result = await pool.query(
    `UPDATE users
     SET name = $1, email = $2, photo_url = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [name, normalizeEmail(email), photoUrl || '', normalizedId]
  );
  return adaptDbUser(result.rows[0]);
}

async function dbUpdatePassword(email, passwordHash) {
  if (!hasDatabase || !pool) return false;
  await pool.query('UPDATE users SET password_hash = $1, provider = $2, updated_at = NOW() WHERE email = $3', [passwordHash, 'password', normalizeEmail(email)]);
  return true;
}

async function dbStoreResetToken(email, rawToken, expiresAt) {
  if (!hasDatabase || !pool) return false;
  const tokenHash = await argon2.hash(rawToken);
  await pool.query(
    'INSERT INTO password_reset_tokens (token_hash, user_email, expires_at) VALUES ($1,$2,$3)',
    [tokenHash, normalizeEmail(email), new Date(expiresAt)]
  );
  return true;
}

async function dbConsumeResetToken(rawToken) {
  if (!hasDatabase || !pool) return null;
  const rows = await pool.query(
    `SELECT id, token_hash, user_email, expires_at FROM password_reset_tokens
     WHERE used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 20`
  );
  for (const row of rows.rows) {
    const ok = await argon2.verify(row.token_hash, rawToken);
    if (!ok) continue;
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
    return normalizeEmail(row.user_email);
  }
  return null;
}

async function sendResetMail(email, token) {
  if (!mailTransporter) return false;
  const baseUrl = process.env.RESET_PASSWORD_BASE_URL || process.env.FRONTEND_ORIGIN || '';
  const safeBase = String(baseUrl || '').replace(/\/$/, '');
  const resetLink = safeBase ? `${safeBase}/admin.html?reset_token=${encodeURIComponent(token)}` : '';

  await mailTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'PODBEN - Recuperação de senha',
    text: resetLink
      ? `Use este link para redefinir sua senha: ${resetLink}`
      : `Use este token para redefinir sua senha: ${token}`,
    html: resetLink
      ? `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${resetLink}">Clique aqui para definir uma nova senha</a></p><p>Se não foi você, ignore este e-mail.</p>`
      : `<p>Seu token de redefinição é: <strong>${token}</strong></p>`,
  });
  return true;
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
  const dbUser = await dbFindUserByEmail(email);
  if (dbUser) return dbUser;
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
    photoUrl: account.photoUrl || '',
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
  const passwordHash = await argon2.hash(parsed.data.password);
  let newUser = {
    id: Date.now(),
    name: parsed.data.name,
    username: email,
    role,
    columnistId: role === 'columnist' ? generateColumnistId(parsed.data.name) : null,
    is2fa: role === 'alpha_admin',
    provider: 'password',
    password_hash: passwordHash,
    photoUrl: '',
  };

  if (hasDatabase && pool) {
    const dbUser = await dbCreateUser({
      name: parsed.data.name,
      email,
      passwordHash,
      role,
      columnistId: newUser.columnistId,
      is2fa: newUser.is2fa,
      provider: 'password',
      photoUrl: '',
    });
    if (dbUser) newUser = dbUser;
  } else {
    registeredUsers.push(newUser);
  }

  return res.status(201).json({ ok: true, user: { email: newUser.username, role: newUser.role, columnistId: newUser.columnistId } });
});

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'E-mail inválido.' });

  const email = normalizeEmail(parsed.data.email);
  const account = await findUserByEmail(email);

  if (account) {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 30 * 60 * 1000;

    if (hasDatabase && pool) await dbStoreResetToken(email, token, expiresAt);
    else resetTokens.set(token, { userId: account.id, expiresAt });

    const mailResult = await Promise.race([
      sendResetMail(email, token).then(() => 'sent'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 4000))
    ]);

    if (mailResult === 'sent') {
      return res.json({ ok: true, message: 'Enviamos um link de redefinição para seu e-mail.' });
    }

    sendResetMail(email, token).catch((err) => {
      console.error(`[AUTH] Falha ao enviar email para ${email}:`, err?.message || err);
    });
    console.log(`[AUTH] Reset token para ${email}: ${token}`);
  }

  return res.json({ ok: true, message: 'Token de recuperação gerado. Admin: verifique os logs do Render.' });
});

router.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para redefinição.' });

  let targetEmail = null;
  if (hasDatabase && pool) {
    targetEmail = await dbConsumeResetToken(parsed.data.token);
  } else {
    const tokenData = resetTokens.get(parsed.data.token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      resetTokens.delete(parsed.data.token);
      return res.status(400).json({ error: 'Token inválido ou expirado.' });
    }
    const users = await getUsers();
    const account = users.find((u) => u.id === tokenData.userId);
    targetEmail = account?.username || null;
    resetTokens.delete(parsed.data.token);
  }

  if (!targetEmail) return res.status(400).json({ error: 'Token inválido ou expirado.' });

  const passwordHash = await argon2.hash(parsed.data.newPassword);
  if (hasDatabase && pool) {
    await dbUpdatePassword(targetEmail, passwordHash);
  } else {
    const users = await getUsers();
    const account = users.find((u) => normalizeEmail(u.username) === normalizeEmail(targetEmail));
    if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });
    account.password_hash = passwordHash;
    account.provider = 'password';
  }

  return res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para alterar senha.' });

  const users = await getUsers();
  const account = users.find((u) => u.id === req.user?.userId) || await findUserByEmail(req.user?.email || '');
  if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });

  const valid = await argon2.verify(account.password_hash, parsed.data.currentPassword);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta.' });

  const passwordHash = await argon2.hash(parsed.data.newPassword);
  if (hasDatabase && pool) await dbUpdatePassword(account.username, passwordHash);
  else account.password_hash = passwordHash;

  account.provider = 'password';
  return res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
});

router.put('/profile', requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dados de perfil inválidos.' });

  const sessionUserId = Number(req.user?.userId);
  const users = await getUsers();
  let currentUser = users.find((u) => Number(u.id) === sessionUserId);
  if (!currentUser && req.user?.email) {
    currentUser = await findUserByEmail(req.user.email);
  }
  if (!currentUser) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const newEmail = normalizeEmail(parsed.data.email);
  const alreadyInUse = await findUserByEmail(newEmail);
  if (alreadyInUse && Number(alreadyInUse.id) !== sessionUserId) {
    return res.status(409).json({ error: 'Este e-mail já está em uso por outra conta.' });
  }

  let updatedUser = null;
  const normalizedPhotoUrl = await storeProfilePhotoDataUrl(parsed.data.photoUrl || '', req, sessionUserId);
  if (hasDatabase && pool) {
    updatedUser = await dbUpsertProfileById(sessionUserId || currentUser.id, {
      name: parsed.data.name,
      email: newEmail,
      photoUrl: normalizedPhotoUrl,
      role: currentUser.role,
      columnistId: currentUser.columnistId,
      is2fa: currentUser.is2fa,
      provider: currentUser.provider,
      passwordHash: currentUser.password_hash,
    });
  } else {
    currentUser.name = parsed.data.name;
    currentUser.username = newEmail;
    currentUser.photoUrl = normalizedPhotoUrl;
    updatedUser = currentUser;
  }

  return signSessionAndRespond(res, updatedUser || currentUser);
});

router.post('/upload-media', requireAuth, async (req, res) => {
  const payload = req.body || {};
  const stored = await storeMediaDataUrl(payload.fileDataUrl, req, 'gallery');
  if (!stored) return res.status(400).json({ error: 'Arquivo inválido. Envie imagem/vídeo compatível.' });
  return res.json({ ok: true, url: stored.url, mime: stored.mime });
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
