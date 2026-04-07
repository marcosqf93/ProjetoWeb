import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

function assertDb(res) {
  if (!pool) {
    res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL)' });
    return false;
  }
  return true;
}

function mapPrayer(row) {
  return {
    id: Number(row.id),
    nome: row.nome,
    celular: row.celular,
    mensagem: row.mensagem,
    createdAt: row.created_at,
  };
}

router.post('/prayer', async (req, res) => {
  const { nome, celular, mensagem, honeypot, recaptchaToken } = req.body || {};

  if (honeypot) return res.status(400).json({ error: 'Spam detectado' });
  if (!nome || !mensagem || !celular) return res.status(400).json({ error: 'Campos obrigatórios' });
  if (!assertDb(res)) return;

  const secret = process.env.RECAPTCHA_SECRET;
  if (secret) {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: recaptchaToken || '' }),
    });
    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: 'Falha no reCAPTCHA' });
  }

  await pool.query('INSERT INTO prayer_requests (nome, celular, mensagem) VALUES ($1, $2, $3)', [nome, celular, mensagem]);
  return res.status(201).json({ ok: true });
});

router.get('/prayer', async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query('SELECT * FROM prayer_requests ORDER BY created_at DESC');
  return res.json({ items: rows.map(mapPrayer) });
});

export default router;
