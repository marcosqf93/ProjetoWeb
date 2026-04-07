import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { pool } from '../db.js';

const router = express.Router();
const schema = z.object({
  category: z.string().min(2),
  title: z.string().min(3),
  text: z.string().min(10),
  image: z.string().url().optional().or(z.literal('')),
  video: z.string().url().optional().or(z.literal('')),
  link: z.string().url().optional().or(z.literal('')),
});

function mapNews(row) {
  return {
    id: Number(row.id),
    category: row.category,
    title: row.title,
    text: row.text,
    image: row.image || '',
    video: row.video || '',
    link: row.link || '',
    source: row.source,
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertDb(res) {
  if (!pool) {
    res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL)' });
    return false;
  }
  return true;
}

router.get('/', async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query('SELECT * FROM news ORDER BY created_at DESC');
  return res.json({ items: rows.map(mapNews) });
});

router.get('/:id', async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { rows } = await pool.query('SELECT * FROM news WHERE id = $1 LIMIT 1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Notícia não encontrada' });
  return res.json({ item: mapNews(rows[0]) });
});

router.post('/', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' });
  if (!assertDb(res)) return;
  const payload = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO news (category, title, text, image, video, link)
     VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''))
     RETURNING *`,
    [payload.category, payload.title, payload.text, payload.image || '', payload.video || '', payload.link || '']
  );
  return res.status(201).json({ item: mapNews(rows[0]) });
});

router.put('/:id', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' });
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const payload = parsed.data;
  const { rows } = await pool.query(
    `UPDATE news
      SET category = $1, title = $2, text = $3,
          image = NULLIF($4, ''), video = NULLIF($5, ''), link = NULLIF($6, ''),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
    [payload.category, payload.title, payload.text, payload.image || '', payload.video || '', payload.link || '', id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Notícia não encontrada' });
  return res.json({ item: mapNews(rows[0]) });
});

router.delete('/:id', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const result = await pool.query('DELETE FROM news WHERE id = $1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Notícia não encontrada' });
  return res.json({ ok: true });
});

export default router;
