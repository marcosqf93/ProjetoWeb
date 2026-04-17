import { pool } from '../db.js';

export function audit(action, entityType) {
  return async (req, res, next) => {
    res.on('finish', async () => {
      if (res.statusCode >= 400) return;
      try {
        await pool.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.user?.userId || null, action, entityType, req.params.id || null, req.ip, req.headers['user-agent'] || '']
        );
      } catch {
        // Falha de auditoria não deve quebrar request principal
      }
    });
    next();
  };
}
