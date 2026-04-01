# PODBEN — Plano de implementação de segurança (produção)

Este documento mostra **como implementar** os 6 pilares de segurança no projeto PODBEN com exemplos práticos.

## Stack recomendada
- Backend: Node.js + Express
- Banco: PostgreSQL
- Cache/rate-limit/bloqueio: Redis
- Proxy reverso/TLS: Nginx
- Observabilidade: Loki/Promtail + Grafana (ou ELK)

---

## 1) Autenticação segura

### Regras
- Senhas **somente no backend**.
- Senhas com hash **Argon2id** (ou Bcrypt), com parâmetros fortes.
- Sessões por cookie `httpOnly`, `secure`, `sameSite=lax` (ou JWT com rotação e revogação).

### Fluxo
1. `POST /auth/register` (somente admin master em setup inicial).
2. Hash da senha no servidor com `argon2.hash(password)`.
3. `POST /auth/login` valida hash com `argon2.verify`.
4. Emite sessão/token com `role` e `userId`.

Veja implementação base em `backend/src/routes/auth.js`.

---

## 2) HTTPS obrigatório + HSTS

### Regras
- Redirecionar todo HTTP -> HTTPS (301).
- HSTS habilitado no domínio principal e subdomínios.

### Nginx
- Exemplo pronto: `infra/nginx.conf`.
- HSTS sugerido: `max-age=31536000; includeSubDomains; preload`.

---

## 3) RBAC real no banco

### Papéis
- `alpha_admin`: acesso total.
- `columnist`: CRUD apenas do próprio conteúdo.

### Regras de autorização
- Toda operação em coluna deve validar `column.author_id = req.user.id` para colunista.
- Alpha admin bypass autorizado.

Veja middlewares em `backend/src/middleware/auth.js` e `backend/src/middleware/rbac.js`.

---

## 4) Proteções contra ataques comuns

### Implementar
- `helmet` para headers de segurança.
- `rate-limit` em login e APIs sensíveis.
- Bloqueio progressivo por IP+usuário no Redis.
- 2FA (TOTP) obrigatório para `alpha_admin`.
- Validação de input com `zod`.
- Sanitização de HTML (comentários/colunas) com `sanitize-html`.
- Queries parametrizadas (sem SQL concatenado).
- CSRF para sessões por cookie.

Base do rate-limit já em `backend/src/server.js`.

---

## 5) Logs e monitoramento

### Logging obrigatório
- Login sucesso/falha
- Troca de senha
- Publicação/edição/exclusão de notícia/coluna
- Mudança de privilégios

### Auditoria
- Tabela `audit_logs` com `actor_id`, `action`, `entity_type`, `entity_id`, `ip`, `ua`, `created_at`.
- Middleware de auditoria: `backend/src/middleware/audit.js`.

---

## 6) Backup e recuperação

### Rotina
- Backup diário do PostgreSQL com `pg_dump`.
- Criptografia AES-256.
- Armazenamento externo (S3/Backblaze) + retenção 30 dias.
- Restore testado semanalmente em ambiente de homologação.

Script base: `infra/backup.sh`.

---

## Checklist final de go-live
- [ ] TLS ativo + HSTS validado
- [ ] Senhas com Argon2id
- [ ] 2FA ativo para admin alpha
- [ ] RBAC testado (colunista sem acesso global)
- [ ] Rate-limit + lockout funcionando
- [ ] WAF/CDN configurado
- [ ] Logs centralizados + alertas de incidente
- [ ] Backup/restauração testados
