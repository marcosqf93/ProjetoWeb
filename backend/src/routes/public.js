import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { sendPrayerEmail } from '../utils/mailer.js';

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
    status: row.status || 'approved',
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

  await pool.query("INSERT INTO prayer_requests (nome, celular, mensagem, status) VALUES ($1, $2, $3, 'pending')", [nome, celular, mensagem]);
  sendPrayerEmail({ nome, celular, mensagem }).catch(() => {});
  return res.status(201).json({ ok: true });
});

router.get('/prayer', async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query("SELECT * FROM prayer_requests WHERE status = 'approved' ORDER BY created_at DESC");
  return res.json({ items: rows.map(mapPrayer) });
});

router.get('/prayer/all', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const { status } = req.query;
  let query = 'SELECT * FROM prayer_requests';
  const params = [];
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query += ' WHERE status = $1';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT 200';
  const { rows } = await pool.query(query, params);
  return res.json({ items: rows.map(mapPrayer) });
});

router.put('/prayer/:id/status', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const { rows } = await pool.query('UPDATE prayer_requests SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
  return res.json({ item: mapPrayer(rows[0]) });
});

router.delete('/prayer/:id', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const result = await pool.query('DELETE FROM prayer_requests WHERE id = $1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Pedido não encontrado' });
  return res.json({ ok: true });
});

router.get('/columnists', async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query(
    "SELECT id, name, email, columnist_id, photo_url, bio, created_at FROM users WHERE role = 'columnist' ORDER BY created_at DESC"
  );
  return res.json({
    items: rows.map((r) => ({
      id: r.columnist_id || String(r.id),
      dbId: Number(r.id),
      name: r.name,
      email: r.email,
      photo: r.photo_url || '',
      bio: r.bio || '',
      createdAt: r.created_at,
    })),
  });
});

router.get('/bible/:reference', async (req, res) => {
  try {
    const reference = req.params.reference;
    const https = await import('https');

    const fetchJson = (url, timeout = 8000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeout);
      https.get(url, (resp) => {
        let body = '';
        resp.on('data', (chunk) => { body += chunk; });
        resp.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(body)); } catch (_e) { reject(new Error('Parse error')); }
        });
      }).on('error', (err) => { clearTimeout(timer); reject(err); });
    });

    const slugMap = {
      'genesis': 'gn', 'exodus': 'ex', 'leviticus': 'lv', 'numbers': 'nm', 'deuteronomy': 'dt',
      'joshua': 'js', 'judges': 'jz', 'ruth': 'rt', '1samuel': '1sm', '2samuel': '2sm',
      '1kings': '1rs', '2kings': '2rs', '1chronicles': '1cr', '2chronicles': '2cr',
      'ezra': 'ed', 'nehemiah': 'ne', 'esther': 'et', 'job': 'job', 'psalms': 'sl',
      'proverbs': 'pv', 'ecclesiastes': 'ec', 'songofsolomon': 'ct', 'isaiah': 'is',
      'jeremiah': 'jr', 'lamentations': 'lm', 'ezekiel': 'ez', 'daniel': 'dn',
      'hosea': 'os', 'joel': 'joel', 'amos': 'am', 'obadiah': 'ob', 'jonah': 'jn',
      'micah': 'mq', 'nahum': 'na', 'habakkuk': 'hc', 'zephaniah': 'sf', 'haggai': 'ag',
      'zechariah': 'zc', 'malachi': 'ml', 'matthew': 'mt', 'mark': 'mc', 'luke': 'lc',
      'john': 'jo', 'acts': 'at', 'romans': 'rm', '1corinthians': '1co', '2corinthians': '2co',
      'galatians': 'gl', 'ephesians': 'ef', 'philippians': 'fp', 'colossenses': 'cl',
      '1thessalonians': '1ts', '2thessalonians': '2ts', '1timothy': '1tm', '2timothy': '2tm',
      'titus': 'tt', 'philemon': 'fm', 'hebrews': 'hb', 'james': 'tg', '1peter': '1pe',
      '2peter': '2pe', '1john': '1j', '2john': '2j', '3john': '3j', 'jude': 'jd', 'revelation': 'ap'
    };

    const parts = reference.split('+');
    const bookSlug = parts[0] || '';
    const chapter = parts[1] || '1';
    const abbrev = slugMap[bookSlug] || bookSlug;

    let data = null;
    try {
      data = await fetchJson(`https://www.abibliadigital.com.br/api/verses/acf/${abbrev}/${chapter}`);
    } catch (_e) {}

    if (!data || data.error) {
      try {
        data = await fetchJson(`https://bible-api.com/${reference}`);
      } catch (_e) {}
    }

    if (!data || data.error) {
      return res.status(502).json({ error: 'API bíblica indisponível no momento' });
    }

    return res.json(data);
  } catch (_err) {
    return res.status(500).json({ error: 'Erro ao comunicar com a API bíblica' });
  }
});

export default router;
