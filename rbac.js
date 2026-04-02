export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

export function canEditOwnColumn(req, res, next) {
  if (req.user.role === 'alpha_admin') return next();
  if (req.user.role === 'columnist' && String(req.user.userId) === String(req.params.authorId)) return next();
  return res.status(403).json({ error: 'Sem permissão para editar conteúdo de outro colunista' });
}
