# Segurança de rede e aplicação (PODBEN)

## O que já foi aplicado neste protótipo
- Cabeçalho CSP em `index.html` para restringir origens de scripts/imagens.
- Separação de papéis (Admin Alpha e colunistas) no frontend.

## O que deve ser implementado em produção (obrigatório)
1. **Backend com autenticação segura**
   - Nunca guardar senha em JavaScript/frontend.
   - Hash de senha com Argon2/Bcrypt + salt.
2. **HTTPS obrigatório + HSTS**
   - Certificado TLS válido e redirecionamento HTTP->HTTPS.
3. **Banco de dados com RBAC real**
   - Admin Alpha pode tudo; colunista apenas CRUD do próprio conteúdo.
4. **Proteções contra ataques comuns**
   - Rate limit no login, bloqueio progressivo, 2FA para admin.
   - Validação/sanitização de entrada no servidor (XSS/SQLi/CSRF).
   - WAF + firewall + atualização contínua do servidor.
5. **Logs e monitoramento**
   - Alertas de login suspeito, trilha de auditoria de edição.
6. **Backup e recuperação**
   - Backup diário criptografado + teste periódico de restore.

## Observação
A captura automática de nome/foto do Google exige OAuth com Google Identity Services e backend para validar token.

## Status de proteção atual deste repositório

**Resposta curta:** não. Do jeito atual, subir somente este código **não** deixa o site protegido contra invasão.

### O que ainda falta para produção segura
- Backend realmente em execução com banco, sem credenciais no front-end.
- 2FA para admin alpha e política forte de senha.
- Redis para lockout progressivo e controle de sessão revogável.
- WAF/CDN e firewall do servidor (somente portas 80/443 públicas).
- Pipeline de atualização e patching do sistema operacional.
- SIEM/alertas ativos para tentativa de brute force e alteração suspeita.
- Backup automatizado para armazenamento externo + teste real de restauração.

### Critério mínimo antes de publicar
Só considerar “protegido para produção” quando checklist de `docs/SEGURANCA_IMPLEMENTACAO.md` estiver 100% concluído e validado com pentest.
