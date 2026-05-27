import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { pool } from '../db.js';

const router = express.Router();

const schema = z.object({
  title: z.string().min(3),
  category: z.string().min(2),
  bio: z.string().optional().default(''),
  content: z.string().optional().default(''),
  cover: z.string().optional().default(''),
  pdf: z.string().optional().default(''),
  author: z.string().optional().default('PODBEN'),
  status: z.enum(['published', 'draft']).optional().default('published'),
  createdAt: z.string().optional().default(''),
});

function mapStudy(row) {
  return {
    id: Number(row.id),
    title: row.title,
    category: row.category,
    bio: row.bio || '',
    content: row.content || '',
    cover: row.cover || '',
    pdf: row.pdf || '',
    author: row.author || 'PODBEN',
    status: row.status || 'published',
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
  const { rows } = await pool.query('SELECT * FROM studies ORDER BY created_at DESC');
  return res.json({ items: rows.map(mapStudy) });
});

router.get('/:id', async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { rows } = await pool.query('SELECT * FROM studies WHERE id = $1 LIMIT 1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Estudo não encontrado' });
  return res.json({ item: mapStudy(rows[0]) });
});

router.post('/', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', detail: parsed.error.flatten() });
  if (!assertDb(res)) return;
  const p = parsed.data;
  const createdAt = p.createdAt || new Date().toISOString();
  const { rows } = await pool.query(
    `INSERT INTO studies (title, category, bio, content, cover, pdf, author, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [p.title, p.category, p.bio, p.content, p.cover, p.pdf, p.author, p.status, createdAt]
  );
  return res.status(201).json({ item: mapStudy(rows[0]) });
});

router.put('/:id', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', detail: parsed.error.flatten() });
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const p = parsed.data;
  const { rows } = await pool.query(
    `UPDATE studies
      SET title = $1, category = $2, bio = $3, content = $4,
          cover = $5, pdf = $6, author = $7, status = $8,
          created_at = $9, updated_at = NOW()
      WHERE id = $10
      RETURNING *`,
    [p.title, p.category, p.bio, p.content, p.cover, p.pdf, p.author, p.status, p.createdAt || new Date().toISOString(), id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Estudo não encontrado' });
  return res.json({ item: mapStudy(rows[0]) });
});

router.delete('/:id', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const result = await pool.query('DELETE FROM studies WHERE id = $1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Estudo não encontrado' });
  return res.json({ ok: true });
});

router.delete('/', requireAuth, requireRole('alpha_admin'), async (_req, res) => {
  if (!assertDb(res)) return;
  const result = await pool.query('DELETE FROM studies');
  return res.json({ ok: true, deleted: result.rowCount || 0 });
});

export default router;
