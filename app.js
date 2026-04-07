(function () {
  const data = window.PODBEN_DATA;
  const sessionKey = 'podben_session';
  const adminNewsKey = 'podben_admin_news';

  const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  const dateOnly = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const getAdminNews = () => JSON.parse(localStorage.getItem(adminNewsKey) || '[]');
  const setAdminNews = (items) => localStorage.setItem(adminNewsKey, JSON.stringify(items));

  function menuMobile() {
    const btn = document.getElementById('menu-toggle');
    const menu = document.getElementById('menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('open')) return;
      if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
    });
  }

  function injectSearchBar() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || document.getElementById('header-search')) return;

    const actions = document.createElement('div');
    actions.className = 'header-actions';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'header-search-wrap';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'search-trigger';
    trigger.innerHTML = '<span>Buscar</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 015.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z"/></svg>';

    const form = document.createElement('form');
    form.id = 'header-search';
    form.className = 'header-search hidden';
    form.innerHTML = '<input name="q" placeholder="Digite para buscar"/><button type="submit" aria-label="Buscar">OK</button>';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new FormData(form).get('q');
      window.location.href = `noticias.html?q=${encodeURIComponent(String(q || ''))}`;
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) form.querySelector('input')?.focus();
    });

    document.addEventListener('click', (e) => {
      if (!searchWrap.contains(e.target)) form.classList.add('hidden');
    });

    searchWrap.appendChild(trigger);
    searchWrap.appendChild(form);

    const latest = document.createElement('a');
    latest.className = 'latest-link';
    latest.href = 'noticias.html';
    latest.textContent = 'ÚLTIMAS NOTÍCIAS';

    const menuBtn = document.getElementById('menu-toggle');
    actions.appendChild(searchWrap);
    actions.appendChild(latest);
    if (menuBtn) actions.appendChild(menuBtn);
    topbar.appendChild(actions);
  }


  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    footer.innerHTML = `
      <div class="footer-grid">
        <section><h4>PODBEN</h4><p>Portal cristão com notícias, colunas e estudos bíblicos.</p></section>
        <section><h4>Menu</h4><ul><li><a href="index.html">Início</a></li><li><a href="noticias.html">Notícias</a></li><li><a href="colunistas.html">Colunistas</a></li><li><a href="estudos.html">Estudos</a></li></ul></section>
        <section><h4>Redes sociais</h4><div class="socials"><a href="https://www.youtube.com/@podbenaqui" target="_blank" rel="noreferrer" aria-label="YouTube"><img src="https://cdn-icons-png.flaticon.com/512/3670/3670147.png" alt="YouTube"/></a><a href="https://www.instagram.com/podbenaqui/" target="_blank" rel="noreferrer" aria-label="Instagram"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram"/></a><a href="https://wa.me/5567996248550" target="_blank" rel="noreferrer" aria-label="WhatsApp"><img src="https://cdn-icons-png.flaticon.com/512/154/154858.png" alt="WhatsApp"/></a></div></section>
      </div>`;
  }

  function renderVisitorCounter() {
    const el = document.getElementById('visitor-counter');
    if (!el) return;
    const key = 'podben_visitors';
    const count = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(count));
    el.textContent = count;
  }

  function allColumns() {
    const extras = JSON.parse(localStorage.getItem('podben_columns') || '[]');
    return [...data.columns, ...extras].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function allNews() {
    const locals = getAdminNews().map((n) => ({ ...n, local: true }));
    return [...locals, ...data.news].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderHome() {
    const news = document.getElementById('home-news');
    if (!news) return;

    allNews().slice(0, 4).forEach((n) => {
      const link = n.local ? `noticia.html?id=${n.id}` : n.link;
      const target = n.local ? '' : 'target="_blank" rel="noreferrer"';
      news.innerHTML += `<article class="news"><img src="${n.image}" alt="${n.title}" /><h3>${n.title}</h3><p>${n.summary || n.text}</p><p class="meta">${n.location || 'PODBEN'} • ${fmt(n.createdAt)}</p><a class="btn" href="${link}" ${target}>Ler notícia</a></article>`;
    });

    const cols = document.getElementById('home-columnists');
    data.columnists.forEach((c) => cols.innerHTML += `<article class="col-card"><img class="avatar" src="${c.photo}" alt="${c.name}"/><h3><a href="colunista.html?id=${c.id}">${c.name}</a></h3><p>${c.bio}</p></article>`);

    const photos = document.getElementById('home-photos');
    data.photos.slice(0, 4).forEach((p) => photos.innerHTML += `<article class="photo-item"><img src="${p.url}" alt="${p.caption}"/><p class="meta">${p.caption}</p></article>`);

    const testamentSelect = document.getElementById('testament-select');
    const bookSelect = document.getElementById('book-select');
    const chapterSelect = document.getElementById('chapter-select');
    if (testamentSelect && bookSelect && chapterSelect) {
      const fillBooks = () => { bookSelect.innerHTML = Object.keys(data.bible[testamentSelect.value]).map((b) => `<option value="${b}">${b}</option>`).join(''); fillChapters(); };
      const fillChapters = () => { const total = data.bible[testamentSelect.value][bookSelect.value] || 1; chapterSelect.innerHTML = Array.from({ length: total }).map((_, i) => `<option value="${i + 1}">Capítulo ${i + 1}</option>`).join(''); };
      const frame = document.getElementById('bible-frame');
      const updateFrame = () => { const u = `https://www.bibliaonline.com.br/acf/${encodeURIComponent(bookSelect.value)}/${chapterSelect.value}`; if (frame) frame.src = u; return u; };
      testamentSelect.addEventListener('change', () => { fillBooks(); updateFrame(); });
      bookSelect.addEventListener('change', () => { fillChapters(); updateFrame(); });
      chapterSelect.addEventListener('change', updateFrame);
      document.getElementById('open-bible')?.addEventListener('click', () => { const u = updateFrame(); if (!frame) window.open(u, '_blank'); });
      document.getElementById('prev-chapter')?.addEventListener('click', () => { const c = Number(chapterSelect.value || 1); if (c > 1) chapterSelect.value = String(c - 1); updateFrame(); });
      document.getElementById('next-chapter')?.addEventListener('click', () => { const total = data.bible[testamentSelect.value][bookSelect.value] || 1; const c = Number(chapterSelect.value || 1); if (c < total) chapterSelect.value = String(c + 1); updateFrame(); });
      fillBooks(); updateFrame();
    }

    const pedidoForm = document.getElementById('pedido-form');
    const pedidoComments = document.getElementById('pedido-comments');
    const comments = JSON.parse(localStorage.getItem('podben_prayer_comments') || '[]');
    const renderComments = () => { pedidoComments.innerHTML = ''; comments.forEach((c) => pedidoComments.innerHTML += `<article class="card"><strong>${c.nome}</strong> <span class="meta">(${c.celular}) • ${c.data}</span><p>${c.mensagem}</p></article>`); };
    pedidoForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const action = e.submitter?.value || 'comment';
      const fd = new FormData(pedidoForm);
      const payload = { nome: fd.get('nome'), celular: fd.get('celular'), mensagem: fd.get('mensagem'), data: fmt(new Date().toISOString()) };
      if (action === 'whatsapp') window.open(`https://wa.me/5567996248550?text=${encodeURIComponent(`Pedido de oração - PODBEN\nNome: ${payload.nome}\nCelular: ${payload.celular}\nMensagem: ${payload.mensagem}`)}`, '_blank');
      if (action === 'comment') { comments.unshift(payload); localStorage.setItem('podben_prayer_comments', JSON.stringify(comments)); renderComments(); }
      pedidoForm.reset();
    });
    renderComments();
  }

  function renderNoticias() {
    const wrap = document.getElementById('all-news');
    if (!wrap) return;
    const q = (new URLSearchParams(location.search).get('q') || '').toLowerCase();
    allNews().filter((n) => !q || n.title.toLowerCase().includes(q) || String(n.summary || n.text || '').toLowerCase().includes(q)).forEach((n) => {
      const link = n.local ? `noticia.html?id=${n.id}` : n.link;
      const target = n.local ? '' : 'target="_blank"';
      wrap.innerHTML += `<article class="news"><img src="${n.image}" alt="${n.title}"/><h3>${n.title}</h3><p>${n.summary || n.text}</p><p class="meta">${n.location || 'PODBEN'} • ${fmt(n.createdAt)} • ${n.source || 'PODBEN'}</p><a href="${link}" ${target}>Acessar notícia</a></article>`;
    });
  }

  function renderNoticiaDetalhe() {
    const article = document.getElementById('single-news');
    if (!article) return;
    const id = Number(new URLSearchParams(location.search).get('id'));
    const post = getAdminNews().find((n) => n.id === id);
    if (!post) { article.innerHTML = '<p>Notícia não encontrada.</p>'; return; }
    article.innerHTML = `<p class="meta">${post.category || 'Notícia'}</p><h1>${post.title}</h1><p>${post.text}</p>${post.video ? `<div class="video-wrap"><iframe src="${post.video}" allowfullscreen></iframe></div>` : ''}${post.link ? `<p><a href="${post.link}" target="_blank">Link relacionado</a></p>` : ''}<p class="meta">Publicado em ${fmt(post.createdAt)}</p><div class="share"><a class="btn-outline" href="https://wa.me/?text=${encodeURIComponent(post.title)}" target="_blank">WhatsApp</a><a class="btn-outline" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}" target="_blank">Facebook</a><a class="btn-outline" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(location.href)}" target="_blank">Twitter</a><a class="btn-outline" href="https://www.instagram.com/" target="_blank">Instagram</a></div>`;

    const key = `podben_news_comments_${id}`;
    const comments = JSON.parse(localStorage.getItem(key) || '[]');
    const list = document.getElementById('news-comments');
    const render = () => { list.innerHTML=''; comments.forEach((c)=> list.innerHTML += `<article class="card"><strong>${c.nome}</strong> <span class="meta">${c.data}</span><p>${c.texto}</p></article>`); };
    document.getElementById('news-comment-form')?.addEventListener('submit',(e)=>{e.preventDefault();const fd=new FormData(e.target);comments.unshift({nome:fd.get('nome'),texto:fd.get('texto'),data:fmt(new Date().toISOString())});localStorage.setItem(key,JSON.stringify(comments));e.target.reset();render();});
    render();
  }

  function renderGaleria() { const w = document.getElementById('all-photos'); if (!w) return; data.photos.forEach((p)=> w.innerHTML += `<article class="photo-item"><img src="${p.url}" alt="${p.caption}"/><p class="meta">${p.caption}</p></article>`); }
  function renderStudies() { const w = document.getElementById('studies'); if (!w) return; data.studies.forEach((s)=> w.innerHTML += `<article class="card"><img src="${s.cover}" alt="${s.title}" style="width:120px;height:155px;object-fit:cover;border-radius:8px"/><h3>${s.title}</h3><p>${s.bio}</p><a class="btn" href="${s.pdf}" target="_blank">Baixar PDF</a></article>`); }
  function renderColunistasList() { const w=document.getElementById('columnists'); if(!w) return; data.columnists.forEach((c)=>{const latest=allColumns().find((col)=>col.columnistId===c.id); w.innerHTML += `<article class="col-card"><img class="avatar" src="${c.photo}" alt="${c.name}"/><h3><a href="colunista.html?id=${c.id}">${c.name}</a></h3><p>${latest?latest.title:c.bio}</p></article>`;}); }

  function renderColunistaTimeline() {
    const wrap = document.getElementById('colunista-timeline'); const head = document.getElementById('colunista-head'); if (!wrap || !head) return;
    const id = new URLSearchParams(location.search).get('id'); const columnist = data.columnists.find((c) => c.id === id); if (!columnist) return;
    head.innerHTML = `<img class="avatar" src="${columnist.photo}" alt="${columnist.name}"/><div><h1>${columnist.name}</h1><p class="meta">${columnist.bio}</p></div>`;
    wrap.innerHTML = ''; allColumns().filter((c)=>c.columnistId===id).forEach((p)=> wrap.innerHTML += `<article class="timeline-item"><p class="meta">${dateOnly(p.createdAt)} • ${new Date(p.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p><h3><a href="coluna.html?id=${p.id}">${p.title}</a></h3></article>`);
  }

  function renderSingleColumn() { const article=document.getElementById('single-column'); if(!article) return; const id=Number(new URLSearchParams(location.search).get('id')); const post=allColumns().find((p)=>p.id===id); if(!post) return; const author=data.columnists.find((c)=>c.id===post.columnistId); article.innerHTML=`<div class="article-head"><div><p class="meta">${author?.name||'Colunista'}</p><h1>${post.title}</h1><p class="meta">Publicado em ${fmt(post.createdAt)}</p></div><button id="show-comment" class="btn-outline">Comentar</button></div><hr/><p>${post.content}</p>`; const formBox=document.getElementById('comment-form-box'); const list=document.getElementById('comments'); const key=`podben_col_comments_${id}`; const comments=JSON.parse(localStorage.getItem(key)||'[]'); document.getElementById('show-comment')?.addEventListener('click',()=>formBox.classList.toggle('hidden')); const render=()=>{list.innerHTML=''; comments.forEach((c)=>list.innerHTML += `<article class="comment card"><img class="avatar" src="${c.foto||'https://i.pravatar.cc/90?img=3'}" alt="${c.nome}"/><div><strong>${c.nome}</strong><p class="meta">${c.data}</p><p>${c.texto}</p></div></article>`);}; document.getElementById('comment-form')?.addEventListener('submit',(e)=>{e.preventDefault();const fd=new FormData(e.target);comments.unshift({nome:fd.get('nome'),foto:fd.get('foto'),texto:fd.get('texto'),data:fmt(new Date().toISOString())});localStorage.setItem(key,JSON.stringify(comments));e.target.reset();render();}); render(); }

  function renderColumnistEditor() {
    const panel = document.getElementById('editor-panel'); if (!panel) return;
    const columnistId = new URLSearchParams(location.search).get('id'); const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (!session || session.role !== 'columnist' || session.columnistId !== columnistId) return; panel.classList.remove('hidden');
    const ownPosts = document.getElementById('own-posts');
    const renderOwn = () => { const extras = JSON.parse(localStorage.getItem('podben_columns')||'[]').filter((p)=>p.columnistId===columnistId); ownPosts.innerHTML=''; extras.forEach((p)=> ownPosts.innerHTML += `<article class="card"><input value="${p.title}" data-id="${p.id}" data-field="title"/><textarea data-id="${p.id}" data-field="content">${p.content}</textarea><div class="row-actions"><button class="save-post" data-id="${p.id}">Salvar edição</button><button class="delete-post" data-id="${p.id}">Excluir</button></div></article>`); };
    document.getElementById('post-form')?.addEventListener('submit',(e)=>{e.preventDefault();const fd=new FormData(e.target);const extras=JSON.parse(localStorage.getItem('podben_columns')||'[]');extras.unshift({id:Date.now(),columnistId,title:fd.get('titulo'),content:fd.get('conteudo'),createdAt:new Date().toISOString()});localStorage.setItem('podben_columns',JSON.stringify(extras));e.target.reset();renderOwn();renderColunistaTimeline();});
    document.addEventListener('click',(e)=>{if(e.target.classList.contains('delete-post')){const id=Number(e.target.dataset.id);let extras=JSON.parse(localStorage.getItem('podben_columns')||'[]');extras=extras.filter((p)=>p.id!==id||p.columnistId!==columnistId);localStorage.setItem('podben_columns',JSON.stringify(extras));renderOwn();renderColunistaTimeline();} if(e.target.classList.contains('save-post')){const id=Number(e.target.dataset.id);const title=document.querySelector(`input[data-id="${id}"][data-field="title"]`)?.value||'';const content=document.querySelector(`textarea[data-id="${id}"][data-field="content"]`)?.value||'';const extras=JSON.parse(localStorage.getItem('podben_columns')||'[]').map((p)=>(p.id===id&&p.columnistId===columnistId?{...p,title,content}:p));localStorage.setItem('podben_columns',JSON.stringify(extras));renderOwn();renderColunistaTimeline();}});
    renderOwn();
  }

  function renderAdmin() {
    const form = document.getElementById('login-form'); if (!form) return;
    const info = document.getElementById('login-info');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const found = data.users.find((u) => u.user === fd.get('usuario') && u.pass === fd.get('senha'));
      if (!found) return (info.textContent = 'Credenciais inválidas.');
      localStorage.setItem(sessionKey, JSON.stringify(found));
      if (found.role === 'columnist') return window.location.href = `colunista.html?id=${found.columnistId}`;
      if (found.role === 'alpha') return window.location.href = 'admin-dashboard.html';
      window.location.href = 'index.html';
    });
  }

  function renderAdminDashboard() {
    const form = document.getElementById('admin-news-form');
    if (!form) return;
    const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (!session || session.role !== 'alpha') {
      window.location.href = 'admin.html';
      return;
    }
    const list = document.getElementById('admin-news-list');
    const render = () => {
      const items = getAdminNews();
      list.innerHTML = '';
      items.forEach((n) => {
        list.innerHTML += `<article class="card admin-news-item"><div class="admin-edit-grid"><input value="${n.title}" data-id="${n.id}" data-field="title"/><textarea data-id="${n.id}" data-field="text">${n.text}</textarea><input value="${n.image || ''}" data-id="${n.id}" data-field="image"/><input value="${n.video || ''}" data-id="${n.id}" data-field="video"/><input value="${n.link || ''}" data-id="${n.id}" data-field="link"/></div><div class="row-actions"><button class="save-news" data-id="${n.id}">Salvar edição</button><button class="delete-news" data-id="${n.id}">Excluir</button><a class="btn-outline" href="noticia.html?id=${n.id}" target="_blank">Visualizar</a></div></article>`;
      });
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const items = getAdminNews();
      items.unshift({
        id: Date.now(),
        title: fd.get('title'),
        text: fd.get('text'),
        image: fd.get('image') || 'https://picsum.photos/seed/noticia/900/500',
        video: fd.get('video'),
        link: fd.get('link'),
        category: fd.get('category'),
        createdAt: new Date().toISOString(),
        source: 'PODBEN',
        location: 'Aquidauana/MS'
      });
      setAdminNews(items);
      form.reset();
      render();
    });

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-news')) {
        const id = Number(e.target.dataset.id);
        setAdminNews(getAdminNews().filter((n) => n.id !== id));
        render();
      }
      if (e.target.classList.contains('save-news')) {
        const id = Number(e.target.dataset.id);
        const val = (field) => document.querySelector(`[data-id="${id}"][data-field="${field}"]`)?.value || '';
        const items = getAdminNews().map((n) => n.id === id ? { ...n, title: val('title'), text: val('text'), image: val('image'), video: val('video'), link: val('link') } : n);
        setAdminNews(items);
        render();
      }
    });

    document.getElementById('admin-logout')?.addEventListener('click', () => {
      localStorage.removeItem(sessionKey);
      window.location.href = 'admin.html';
    });

    render();
  }

  menuMobile();
  injectSearchBar();
  renderFooter();
  renderVisitorCounter();
  renderHome();
  renderNoticias();
  renderNoticiaDetalhe();
  renderGaleria();
  renderStudies();
  renderColunistasList();
  renderColunistaTimeline();
  renderSingleColumn();
  renderColumnistEditor();
  renderAdmin();
  renderAdminDashboard();
})();
