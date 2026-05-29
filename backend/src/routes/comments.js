import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { sendNewCommentEmail } from '../utils/mailer.js';

const router = express.Router();

function assertDb(res) {
  if (!pool) {
    res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL)' });
    return false;
  }
  return true;
}

function mapComment(row) {
  return {
    id: Number(row.id),
    context: row.context,
    contextId: Number(row.context_id),
    authorName: row.author_name,
    authorPhoto: row.author_photo || '',
    authorUsername: row.author_username || null,
    content: row.content,
    status: row.status || 'approved',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res) => {
  if (!assertDb(res)) return;
  const { context, contextId } = req.query;
  if (!context || !contextId) return res.status(400).json({ error: 'context e contextId são obrigatórios' });
  if (!['news', 'column'].includes(context)) return res.status(400).json({ error: 'context inválido' });
  const { rows } = await pool.query(
    "SELECT * FROM comments WHERE context = $1 AND context_id = $2 AND status = 'approved' ORDER BY created_at DESC",
    [context, Number(contextId)]
  );
  return res.json({ items: rows.map(mapComment) });
});

router.get('/all', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const { status, context } = req.query;
  let query = 'SELECT * FROM comments';
  const params = [];
  const conditions = [];
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(status);
  }
  if (context && ['news', 'column'].includes(context)) {
    conditions.push(`context = $${params.length + 1}`);
    params.push(context);
  }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC LIMIT 200';
  const { rows } = await pool.query(query, params);
  return res.json({ items: rows.map(mapComment) });
});

router.get('/stats', requireAuth, requireRole('alpha_admin'), async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query(`SELECT status, COUNT(*)::int as count FROM comments GROUP BY status`);
  const stats = { pending: 0, approved: 0, rejected: 0 };
  rows.forEach((r) => { stats[r.status] = r.count; });
  return res.json(stats);
});

router.post('/', async (req, res) => {
  if (!assertDb(res)) return;
  const { context, contextId, authorName, authorPhoto, authorUsername, authorToken, content } = req.body || {};
  if (!context || !contextId || !authorName || !content) {
    return res.status(400).json({ error: 'Campos obrigatórios: context, contextId, authorName, content' });
  }
  if (!['news', 'column'].includes(context)) return res.status(400).json({ error: 'context inválido' });
  const trimmedContent = String(content).trim().slice(0, 5000);
  const trimmedName = String(authorName).trim().slice(0, 200);
  const trimmedPhoto = String(authorPhoto || '').trim().slice(0, 500);
  const trimmedUsername = String(authorUsername || '').trim().slice(0, 200) || null;
  const trimmedToken = String(authorToken || '').trim().slice(0, 200) || null;

  const { rows } = await pool.query(
    `INSERT INTO comments (context, context_id, author_name, author_photo, author_username, author_token, content, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
    [context, Number(contextId), trimmedName, trimmedPhoto, trimmedUsername, trimmedToken, trimmedContent]
  );

  let pageTitle = '';
  try {
    if (context === 'news') {
      const { rows: newsRows } = await pool.query('SELECT title FROM news WHERE id = $1', [Number(contextId)]);
      if (newsRows.length) pageTitle = newsRows[0].title;
    } else {
      const { rows: colRows } = await pool.query("SELECT title FROM columns WHERE id = $1", [Number(contextId)]);
      if (colRows.length) pageTitle = colRows[0].title;
    }
  } catch (_err) {}

  sendNewCommentEmail({ context, contextId: Number(contextId), authorName: trimmedName, content: trimmedContent, pageTitle }).catch(() => {});

  return res.status(201).json({ item: mapComment(rows[0]) });
});

router.put('/:id', async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { authorToken, content } = req.body || {};
  if (!content || !authorToken) return res.status(400).json({ error: 'content e authorToken obrigatórios' });

  const { rows } = await pool.query(
    `UPDATE comments SET content = $1, updated_at = NOW() WHERE id = $2 AND author_token = $3 RETURNING *`,
    [String(content).trim().slice(0, 5000), id, authorToken]
  );
  if (!rows.length) return res.status(403).json({ error: 'Não autorizado ou comentário não encontrado' });
  return res.json({ item: mapComment(rows[0]) });
});

router.put('/:id/status', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const { rows } = await pool.query(
    'UPDATE comments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Comentário não encontrado' });
  return res.json({ item: mapComment(rows[0]) });
});

router.delete('/:id', async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { authorToken } = req.body || {};
  if (authorToken) {
    const result = await pool.query('DELETE FROM comments WHERE id = $1 AND author_token = $2', [id, authorToken]);
    if (!result.rowCount) return res.status(403).json({ error: 'Não autorizado ou comentário não encontrado' });
    return res.json({ ok: true });
  }
  const result = await pool.query('DELETE FROM comments WHERE id = $1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Comentário não encontrado' });
  return res.json({ ok: true });
});

export default router;
