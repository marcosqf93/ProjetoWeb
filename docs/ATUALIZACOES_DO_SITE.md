# PODBEN — Quais arquivos devo mudar?

## Resposta rápida
Você **não precisa mudar tudo**. Normalmente, mude só estes arquivos:

1. **`data.js`**
   - Notícias, links, imagens, colunistas, colunas e estudos.

2. **`styles.css`**
   - Cores, fontes, espaçamento, botões, header/rodapé.

3. **`app.js`**
   - Comportamentos do site (login, comentários, leitura bíblica, editor do colunista, contador).

4. **HTML específico da página** (somente quando necessário)
   - `index.html` → Home e blocos principais.
   - `admin.html` → Tela de login.
  - `admin-dashboard.html` → Painel do Admin Alpha (publicar/editar/excluir notícias).
   - `colunista.html` → Timeline + editor do colunista.
   - `coluna.html` → Leitura da coluna + comentários.
  - `noticia.html` → Leitura da notícia + compartilhamento/comentários.
   - `noticias.html`, `galeria.html`, `estudos.html`, `quem-somos.html` → páginas de conteúdo.

## Quando mexer no backend
Mude `backend/*` só se for alterar:
- autenticação real,
- permissões (RBAC),
- API,
- segurança no servidor.

## Quando mexer em infra
Mude `infra/*` só para:
- deploy,
- domínio/SSL,
- Nginx,
- backup.

## Regra prática do dia a dia
- **Atualizar conteúdo** → `data.js`
- **Ajustar visual** → `styles.css`
- **Ajustar funcionalidade** → `app.js`
- **Tela específica** → HTML da página correspondente


## Dúvida comum: "altero somente CSS?"
**Nem sempre.**
- Se for só aparência (cor, fonte, espaçamento), sim: normalmente só `styles.css`.
- Se mudar comportamento (login, busca, comentários, publicação), altere também `app.js`.
- Se mudar estrutura/posição de elementos, altere o HTML da página correspondente.
