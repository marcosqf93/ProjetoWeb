(function () {
  const data = window.PODBEN_DATA;
  const sessionKey = 'podben_profile';
  const API_BASE = window.PODBEN_API_BASE || '/api';
  const adminNewsKey = 'podben_admin_news';
  const adminStudiesKey = 'podben_admin_studies';
  const adminGalleryKey = 'podben_admin_gallery';
  const normalizeSession = (session) => {
    if (!session) return null;
    return {
      role: session.role || 'columnist',
      columnistId: session.columnistId || null,
      username: session.username || session.email || '',
      email: session.email || session.username || '',
      name: session.name || session.username || 'Usuário',
      photoUrl: session.photoUrl || '',
      bio: session.bio || '',
    };
  };
  const getSession = () => normalizeSession(JSON.parse(localStorage.getItem(sessionKey) || 'null'));
  const saveSession = (session) => localStorage.setItem(sessionKey, JSON.stringify(normalizeSession(session)));
  const commentAuthorKey = 'podben_comment_author_token';
  const googleCommentProfileKey = 'podben_google_comment_profile';
  const GOOGLE_CLIENT_ID = window.PODBEN_GOOGLE_CLIENT_ID || '';
  let googleScriptPromise = null;
  let googleInitDone = false;
  let pendingGoogleForm = null;
  let googlePromptAttempted = false;
  const getCommentAuthorToken = () => {
    let token = localStorage.getItem(commentAuthorKey);
    if (!token) {
      token = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(commentAuthorKey, token);
    }
    return token;
  };
  const decodeJwtPayload = (token) => {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = decodeURIComponent(atob(base64).split('').map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join(''));
      return JSON.parse(payload);
    } catch (_err) {
      return null;
    }
  };
  const saveGoogleCommentProfile = (profile) => localStorage.setItem(googleCommentProfileKey, JSON.stringify(profile));
  const getGoogleCommentProfile = () => JSON.parse(localStorage.getItem(googleCommentProfileKey) || 'null');
  const ensureGoogleScript = () => {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services'));
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  };
  const applyGoogleProfileToForm = (form, profile) => {
    if (!form || !profile) return;
    const nameInput = form.querySelector('input[name="nome"]');
    if (nameInput) {
      nameInput.value = profile.name || '';
      nameInput.readOnly = true;
      nameInput.dataset.googleLocked = '1';
    }
    let photoInput = form.querySelector('input[name="foto"]');
    if (!photoInput && profile.picture) {
      photoInput = document.createElement('input');
      photoInput.type = 'hidden';
      photoInput.name = 'foto';
      form.appendChild(photoInput);
    }
    if (photoInput && profile.picture) photoInput.value = profile.picture;
    const status = form.parentElement?.querySelector('.google-comment-status');
    if (status) status.textContent = `Comentando como ${profile.name}`;
  };
  const applyGoogleProfileToAllForms = (profile) => {
    document.querySelectorAll('#comment-form, #news-comment-form').forEach((form) => {
      applyGoogleProfileToForm(form, profile);
    });
  };
  const initGoogleIdentity = async () => {
    if (!GOOGLE_CLIENT_ID) return false;
    await ensureGoogleScript();
    if (!googleInitDone) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: true,
        callback: (response) => {
          const payload = decodeJwtPayload(response.credential);
          if (!payload) return;
          const profile = { name: payload.name || '', picture: payload.picture || '' };
          saveGoogleCommentProfile(profile);
          if (pendingGoogleForm) applyGoogleProfileToForm(pendingGoogleForm, profile);
          applyGoogleProfileToAllForms(profile);
        },
      });
      googleInitDone = true;
    }
    if (!googlePromptAttempted) {
      window.google.accounts.id.prompt();
      googlePromptAttempted = true;
    }
    return true;
  };
  const enhanceGoogleComments = () => {
    // Login com Google para comentários desativado por decisão de produto.
    return;
  };

  const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  const dateOnly = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const getAdminNews = () => JSON.parse(localStorage.getItem(adminNewsKey) || '[]');
  const setAdminNews = (items) => localStorage.setItem(adminNewsKey, JSON.stringify(items));
  const getAdminStudies = () => JSON.parse(localStorage.getItem(adminStudiesKey) || '[]');
  const setAdminStudies = (items) => localStorage.setItem(adminStudiesKey, JSON.stringify(items));

  let remoteStudiesCache = [];
  let remoteStudiesLoaded = false;

  async function fetchRemoteStudies() {
    try {
      const resp = await fetch(`${API_BASE}/studies`, { credentials: 'include' });
      if (!resp.ok) return;
      const dataResp = await resp.json().catch(() => ({}));
      if (Array.isArray(dataResp.items)) {
        remoteStudiesCache = dataResp.items.map((s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          bio: s.bio || '',
          content: s.content || '',
          cover: s.cover || '',
          pdf: s.pdf || '',
          author: s.author || 'PODBEN',
          status: s.status || 'published',
          createdAt: s.createdAt,
        }));
        remoteStudiesLoaded = true;
      }
    } catch (_err) {}
  }

  async function apiCreateStudy(payload) {
    const resp = await fetch(`${API_BASE}/studies`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao criar estudo');
    }
    const result = await resp.json();
    remoteStudiesCache.unshift(result.item);
    return result.item;
  }

  async function apiUpdateStudy(id, payload) {
    const resp = await fetch(`${API_BASE}/studies/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar estudo');
    }
    const result = await resp.json();
    remoteStudiesCache = remoteStudiesCache.map((s) => s.id === id ? result.item : s);
    return result.item;
  }

  async function apiDeleteStudy(id) {
    const resp = await fetch(`${API_BASE}/studies/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao excluir estudo');
    }
    remoteStudiesCache = remoteStudiesCache.filter((s) => s.id !== id);
  }

  let remoteColumnistsCache = null;

  async function fetchRemoteColumnists() {
    try {
      const resp = await fetch(`${API_BASE}/public/columnists`);
      if (!resp.ok) return;
      const dataResp = await resp.json().catch(() => ({}));
      if (Array.isArray(dataResp.items)) {
        const dbColumnists = dataResp.items.map((c) => ({
          id: c.id,
          name: c.name,
          photo: c.photo || 'https://i.pravatar.cc/240?img=3',
          bio: c.bio || 'Colunista PODBEN',
        }));
        const existingIds = new Set(data.columnists.map((c) => c.id));
        const newColumnists = dbColumnists.filter((c) => !existingIds.has(c.id));
        remoteColumnistsCache = [...data.columnists, ...newColumnists];
      }
    } catch (_err) {}
  }

  function allColumnists() {
    return remoteColumnistsCache || data.columnists;
  }
  const getAdminGallery = () => JSON.parse(localStorage.getItem(adminGalleryKey) || '[]');
  const setAdminGallery = (items) => localStorage.setItem(adminGalleryKey, JSON.stringify(items));
  const toEmbedVideo = (url = '') => {
    const text = String(url || '').trim();
    if (!text) return '';
    if (text.includes('youtube.com/embed/')) return text;
    const ytMatch = text.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    return text;
  };
  const allGalleryItems = () => {
    const base = (data.photos || []).map((photo, index) => ({
      ...photo,
      id: photo.id || Number(`1${index + 1}`),
      title: photo.title || photo.caption || `Registro PODBEN ${index + 1}`,
      caption: photo.caption || photo.title || 'Registro do portal PODBEN',
      category: photo.category || 'Momentos especiais',
      mediaType: photo.mediaType || 'image',
      createdAt: photo.createdAt || new Date(Date.now() - index * 86400000).toISOString(),
      legend: photo.legend || 'Clique para abrir a visualização ampliada.',
    }));
    return [...getAdminGallery(), ...base];
  };
  const normalizePdfPath = (file) => (file ? `estudos/${String(file.name || 'arquivo.pdf').replace(/\s+/g, '-').toLowerCase()}` : '');
  const bindPdfUploadButton = (fileInput, targetInput) => {
    if (!fileInput || !targetInput || fileInput.dataset.bound === '1') return;
    fileInput.dataset.bound = '1';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      targetInput.value = normalizePdfPath(file);
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const editorSelectionRanges = new Map();
  const rememberSelectionFor = (richId) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    editorSelectionRanges.set(richId, selection.getRangeAt(0).cloneRange());
  };
  const restoreSelectionFor = (richId) => {
    const saved = editorSelectionRanges.get(richId);
    const selection = window.getSelection();
    if (!saved || !selection) return;
    selection.removeAllRanges();
    selection.addRange(saved);
  };
  const enhanceRichEditors = () => {
    document.querySelectorAll('.text-toolbar').forEach((toolbar) => {
      const targetId = toolbar.dataset.target;
      const textarea = targetId ? document.getElementById(targetId) : null;
      if (!textarea || textarea.dataset.richReady === '1') return;
      const rich = document.createElement('div');
      rich.id = `${targetId}-rich`;
      rich.className = 'rich-editor-surface';
      rich.contentEditable = 'true';
      rich.innerHTML = textarea.value || '';
      textarea.style.display = 'none';
      textarea.dataset.richReady = '1';
      textarea.dataset.richId = rich.id;
      rich.addEventListener('input', () => { textarea.value = rich.innerHTML; });
      rich.addEventListener('mouseup', () => rememberSelectionFor(rich.id));
      rich.addEventListener('keyup', () => rememberSelectionFor(rich.id));
      rich.addEventListener('focus', () => rememberSelectionFor(rich.id));
      toolbar.insertAdjacentElement('afterend', rich);
    });
  };

  const showToast = (message, type = 'info') => {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toast-out .3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  function menuMobile() {
    const btn = document.getElementById('menu-toggle');
    const menu = document.getElementById('menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
      if (menu.classList.contains('open')) {
        document.querySelectorAll('.account-dropdown').forEach((dropdown) => dropdown.classList.add('hidden'));
      }
    });
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

    const session = getSession();
    const accountWrap = document.createElement('div');
    accountWrap.className = 'account-wrap';
    const account = document.createElement(session ? 'button' : 'a');
    account.className = 'account-access';
    if (session) {
      account.type = 'button';
      account.setAttribute('aria-label', 'Abrir menu do perfil');
      account.innerHTML = `<img class="account-avatar" src="${session.photoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" alt="${session.name || 'Perfil'}"/><span class="account-name-short">${session.name || 'Perfil'}</span>`;
    } else {
      account.href = 'admin.html';
      account.setAttribute('aria-label', 'Acesso administrativo');
      account.title = 'Acesso administrativo';
      account.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.2c-4 0-7.2 2.2-7.2 4.9V21h14.4v-1.9c0-2.7-3.2-4.9-7.2-4.9Z"/></svg>';
    }
    accountWrap.appendChild(account);

    if (session) {
      const isAlphaAdmin = session.role === 'alpha_admin';
      const dropdown = document.createElement('div');
      dropdown.className = 'account-dropdown hidden';
      dropdown.innerHTML = `
        <div class="account-dropdown-head">
          <img class="account-avatar" src="${session.photoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" alt="${session.name || 'Perfil'}"/>
          <div>
            <strong>${session.name || 'Usuário'}</strong>
            <p class="meta">${session.email || session.username || ''}</p>
          </div>
        </div>
        <div class="account-dropdown-actions">
          ${isAlphaAdmin ? '<a href="admin-dashboard.html" class="btn-outline">Painel Admin</a>' : ''}
          <a href="perfil.html" class="btn-outline">Ver perfil</a>
          <button type="button" id="header-logout-btn" class="btn-outline">Sair</button>
        </div>
      `;
      accountWrap.appendChild(dropdown);
      account.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('menu')?.classList.remove('open');
        dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!accountWrap.contains(e.target)) dropdown.classList.add('hidden');
      });
      dropdown.querySelector('#header-logout-btn')?.addEventListener('click', async () => {
        try {
          await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch (_err) {}
        localStorage.removeItem(sessionKey);
        window.location.href = 'admin.html';
      });
      if (isAlphaAdmin) {
        const menu = document.getElementById('menu');
        const hasAdminLink = menu?.querySelector('a[href="admin-dashboard.html"]');
        if (menu && !hasAdminLink) {
          const link = document.createElement('a');
          link.href = 'admin-dashboard.html';
          link.textContent = 'Painel Admin';
          menu.appendChild(link);
        }
      }
    }

    const menuBtn = document.getElementById('menu-toggle');
    actions.appendChild(searchWrap);
    actions.appendChild(latest);
    actions.appendChild(accountWrap);
    if (menuBtn) actions.appendChild(menuBtn);
    topbar.appendChild(actions);
  }


  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    footer.innerHTML = `
      <div class="footer-grid">
        <section><h4>PODBENAQUI</h4><p>Portal cristão com notícias, colunas e estudos bíblicos.</p></section>
        <section><h4>Menu</h4><ul><li><a href="index.html">Início</a></li><li><a href="noticias.html">Notícias</a></li><li><a href="colunistas.html">Colunistas</a></li><li><a href="estudos.html">Estudos</a></li></ul></section>
        <section><h4>Redes sociais</h4><div class="socials" id="footer-socials"><div class="social-dropdown-wrap"><button type="button" class="social-btn" data-social="youtube" aria-label="YouTube"><img src="https://cdn-icons-png.flaticon.com/512/3670/3670147.png" alt="YouTube"/></button><div class="social-dropdown" data-social="youtube"><a href="https://www.youtube.com/@podbenaqui" target="_blank" rel="noreferrer">@podbenaqui</a><a href="https://www.youtube.com/@prrobinsonlaraujo" target="_blank" rel="noreferrer">@prrobinsonlaraujo</a></div></div><div class="social-dropdown-wrap"><button type="button" class="social-btn" data-social="instagram" aria-label="Instagram"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram"/></button><div class="social-dropdown" data-social="instagram"><a href="https://www.instagram.com/podbenaqui/" target="_blank" rel="noreferrer">@podbenaqui</a><a href="https://www.instagram.com/prrobinsonlaraujo/" target="_blank" rel="noreferrer">@prrobinsonlaraujo</a></div></div><a href="https://wa.me/5567996248550" target="_blank" rel="noreferrer" class="social-btn" aria-label="WhatsApp"><img src="https://cdn-icons-png.flaticon.com/512/154/154858.png" alt="WhatsApp"/></a></div></section>
      </div>`;
    const socials = document.getElementById('footer-socials');
    if (!socials) return;
    socials.addEventListener('click', (e) => {
      const btn = e.target.closest('.social-dropdown-wrap > .social-btn');
      if (!btn) return;
      e.stopPropagation();
      const wrap = btn.parentElement;
      const dropdown = wrap.querySelector('.social-dropdown');
      if (!dropdown) return;
      const isOpen = dropdown.classList.contains('open');
      socials.querySelectorAll('.social-dropdown.open').forEach((d) => d.classList.remove('open'));
      if (!isOpen) dropdown.classList.add('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#footer-socials')) {
        document.querySelectorAll('.social-dropdown.open').forEach((d) => d.classList.remove('open'));
      }
    });
  }

  function renderVisitorCounter() {
    const el = document.getElementById('visitor-counter');
    if (!el) return;
    const key = 'podben_visitors';
    const count = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(count));
    el.textContent = `${count} (navegador atual)`;
    el.title = 'Contador local de visitas neste navegador.';
  }

  function allColumns() {
    const extras = JSON.parse(localStorage.getItem('podben_columns') || '[]');
    return [...data.columns, ...extras].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function normalizeNewsItem(item) {
    const clean = { ...item };
    clean.image = String(item?.image || '').trim();
    if (!clean.image) clean.image = 'https://picsum.photos/seed/podben-news/1200/700';
    clean.summary = String(item?.summary || item?.text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean;
  }

  let remoteNewsCache = [];
  let remoteNewsLoaded = false;

  async function fetchRemoteNews() {
    try {
      const resp = await fetch(`${API_BASE}/news`, { credentials: 'include' });
      if (!resp.ok) return;
      const dataResp = await resp.json().catch(() => ({}));
      if (Array.isArray(dataResp.items)) {
        remoteNewsCache = dataResp.items.map((n) => ({
          id: n.id,
          category: n.category,
          title: n.title,
          text: n.text,
          image: n.image || '',
          video: n.video || '',
          link: n.link || '',
          source: n.source || 'PODBEN',
          location: n.location || 'Aquidauana/MS',
          createdAt: n.createdAt,
          local: true,
        }));
        remoteNewsLoaded = true;
      }
    } catch (_err) {}
  }

  async function apiCreateNews(payload) {
    const resp = await fetch(`${API_BASE}/news`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao criar notícia');
    }
    const result = await resp.json();
    remoteNewsCache.unshift(result.item);
    return result.item;
  }

  async function apiUpdateNews(id, payload) {
    const resp = await fetch(`${API_BASE}/news/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar notícia');
    }
    const result = await resp.json();
    remoteNewsCache = remoteNewsCache.map((n) => n.id === id ? result.item : n);
    return result.item;
  }

  async function apiDeleteNews(id) {
    const resp = await fetch(`${API_BASE}/news/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao excluir notícia');
    }
    remoteNewsCache = remoteNewsCache.filter((n) => n.id !== id);
  }

  function allNews() {
    const remote = remoteNewsLoaded ? remoteNewsCache : [];
    const locals = remoteNewsLoaded ? [] : getAdminNews().map((n) => normalizeNewsItem({ ...n, local: true }));
    const defaults = (data.news || []).map((n) => normalizeNewsItem(n));
    const all = [...remote, ...locals, ...defaults];
    const unique = [...new Map(all.map((n) => [n.id, n])).values()];
    return unique.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  function allStudies() {
    const locals = remoteStudiesLoaded ? remoteStudiesCache : getAdminStudies();
    return [...locals, ...data.studies].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function renderHome() {
    const newsMain = document.getElementById('home-news-main');
    const newsList = document.getElementById('home-news-list');
    if (!newsMain || !newsList) return;
    const topNews = allNews().slice(0, 5);
    const [headline, ...secondaryNews] = topNews;
    newsList.innerHTML = '';
    if (headline) {
      const link = headline.local ? `noticia.html?id=${headline.id}` : headline.link;
      const target = headline.local ? '' : 'target="_blank" rel="noreferrer"';
      newsMain.innerHTML = `<img src="${headline.image}" alt="${headline.title}" class="news-main-cover"/><div class="stack"><p class="meta">${headline.category || 'Notícia'} • ${fmt(headline.createdAt)}</p><h3>${headline.title}</h3><p>${headline.summary || String(headline.text || '').slice(0, 180)}...</p><p class="meta">${headline.source || 'PODBEN'} • ${headline.location || 'Aquidauana/MS'}</p><a class="btn" href="${link}" ${target}>Ler notícia principal</a></div>`;
    }
    secondaryNews.forEach((n) => {
      const link = n.local ? `noticia.html?id=${n.id}` : n.link;
      const target = n.local ? '' : 'target="_blank" rel="noreferrer"';
      newsList.innerHTML += `<article class="card news-secondary-item"><img src="${n.image}" alt="${n.title}"/><div><p class="meta">${n.category || 'Notícia'} • ${fmt(n.createdAt)}</p><h3>${n.title}</h3><p class="meta">${n.source || 'PODBEN'} • ${n.location || 'Aquidauana/MS'}</p><a href="${link}" ${target}>Ler matéria</a></div></article>`;
    });

    const cols = document.getElementById('home-columnists');
    cols.innerHTML = '';
      allColumnists().slice(0, 4).forEach((c) => {
      const latest = allColumns().find((post) => post.columnistId === c.id);
      cols.innerHTML += `<article class="col-card columnist-highlight-card"><img class="avatar" src="${c.photo}" alt="${c.name}"/><p class="meta">${latest ? latest.title : 'Colunista PODBEN'}</p><h3><a href="colunista.html?id=${c.id}">${c.name}</a></h3><p>${c.bio}</p><a class="btn-outline" href="colunista.html?id=${c.id}">Ver perfil</a></article>`;
    });

    const photos = document.getElementById('home-photos');
    photos.innerHTML = '';
    allGalleryItems().filter((item) => item.mediaType !== 'video').slice(0, 5).forEach((p, idx) => photos.innerHTML += `<article class="photo-item photo-item-premium ${idx === 0 ? 'is-featured' : ''}"><img src="${p.url}" alt="${p.caption}" loading="lazy"/><p class="meta">${p.caption}</p></article>`);
    const studiesHome = document.getElementById('home-studies');
    if (studiesHome) {
      studiesHome.innerHTML = '';
      allStudies().slice(0, 4).forEach((s) => studiesHome.innerHTML += `<article class="card study-home-card"><a href="estudo.html?id=${s.id}"><img src="${s.cover}" alt="${s.title}" class="study-home-cover"/><h3>${s.title}</h3><p class="meta">${s.category || 'Estudo Bíblico'}</p></a></article>`);
    }

    const pedidoForm = document.getElementById('pedido-form');
    const pedidoComments = document.getElementById('pedido-comments');
    let comments = [];
    const renderComments = () => { pedidoComments.innerHTML = ''; comments.forEach((c) => { const phone = String(c.celular || '').replace(/[()]/g, '').trim(); pedidoComments.innerHTML += `<article class="card prayer-comment-card"><div class="prayer-comment-head"><strong>${c.nome}</strong><span class="meta">${phone ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> ${phone}` : ''}</span></div><p class="prayer-comment-text">${c.mensagem}</p><p class="meta prayer-comment-date">${fmt(c.createdAt)}</p>`; }); };
    async function loadPrayerComments() {
      try {
        const resp = await fetch(`${API_BASE}/public/prayer`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.items)) comments = data.items;
        }
      } catch (_err) {}
      renderComments();
    }
    loadPrayerComments();
    pedidoForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const action = e.submitter?.value || 'comment';
      const fd = new FormData(pedidoForm);
      const payload = { nome: fd.get('nome'), celular: fd.get('celular'), mensagem: fd.get('mensagem') };
      if (action === 'whatsapp') window.open(`https://wa.me/5567996248550?text=${encodeURIComponent(`Pedido de oração - PODBEN\nNome: ${payload.nome}\nCelular: ${payload.celular}\nMensagem: ${payload.mensagem}`)}`, '_blank');
      if (action === 'comment') {
        const resp = await fetch(`${API_BASE}/public/prayer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, honeypot: '', recaptchaToken: window.__recaptchaToken || '' }),
        });
        if (resp.ok) {
          showToast('Pedido de oração enviado! Aguardando aprovação do moderador.', 'info');
          loadPrayerComments();
        }
      }
      pedidoForm.reset();
    });
  }

  function renderNoticias() {
    const wrap = document.getElementById('all-news');
    if (!wrap) return;
    const heroMain = document.getElementById('news-hero-main');
    const heroSide = document.getElementById('news-hero-side');
    const mostRead = document.getElementById('news-most-read');
    const filtersWrap = document.getElementById('news-filters');
    const loadMoreBtn = document.getElementById('load-more-news');
    const q = (new URLSearchParams(location.search).get('q') || '').toLowerCase();
    const inferCategory = (item) => {
      const location = String(item.location || '').toLowerCase();
      const title = String(item.title || '').toLowerCase();
      if (location.includes('aquidauana')) return 'Aquidauana/MS';
      if (location.includes('ms') || location.includes('mato grosso')) return 'Região';
      if (title.includes('brasil') || location.includes('brasil')) return 'Brasil';
      if (title.includes('mundo') || title.includes('internacional')) return 'Mundo';
      if (title.includes('fé') || title.includes('igreja') || title.includes('evangelho')) return 'Fé e Sociedade';
      return 'Região';
    };
    const items = allNews()
      .filter((n) => !q || n.title.toLowerCase().includes(q) || String(n.summary || n.text || '').toLowerCase().includes(q))
      .map((n) => ({ ...n, feedCategory: inferCategory(n) }));
    const filters = ['Todas', 'Aquidauana/MS', 'Região', 'Brasil', 'Mundo', 'Fé e Sociedade'];
    let activeFilter = 'Todas';
    let visibleCount = 6;

    const toLink = (n) => ({
      href: n.local ? `noticia.html?id=${n.id}` : n.link,
      target: n.local ? '' : 'target="_blank" rel="noreferrer"',
    });
    const shortSummary = (n) => String(n.summary || n.text || '').slice(0, 150);

    const renderHero = (entries) => {
      if (!heroMain || !heroSide) return;
      const [main, ...side] = entries.slice(0, 4);
      if (main) {
        const link = toLink(main);
        heroMain.innerHTML = `<img src="${main.image}" alt="${main.title}" class="news-hero-main-cover"/><div class="stack"><p class="meta"><span class="news-badge">${main.feedCategory}</span> ${fmt(main.createdAt)}</p><h2>${main.title}</h2><p>${shortSummary(main)}...</p><p class="meta">Fonte: ${main.source || 'PODBEN'} • ${main.location || 'Aquidauana/MS'}</p><a href="${link.href}" ${link.target} class="btn">Ler matéria</a></div>`;
      }
      heroSide.innerHTML = '';
      side.forEach((n) => {
        const link = toLink(n);
        heroSide.innerHTML += `<article class="card news-hero-mini"><img src="${n.image}" alt="${n.title}"/><div><p class="meta">${fmt(n.createdAt)}</p><h3>${n.title}</h3><p class="meta">Fonte: ${n.source || 'PODBEN'}</p><a href="${link.href}" ${link.target}>Ler notícia</a></div></article>`;
      });
    };

    const renderMostRead = (entries) => {
      if (!mostRead) return;
      mostRead.innerHTML = '';
      entries.slice(0, 5).forEach((n, idx) => {
        const link = toLink(n);
        mostRead.innerHTML += `<article class="news-most-item"><span class="news-most-rank">${idx + 1}</span><img src="${n.image}" alt="${n.title}"/><div><h4>${n.title}</h4><p class="meta">${fmt(n.createdAt)} • ${n.source || 'PODBEN'}</p><a href="${link.href}" ${link.target}>Ler matéria</a></div></article>`;
      });
    };

    const renderFilters = () => {
      if (!filtersWrap) return;
      filtersWrap.innerHTML = filters.map((f) => `<button type="button" class="news-filter-chip ${f === activeFilter ? 'active' : ''}" data-filter="${f}">${f}</button>`).join('');
    };

    const renderGrid = () => {
      const filtered = items.filter((n) => activeFilter === 'Todas' || n.feedCategory === activeFilter);
      const visible = filtered.slice(0, visibleCount);
      wrap.innerHTML = '';
      visible.forEach((n) => {
        const link = toLink(n);
        wrap.innerHTML += `<article class="card news-editorial-card"><img src="${n.image}" alt="${n.title}" class="news-editorial-thumb"/><div class="stack"><p class="meta"><span class="news-badge">${n.feedCategory}</span> ${fmt(n.createdAt)}</p><h3>${n.title}</h3><p class="news-summary">${shortSummary(n)}...</p><p class="meta">Fonte original: <strong>${n.source || 'PODBEN'}</strong></p><a href="${link.href}" ${link.target}>Ler notícia completa</a></div></article>`;
      });
      if (loadMoreBtn) {
        loadMoreBtn.style.display = visible.length < filtered.length ? 'inline-flex' : 'none';
      }
    };

    renderHero(items);
    renderMostRead(items);
    renderFilters();
    renderGrid();

    filtersWrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      visibleCount = 6;
      renderFilters();
      renderGrid();
    });
    loadMoreBtn?.addEventListener('click', () => {
      visibleCount += 3;
      renderGrid();
    });
  }

  function renderNoticiaDetalhe() {
    const article = document.getElementById('single-news');
    if (!article) return;
    const id = Number(new URLSearchParams(location.search).get('id'));
    const post = [...(remoteNewsLoaded ? remoteNewsCache : []), ...getAdminNews().map((n) => ({ ...n, local: true })), ...data.news].find((n) => n.id === id);
    if (!post) {
      article.innerHTML = `<div class="news-empty-state"><h1>Notícia não encontrada</h1><p class="meta">Não foi possível carregar essa matéria.</p><a class="btn" href="noticias.html">Voltar para notícias</a></div>`;
      return;
    }
    const text = String(post.text || '').trim();
    const escapeHtml = (value) => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const htmlToText = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const parseParagraphs = (rawText) => {
      const sourceText = String(rawText || '').trim();
      if (!sourceText) return [];
      if (/<\/?p\b|<br\s*\/?>|<strong\b|<b\b|<em\b|<i\b/i.test(sourceText)) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(sourceText, 'text/html');
          const fromP = Array.from(doc.querySelectorAll('p'))
            .map((node) => node.textContent?.trim() || '')
            .filter(Boolean);
          if (fromP.length) return fromP;
          const plain = doc.body?.textContent?.trim() || '';
          if (plain) return plain.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).map((p) => p.trim()).filter(Boolean);
        } catch {}
      }
      return sourceText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    };
    let paragraphs = parseParagraphs(text);
    if (paragraphs.length <= 1) paragraphs = htmlToText(text).split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).map((p) => p.trim()).filter(Boolean);
    if (!paragraphs.length) paragraphs = [post.summary || 'Conteúdo indisponível no momento.', post.link ? 'A matéria completa está disponível na fonte original.' : ''];
    paragraphs = paragraphs.filter(Boolean);
    const subtitle = (post.summary && htmlToText(post.summary)) || paragraphs[0];
    const category = post.category || 'Notícia';
    const author = post.author || 'Redação PODBEN';
    const source = post.source || 'PODBEN';
    const locationLabel = post.location || 'Aquidauana/MS';
    const bodyHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    article.innerHTML = `
      <header class="news-article-hero">
        <nav class="breadcrumbs"><a href="index.html">Início</a> <span>›</span> <a href="noticias.html">Notícias</a> <span>›</span> <span>${escapeHtml(category)}</span></nav>
        <p class="meta news-tag"><span class="news-badge">${escapeHtml(category)}</span></p>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="news-subtitle">${escapeHtml(subtitle)}</p>
        <div class="news-meta-line">
          <span>Publicado em ${fmt(post.createdAt)}</span>
          <span>Fonte: ${post.link ? `<a href="${post.link}" target="_blank" rel="noreferrer">${escapeHtml(source)}</a>` : escapeHtml(source)}</span>
          <span>Autor: ${escapeHtml(author)}</span>
          <span>${escapeHtml(locationLabel)}</span>
        </div>
      </header>
      <figure class="news-cover-wrap">
        ${post.image ? `<img class="news-cover" src="${post.image}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/podben-news/1200/700';" />` : '<div class="news-cover-placeholder">Imagem indisponível</div>'}
        <figcaption class="meta">Imagem da matéria • ${escapeHtml(source)}</figcaption>
      </figure>
      <section class="news-detail-body">${bodyHtml}</section>
      ${post.video ? `<div class="video-wrap"><iframe src="${toEmbedVideo(post.video)}" allowfullscreen></iframe></div>` : ''}
      <section class="news-post-actions">
        <a class="btn-outline btn-icon-inline" href="https://wa.me/?text=${encodeURIComponent(`${post.title} - ${location.href}`)}" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a2.9 2.9 0 0 0-2.1.9l-6.4-3.2a3 3 0 0 0 0-1.4l6.4-3.2a3 3 0 1 0-.9-1.7L8.6 10a3 3 0 1 0 0 4l6.4 3.2A3 3 0 1 0 18 16Z"/></svg>Compartilhar</a>
        <a class="social-chip is-wa" href="https://wa.me/?text=${encodeURIComponent(`${post.title} - ${location.href}`)}" target="_blank" rel="noreferrer" aria-label="Compartilhar no WhatsApp"><img src="https://cdn.simpleicons.org/whatsapp/ffffff" alt="WhatsApp"/></a>
        <a class="social-chip is-fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}" target="_blank" rel="noreferrer" aria-label="Compartilhar no Facebook"><img src="https://cdn.simpleicons.org/facebook/ffffff" alt="Facebook"/></a>
        <button type="button" class="social-chip is-ig" id="share-news-instagram" aria-label="Copiar link para compartilhar no Instagram" style="border:none;cursor:pointer"><img src="https://cdn.simpleicons.org/instagram/ffffff" alt="Instagram"/></button>
        <button id="copy-news-link" type="button" class="btn-outline">Copiar link</button>
        <a class="btn-outline" href="noticias.html">Voltar para notícias</a>
      </section>
    `;
    document.getElementById('copy-news-link')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copiado!', 'success');
    });
    document.getElementById('share-news-instagram')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copiado! Compartilhe manualmente no Instagram.', 'info');
    });

    const relatedWrap = document.getElementById('news-related-list');
    const latestWrap = document.getElementById('single-news-latest');
    const feed = allNews().filter((n) => n.id !== post.id);
    if (relatedWrap) {
      relatedWrap.innerHTML = '';
      feed.slice(0, 4).forEach((n) => {
        const link = n.local ? `noticia.html?id=${n.id}` : n.link;
        const target = n.local ? '' : 'target="_blank" rel="noreferrer"';
        relatedWrap.innerHTML += `<article class="card news-related-card"><img src="${n.image}" alt="${n.title}"/><div class="stack"><p class="meta"><span class="news-badge">${n.category || 'Notícia'}</span> ${fmt(n.createdAt)}</p><h3>${n.title}</h3><a href="${link}" ${target}>Ler matéria</a></div></article>`;
      });
    }
    if (latestWrap) {
      latestWrap.innerHTML = '';
      allNews().slice(0, 6).forEach((n) => {
        const link = n.local ? `noticia.html?id=${n.id}` : n.link;
        const target = n.local ? '' : 'target="_blank" rel="noreferrer"';
        latestWrap.innerHTML += `<article class="news-latest-item"><h4>${n.title}</h4><p class="meta">${fmt(n.createdAt)} • ${n.source || 'PODBEN'}</p><a href="${link}" ${target}>Acessar notícia</a></article>`;
      });
    }

    const key = `podben_news_comments_${id}`;
    let comments = [];
    const session = getSession();
    const viewerToken = getCommentAuthorToken();
    const list = document.getElementById('news-comments');
    const canManageNewsComment = (comment) => session?.role === 'alpha_admin'
      || (session?.username && session.username === comment.authorUsername)
      || (comment.authorToken && comment.authorToken === viewerToken);
    const render = () => {
      list.innerHTML = '';
      if (!comments.length) {
        list.innerHTML = '<p class="comments-empty-state">Nenhum comentário ainda. Seja o primeiro a comentar!</p>';
      }
      comments.forEach((c) => {
        const actions = canManageNewsComment(c)
          ? `<div class="row-actions comment-actions"><button type="button" class="btn-outline edit-news-comment" data-id="${c.id}">Editar</button><button type="button" class="btn-outline delete-news-comment" data-id="${c.id}">Excluir</button></div>`
          : '';
        list.innerHTML += `<article class="card"><strong>${c.authorName}</strong> <span class="meta">${fmt(c.createdAt)}${c.updatedAt !== c.createdAt ? ` • editado` : ''}</span><p>${c.content}</p>${actions}</article>`;
      });
    };
    async function loadNewsComments() {
      try {
        const resp = await fetch(`${API_BASE}/comments?context=news&contextId=${id}`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.items)) comments = data.items;
        }
      } catch (_err) {}
      render();
    }
    loadNewsComments();
    document.getElementById('news-comment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const nome = fd.get('nome');
      const texto = fd.get('texto');
      try {
        await fetch(`${API_BASE}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: 'news', contextId: id, authorName: nome, authorPhoto: '', authorUsername: session?.username || null, authorToken: viewerToken, content: texto }),
        });
      } catch (_err) {}
      e.target.reset();
      showToast('Comentário enviado! Aguardando aprovação do administrador.', 'info');
    });
    list?.addEventListener('click', async (e) => {
      const commentId = Number(e.target.dataset.id);
      if (!commentId) return;
      const target = comments.find((c) => Number(c.id) === commentId);
      if (!target || !canManageNewsComment(target)) return;
      if (e.target.classList.contains('delete-news-comment')) {
        try {
          await fetch(`${API_BASE}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authorToken: viewerToken }),
          });
        } catch (_err) {}
        loadNewsComments();
      }
      if (e.target.classList.contains('edit-news-comment')) {
        const nextText = window.prompt('Editar comentário:', target.content || '');
        if (!nextText || !nextText.trim()) return;
        try {
          await fetch(`${API_BASE}/comments/${commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authorToken: viewerToken, content: nextText.trim() }),
          });
        } catch (_err) {}
        loadNewsComments();
      }
    });
    enhanceGoogleComments();
  }

  function renderGaleria() {
    const wrap = document.getElementById('all-photos');
    if (!wrap) return;
    const filtersWrap = document.getElementById('galeria-filtros');
    const heroHighlight = document.getElementById('galeria-hero-highlight');
    const counter = document.getElementById('galeria-counter');
    const lightbox = document.getElementById('gallery-lightbox');
    const lightboxImage = document.getElementById('gallery-lightbox-image');
    const lightboxCaption = document.getElementById('gallery-lightbox-caption');
    const lightboxMeta = document.getElementById('gallery-lightbox-meta');
    const closeLightbox = document.getElementById('gallery-lightbox-close');
    const inferCategory = (photo) => {
      const text = `${photo.caption || ''} ${photo.title || ''}`.toLowerCase();
      if (text.includes('culto') || text.includes('igreja')) return 'Cultos';
      if (text.includes('entrevista')) return 'Entrevistas';
      if (text.includes('evento') || text.includes('mutirão') || text.includes('ms cidadão')) return 'Eventos';
      if (text.includes('bastidor') || text.includes('podben')) return 'Bastidores';
      return 'Momentos especiais';
    };
    const categoryOrder = ['Todos', 'Eventos', 'Cultos', 'Bastidores', 'Entrevistas', 'Momentos especiais'];
    const photos = allGalleryItems().map((photo, index) => ({
      ...photo,
      title: photo.title || photo.caption || `Registro PODBEN ${index + 1}`,
      caption: photo.caption || 'Registro do portal PODBEN',
      category: photo.category || inferCategory(photo),
      mediaType: photo.mediaType || 'image',
      createdAt: photo.createdAt || new Date(Date.now() - index * 86400000).toISOString(),
      legend: photo.legend || 'Clique para abrir a visualização ampliada.',
    }));
    let activeCategory = 'Todos';

    const renderHeroHighlight = (items) => {
      if (!heroHighlight) return;
      const featured = items[0] || photos[0];
      if (!featured) {
        heroHighlight.innerHTML = '<p class="meta">Sem imagens disponíveis no momento.</p>';
        return;
      }
      heroHighlight.innerHTML = `${featured.mediaType === 'video' ? `<div class="video-wrap"><iframe src="${toEmbedVideo(featured.url)}" title="${featured.title}" loading="lazy" allowfullscreen></iframe></div>` : `<img src="${featured.url}" alt="${featured.title}" loading="lazy"/>`}<p class="meta"><span class="news-badge">${featured.category}</span> ${dateOnly(featured.createdAt)}</p><h3>${featured.title}</h3><p>${featured.legend}</p>`;
    };

    const renderPhotos = () => {
      const visible = photos.filter((item) => activeCategory === 'Todos' || item.category === activeCategory);
      wrap.innerHTML = '';
      visible.forEach((photo) => {
        wrap.innerHTML += `
          <article class="photo-item galeria-item" data-photo-id="${photo.id}">
            <button type="button" class="galeria-thumb-btn" data-photo-id="${photo.id}" aria-label="Abrir foto ${photo.title}">
              ${photo.mediaType === 'video'
                ? `<span class="galeria-video-thumb"><img src="https://img.youtube.com/vi/${(toEmbedVideo(photo.url).split('/embed/')[1] || '').split('?')[0] || '0'}/hqdefault.jpg" alt="${photo.title}" loading="lazy"/><span class="galeria-video-chip">Vídeo</span></span>`
                : `<img src="${photo.url}" alt="${photo.title}" loading="lazy"/>`}
            </button>
            <div class="galeria-item-content">
              <p class="meta"><span class="news-badge">${photo.category}</span> ${dateOnly(photo.createdAt)}</p>
              <h3>${photo.title}</h3>
              <p class="meta">${photo.legend}</p>
            </div>
          </article>
        `;
      });
      if (!visible.length) wrap.innerHTML = '<p class="meta">Nenhuma foto encontrada para esta categoria.</p>';
      if (counter) counter.textContent = `${visible.length} ${visible.length === 1 ? 'imagem' : 'imagens'} exibidas`;
      renderHeroHighlight(visible);
    };

    if (filtersWrap) {
      filtersWrap.innerHTML = categoryOrder.map((category) => `<button type="button" class="news-filter-chip ${category === activeCategory ? 'active' : ''}" data-category="${category}" role="tab" aria-selected="${category === activeCategory}">${category}</button>`).join('');
      filtersWrap.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-category]');
        if (!chip) return;
        activeCategory = chip.dataset.category;
        filtersWrap.querySelectorAll('[data-category]').forEach((item) => {
          const selected = item.dataset.category === activeCategory;
          item.classList.toggle('active', selected);
          item.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        renderPhotos();
      });
    }

    wrap.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-photo-id]');
      if (!trigger) return;
      const target = photos.find((item) => Number(item.id) === Number(trigger.dataset.photoId));
      const lightboxVideo = document.getElementById('gallery-lightbox-video');
      if (!target || !lightbox || !lightboxImage || !lightboxCaption || !lightboxMeta) return;
      if (target.mediaType === 'video' && lightboxVideo) {
        lightboxVideo.src = toEmbedVideo(target.url);
        lightboxVideo.classList.remove('hidden');
        lightboxImage.classList.add('hidden');
      } else {
        lightboxImage.src = target.url;
        lightboxImage.alt = target.title;
        lightboxImage.classList.remove('hidden');
        if (lightboxVideo) {
          lightboxVideo.classList.add('hidden');
          lightboxVideo.src = '';
        }
      }
      lightboxCaption.textContent = target.caption;
      lightboxMeta.textContent = `${target.category} • ${fmt(target.createdAt)} • ${target.mediaType === 'video' ? 'Vídeo' : 'Foto'}`;
      lightbox.classList.remove('hidden');
    });

    const hideLightbox = () => {
      const lightboxVideo = document.getElementById('gallery-lightbox-video');
      if (lightboxVideo) lightboxVideo.src = '';
      lightbox?.classList.add('hidden');
    };
    closeLightbox?.addEventListener('click', hideLightbox);
    lightbox?.addEventListener('click', (e) => {
      if (e.target === lightbox) hideLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideLightbox();
    });

    renderPhotos();
  }
  function renderStudies() {
    const w = document.getElementById('studies');
    if (!w) return;
    const tags = document.getElementById('studies-tags');
    const searchInput = document.getElementById('studies-search');
    const heroFeatured = document.getElementById('study-hero-featured');
    const featuredSection = document.getElementById('study-featured');
    const authorBlock = document.getElementById('studies-author');
    const studies = allStudies();
    const mappedCategory = (study) => {
      const text = `${study.category || ''} ${study.title || ''}`.toLowerCase();
      if (text.includes('oração')) return 'Oração';
      if (text.includes('família')) return 'Família';
      if (text.includes('fé')) return 'Fé';
      if (text.includes('bíblia') || text.includes('salmo') || text.includes('evangelho')) return 'Bíblia';
      if (text.includes('vida cristã') || text.includes('discipulado') || text.includes('iniciantes')) return 'Vida Cristã';
      return 'Vida Cristã';
    };
    const readingTime = (study) => Math.max(4, Math.round(String(study.content || study.bio || '').split(/\s+/).filter(Boolean).length / 180));
    const filters = ['Todos', 'Vida Cristã', 'Oração', 'Família', 'Fé', 'Bíblia'];
    let selectedCategory = 'Todos';
    let searchTerm = '';
    const featured = studies[0];

    if (featured && heroFeatured) {
      heroFeatured.innerHTML = `<img src="${featured.cover}" alt="${featured.title}" class="study-home-cover"/><p class="meta">${mappedCategory(featured)} • ${readingTime(featured)} min de leitura</p><h3>${featured.title}</h3><a class="btn-outline" href="estudo.html?id=${featured.id}">Ler agora</a>`;
    }
    if (featured && featuredSection) {
      featuredSection.innerHTML = `<div class="study-featured-layout"><img src="${featured.cover}" alt="${featured.title}"/><div class="stack"><p class="meta"><span class="news-badge">${mappedCategory(featured)}</span> ${readingTime(featured)} min de leitura</p><h2>${featured.title}</h2><p>${featured.bio}</p><p class="meta">Por ${featured.author || 'PODBEN'}</p><div class="row-actions"><a class="btn-outline" href="estudo.html?id=${featured.id}">Ler online</a><a class="btn" href="${featured.pdf}" target="_blank">Baixar PDF</a></div></div></div>`;
    }
    if (authorBlock) {
      authorBlock.innerHTML = `<div class="study-author-layout"><div><h2>Autor em destaque</h2><p class="meta">Conteúdo preparado com base bíblica e aplicação prática para o dia a dia.</p><h3>${featured?.author || 'Equipe PODBEN'}</h3><p>Materiais voltados para fortalecer sua caminhada com clareza, fé e responsabilidade editorial cristã.</p></div><a class="btn-outline" href="colunistas.html">Conhecer colunistas</a></div>`;
    }

    const renderList = () => {
      w.innerHTML = '';
      studies
        .filter((s) => selectedCategory === 'Todos' || mappedCategory(s) === selectedCategory)
        .filter((s) => !searchTerm || `${s.title} ${s.bio} ${s.category}`.toLowerCase().includes(searchTerm))
        .forEach((s) => w.innerHTML += `<article class="card study-library-card"><img src="${s.cover}" alt="${s.title}"/><div class="stack"><p class="meta"><span class="news-badge">${mappedCategory(s)}</span> ${readingTime(s)} min de leitura</p><h3><a href="estudo.html?id=${s.id}">${s.title}</a></h3><p>${s.bio}</p><p class="meta">Responsável: ${s.author || 'PODBEN'}</p><div class="row-actions"><a class="btn-outline" href="estudo.html?id=${s.id}">Ler online</a><a class="btn" href="${s.pdf}" target="_blank">Baixar PDF</a></div></div></article>`);
    };
    if (tags) {
      tags.innerHTML = filters.map((c) => `<button type="button" class="tag-chip ${c === selectedCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
      tags.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        selectedCategory = btn.dataset.cat;
        tags.querySelectorAll('.tag-chip').forEach((item) => item.classList.toggle('active', item.dataset.cat === selectedCategory));
        renderList();
      });
    }
    searchInput?.addEventListener('input', () => {
      searchTerm = String(searchInput.value || '').trim().toLowerCase();
      renderList();
    });
    renderList();
  }
  function renderStudyDetail() {
    const article = document.getElementById('study-detail');
    if (!article) return;
    const id = Number(new URLSearchParams(location.search).get('id'));
    const studies = allStudies();
    const currentIndex = studies.findIndex((s) => Number(s.id) === id);
    const study = currentIndex >= 0 ? studies[currentIndex] : null;
    if (!study) {
      article.innerHTML = `<div class="news-empty-state"><p class="meta">Conteúdo indisponível</p><h1>Estudo não encontrado</h1><p>Talvez esse estudo tenha sido removido ou ainda não foi sincronizado.</p><a class="btn" href="estudos.html">Voltar para estudos</a></div>`;
      const relatedWrap = document.getElementById('study-related-list');
      const portalWrap = document.getElementById('study-portal-links');
      if (relatedWrap) relatedWrap.innerHTML = '<p class="meta">Nenhum estudo relacionado encontrado.</p>';
      if (portalWrap) portalWrap.innerHTML = '<article class="card"><h3>Voltar para biblioteca</h3><p class="meta">Acesse todos os estudos bíblicos disponíveis no portal.</p><a href="estudos.html">Abrir estudos</a></article>';
      return;
    }
    const titleEl = document.getElementById('study-breadcrumb-title');
    if (titleEl) titleEl.textContent = study.title;
    const readingTime = Math.max(4, Math.round(String(study.content || study.bio || '').split(/\s+/).filter(Boolean).length / 180));
    const rawBody = String(study.content || study.bio || '').trim();
    const bodyBlocks = rawBody
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const splitBody = bodyBlocks.map((block) => {
      const quoteMatch = block.match(/^["“](.+)["”]$/);
      if (quoteMatch) return `<blockquote>${quoteMatch[1]}</blockquote>`;
      if (/^(versículo|versiculo|reflexão|reflexao|aplicação|aplicacao)\s*:/i.test(block)) return `<p class="study-highlight">${block}</p>`;
      if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\s]{8,}$/.test(block) && block.length < 80) return `<h2>${block}</h2>`;
      return `<p>${block}</p>`;
    }).join('');
    const summary = (study.bio || rawBody.slice(0, 190) || 'Conteúdo bíblico para fortalecer sua caminhada com clareza, fé e aplicação prática.')
      .trim();
    const previousStudy = currentIndex < studies.length - 1 ? studies[currentIndex + 1] : null;
    const nextStudy = currentIndex > 0 ? studies[currentIndex - 1] : null;
    article.innerHTML = `
      <article class="study-article">
        <header class="study-article-hero">
          <p class="meta"><span class="news-badge">${study.category || 'Estudo Bíblico'}</span> ${readingTime} min de leitura</p>
          <h1>${study.title}</h1>
          <p class="study-subtitle">${summary}</p>
          <div class="study-meta-line">
            <span><strong>Responsável:</strong> ${study.author || 'PODBEN'}</span>
            <span><strong>Data:</strong> ${fmt(study.createdAt || new Date().toISOString())}</span>
            <span><strong>Formato:</strong> Leitura online + PDF</span>
          </div>
          <div class="row-actions study-hero-actions">
            <a class="btn" href="${study.pdf || '#'}" target="_blank" rel="noreferrer">Baixar PDF</a>
            <button id="open-share-study" class="btn-outline btn-icon-inline" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a2.9 2.9 0 0 0-2.1.9l-6.4-3.2a3 3 0 0 0 0-1.4l6.4-3.2a3 3 0 1 0-.9-1.7L8.6 10a3 3 0 1 0 0 4l6.4 3.2A3 3 0 1 0 18 16Z"/></svg>Compartilhar</button>
          </div>
        </header>
        <figure class="study-cover-wrap">
          <img src="${study.cover || 'https://picsum.photos/seed/estudo/1200/700'}" alt="${study.title}" class="study-cover"/>
          <figcaption class="meta">Estudo bíblico publicado no portal PODBEN.</figcaption>
        </figure>
        <section class="study-content-body">
          ${splitBody || '<p>Conteúdo em atualização.</p>'}
        </section>
        <footer class="study-utility-panel">
          <div class="row-actions">
            <button id="study-back-button" class="btn-outline" type="button">Anterior</button>
            <a class="btn-outline" href="estudos.html">Todos os estudos</a>
            <button id="copy-study-link-inline" class="btn-outline" type="button">Copiar link</button>
          </div>
        </footer>
      </article>
    `;
    if (study.pdf && study.pdf.startsWith('data:')) {
      const pdfBtn = article.querySelector('.study-hero-actions .btn');
      if (pdfBtn) {
        pdfBtn.removeAttribute('target');
        pdfBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const a = document.createElement('a');
          a.href = study.pdf;
          a.download = `${study.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      }
    }
    const shareModal = document.getElementById('share-study-modal');
    const closeShare = document.getElementById('close-share-study');
    const shareUrl = encodeURIComponent(location.href);
    const shareTitle = encodeURIComponent(study.title);
    const wa = document.getElementById('share-study-whatsapp');
    const fb = document.getElementById('share-study-facebook');
    const insta = document.getElementById('share-study-instagram');
    if (wa) wa.href = `https://wa.me/?text=${shareTitle}%20${shareUrl}`;
    if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
    const copyLink = async () => {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copiado!', 'success');
    };
    document.getElementById('copy-study-link')?.addEventListener('click', copyLink);
    document.getElementById('copy-study-link-inline')?.addEventListener('click', copyLink);
    document.getElementById('share-study-instagram')?.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(location.href);
      showToast('Link copiado! Compartilhe manualmente no Instagram.', 'info');
    });
    document.getElementById('study-back-button')?.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = 'estudos.html';
    });
    document.getElementById('open-share-study')?.addEventListener('click', () => shareModal?.classList.remove('hidden'));
    closeShare?.addEventListener('click', () => shareModal?.classList.add('hidden'));

    const relatedWrap = document.getElementById('study-related-list');
    if (relatedWrap) {
      const related = studies
        .filter((item) => Number(item.id) !== Number(study.id))
        .filter((item) => (item.category || '') === (study.category || '') || (item.author || '') === (study.author || ''))
        .slice(0, 4);
      relatedWrap.innerHTML = '';
      (related.length ? related : studies.filter((item) => Number(item.id) !== Number(study.id)).slice(0, 4))
        .forEach((item) => {
          relatedWrap.innerHTML += `<article class="card study-related-card"><img src="${item.cover || 'https://picsum.photos/seed/estudo/300/200'}" alt="${item.title}" class="study-related-thumb"/><p class="meta"><span class="news-badge">${item.category || 'Estudo Bíblico'}</span> ${Math.max(4, Math.round(String(item.content || item.bio || '').split(/\\s+/).filter(Boolean).length / 180))} min</p><h3>${item.title}</h3><a href="estudo.html?id=${item.id}">Ler estudo</a></article>`;
        });
      if (!relatedWrap.children.length) relatedWrap.innerHTML = '<p class="meta">Em breve, novos estudos relacionados.</p>';
    }

    const portalWrap = document.getElementById('study-portal-links');
    if (portalWrap) {
      portalWrap.innerHTML = `
        <article class="card">
          <h3>Estudo anterior</h3>
          <p class="meta">${previousStudy ? previousStudy.title : 'Você está no primeiro estudo disponível.'}</p>
          ${previousStudy ? `<a href="estudo.html?id=${previousStudy.id}">Abrir estudo anterior</a>` : '<span class="meta">Sem anterior</span>'}
        </article>
        <article class="card">
          <h3>Próximo estudo</h3>
          <p class="meta">${nextStudy ? nextStudy.title : 'Você está no estudo mais recente.'}</p>
          ${nextStudy ? `<a href="estudo.html?id=${nextStudy.id}">Abrir próximo estudo</a>` : '<span class="meta">Sem próximo</span>'}
        </article>
        <article class="card">
          <h3>Veja também notícias</h3>
          <p class="meta">Conecte os temas bíblicos com os acontecimentos atuais da região.</p>
          <a href="noticias.html">Ir para notícias</a>
        </article>
        <article class="card">
          <h3>Compartilhe seu pedido de oração</h3>
          <p class="meta">Ao final da leitura, fortaleça sua caminhada com apoio da comunidade.</p>
          <a href="index.html#pedido-form">Fazer pedido</a>
        </article>
      `;
    }
  }
  function renderColunistasList() {
    const wrap = document.getElementById('columnists');
    if (!wrap) return;
    const filtersWrap = document.getElementById('columnist-filters');
    const recentWrap = document.getElementById('columnists-recent');
    const allPosts = allColumns();
    const themes = ['Todos', 'Atualidades', 'Reflexão', 'Estudos', 'Família', 'Vida Cristã'];
    let currentTheme = 'Todos';
    const guessTheme = (colunista, latestPost) => {
      const text = `${colunista.bio || ''} ${latestPost?.title || ''}`.toLowerCase();
      if (text.includes('família')) return 'Família';
      if (text.includes('estudo') || text.includes('bíblia') || text.includes('discipulado')) return 'Estudos';
      if (text.includes('sociedade') || text.includes('atualidade') || text.includes('contexto')) return 'Atualidades';
      if (text.includes('reflex') || text.includes('crônica') || text.includes('opinião')) return 'Reflexão';
      return 'Vida Cristã';
    };

    const renderCards = () => {
      wrap.innerHTML = '';
      allColumnists()
        .map((colunista) => {
          const posts = allPosts.filter((post) => post.columnistId === colunista.id);
          const latestPost = posts[0];
          const editorial = guessTheme(colunista, latestPost);
          return { colunista, posts, latestPost, editorial };
        })
        .filter((item) => currentTheme === 'Todos' || item.editorial === currentTheme)
        .forEach((item) => {
          const { colunista, posts, latestPost, editorial } = item;
          wrap.innerHTML += `<article class="col-card columnist-editorial-card"><img class="avatar" src="${colunista.photo}" alt="${colunista.name}"/><p class="meta"><span class="news-badge">${editorial}</span> ${posts.length} ${posts.length === 1 ? 'artigo' : 'artigos'}</p><h3><a href="colunista.html?id=${colunista.id}">${colunista.name}</a></h3><p class="columnist-signature">${colunista.bio || 'Colunista PODBEN'}</p><div class="row-actions"><a class="btn-outline" href="colunista.html?id=${colunista.id}">Ver perfil</a><a class="btn" href="${latestPost ? `coluna.html?id=${latestPost.id}` : `colunista.html?id=${colunista.id}`}">Ler artigos</a></div></article>`;
        });
      if (!wrap.children.length) wrap.innerHTML = '<p class="meta">Nenhum colunista encontrado neste filtro.</p>';
    };

    const renderRecent = () => {
      if (!recentWrap) return;
      recentWrap.innerHTML = '';
      allPosts.slice(0, 5).forEach((post) => {
    const author = allColumnists().find((c) => c.id === post.columnistId);
        recentWrap.innerHTML += `<article class="columnist-recent-item"><p class="meta">${fmt(post.createdAt)}</p><h4><a href="coluna.html?id=${post.id}">${post.title}</a></h4><p class="meta">${author?.name || 'Colunista PODBEN'}</p></article>`;
      });
    };

    if (filtersWrap) {
      filtersWrap.innerHTML = themes.map((theme) => `<button class="tag-chip ${theme === currentTheme ? 'active' : ''}" type="button" data-theme="${theme}">${theme}</button>`).join('');
      filtersWrap.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-theme]');
        if (!btn) return;
        currentTheme = btn.dataset.theme;
        filtersWrap.querySelectorAll('.tag-chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.theme === currentTheme));
        renderCards();
      });
    }

    renderRecent();
    renderCards();
  }

  function renderColunistaTimeline() {
    const wrap = document.getElementById('colunista-timeline');
    const head = document.getElementById('colunista-head');
    if (!wrap || !head) return;
    const id = new URLSearchParams(location.search).get('id');
    const columnist = allColumnists().find((c) => c.id === id);
    if (!columnist) return;
    const breadcrumb = document.getElementById('columnist-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = columnist.name;
    const posts = allColumns().filter((c) => c.columnistId === id);
    const latest = posts[0];
    const editorial = (() => {
      const text = `${columnist.bio || ''} ${latest?.title || ''}`.toLowerCase();
      if (text.includes('família')) return 'Família';
      if (text.includes('bíblia') || text.includes('estudo')) return 'Estudos';
      if (text.includes('sociedade') || text.includes('atualidade')) return 'Atualidades';
      if (text.includes('crônica') || text.includes('reflex')) return 'Reflexão';
      return 'Vida Cristã';
    })();

    head.innerHTML = `<img class="avatar" src="${columnist.photo}" alt="${columnist.name}"/><div class="stack"><p class="meta"><span class="news-badge">${editorial}</span> ${posts.length} ${posts.length === 1 ? 'publicação' : 'publicações'}</p><h1>${columnist.name}</h1><p class="columnist-hero-quote">${columnist.bio || 'Escrevo para conectar fé, consciência e prática diária com esperança e responsabilidade cristã.'}</p></div>`;
    const featuredWrap = document.getElementById('colunista-featured');
    if (featuredWrap) {
      featuredWrap.innerHTML = latest
        ? `<article class="card columnist-featured-article"><p class="meta">Artigo em destaque • ${dateOnly(latest.createdAt)}</p><h3>${latest.title}</h3><p>${String(latest.content || '').slice(0, 210)}...</p><a class="btn" href="coluna.html?id=${latest.id}">Ler artigo</a></article>`
        : '<p class="meta">Este colunista ainda não publicou artigos.</p>';
    }

    wrap.innerHTML = '';
    posts.forEach((post) => {
      wrap.innerHTML += `<article class="card columnist-article-card"><p class="meta"><span class="news-badge">${editorial}</span> ${fmt(post.createdAt)}</p><h3>${post.title}</h3><p>${String(post.content || '').slice(0, 170)}...</p><div class="row-actions"><a class="btn-outline" href="coluna.html?id=${post.id}">Ler artigo</a></div></article>`;
    });
    if (!posts.length) wrap.innerHTML = '<p class="meta">Sem artigos publicados até o momento.</p>';
  }

  function renderSingleColumn() {
    const article = document.getElementById('single-column');
    if (!article) return;
    const id = Number(new URLSearchParams(location.search).get('id'));
    const post = allColumns().find((p) => p.id === id);
    if (!post) return;
    const author = data.columnists.find((c) => c.id === post.columnistId);
    const session = getSession();
    const breadcrumb = document.getElementById('column-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = post.title;
    const words = String(post.content || '').split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(3, Math.round(words / 200));
    const body = String(post.content || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const columnistPosts = allColumns().filter((item) => item.columnistId === post.columnistId);
    const idxByAuthor = columnistPosts.findIndex((item) => item.id === post.id);
    const prev = idxByAuthor >= 0 ? columnistPosts[idxByAuthor + 1] : null;
    const next = idxByAuthor > 0 ? columnistPosts[idxByAuthor - 1] : null;
    article.innerHTML = `
      <header class="column-hero">
        <p class="meta"><span class="news-badge">Opinião & Reflexão</span> ${readingTime} min de leitura</p>
        <h1>${post.title}</h1>
        <p class="column-subtitle">Uma reflexão cristã sobre fé, consciência e prática no cotidiano.</p>
        <p class="meta">Por ${author?.name || 'Colunista PODBEN'} • ${fmt(post.createdAt)}</p>
      </header>
      <section class="column-body">
        ${body.map((p) => {
          if (/^(reflex[aã]o|aplica[cç][aã]o|desafio)\s*:/i.test(p)) return `<p class="column-highlight">${p}</p>`;
          if (/^(vers[ií]culo|texto-base)\s*:/i.test(p)) return `<blockquote>${p}</blockquote>`;
          return `<p>${p}</p>`;
        }).join('')}
      </section>
      <aside class="column-author-box">
        <img class="avatar" src="${author?.photo || 'https://i.pravatar.cc/240?img=3'}" alt="${author?.name || 'Colunista'}"/>
        <div class="stack">
          <h3>${author?.name || 'Colunista PODBEN'}</h3>
          <p class="meta">${author?.bio || 'Colunista dedicado a reflexões bíblicas e aplicação prática da fé.'}</p>
          <a class="btn-outline" href="colunista.html?id=${author?.id || ''}">Ver perfil e outras colunas</a>
        </div>
      </aside>
      <section class="column-actions">
        <div class="row-actions">
          <button id="share-column" class="btn-outline btn-icon-inline" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a2.9 2.9 0 0 0-2.1.9l-6.4-3.2a3 3 0 0 0 0-1.4l6.4-3.2a3 3 0 1 0-.9-1.7L8.6 10a3 3 0 1 0 0 4l6.4 3.2A3 3 0 1 0 18 16Z"/></svg>Compartilhar</button>
          <a id="share-column-wa" class="btn-outline icon-only-share" target="_blank" rel="noreferrer" aria-label="Compartilhar no WhatsApp"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2.1 7L3 29l6.4-2c2 .9 4.2 1.4 6.6 1.4 7.2 0 13-5.7 13-12.8S23.2 3 16 3Zm0 22.9c-2 0-4-.5-5.8-1.5l-.4-.2-3.8 1.2 1.2-3.7-.2-.4a10 10 0 0 1-1.6-5.3c0-5.6 4.7-10.2 10.5-10.2s10.5 4.6 10.5 10.2c0 5.7-4.7 10.2-10.5 10.2Zm5.8-7.7c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.1-.8 1-1 1.2-.3.2-.6 0a8.5 8.5 0 0 1-2.5-1.5 9.3 9.3 0 0 1-1.7-2.1c-.2-.3 0-.4.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.5s-.7-1.8-1-2.4c-.3-.6-.5-.5-.7-.5H11c-.2 0-.5 0-.7.3a3 3 0 0 0-.9 2.2c0 1.3 1 2.7 1.1 2.9.1.2 2 3 4.9 4.1.7.4 1.3.5 1.7.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.6.3-1.3.2-1.5-.1-.1-.3-.2-.6-.4Z"/></svg></a>
          <a id="share-column-fb" class="btn-outline icon-only-share" target="_blank" rel="noreferrer" aria-label="Compartilhar no Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.8-.1-1.5-.1-2.3-.1-2.2 0-3.7 1.3-3.7 3.8V10H8v3h2.9v8h2.7Z"/></svg></a>
          <a id="share-column-ig" class="btn-outline icon-only-share" target="_blank" rel="noreferrer" aria-label="Abrir Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.9 3H7.1A4.1 4.1 0 0 0 3 7.1v9.8A4.1 4.1 0 0 0 7.1 21h9.8a4.1 4.1 0 0 0 4.1-4.1V7.1A4.1 4.1 0 0 0 16.9 3Zm1.5 13.9a1.5 1.5 0 0 1-1.5 1.5H7.1a1.5 1.5 0 0 1-1.5-1.5V7.1a1.5 1.5 0 0 1 1.5-1.5h9.8a1.5 1.5 0 0 1 1.5 1.5Zm-6.4-8.2A4.3 4.3 0 1 0 16.3 13 4.3 4.3 0 0 0 12 8.7Zm0 6A1.7 1.7 0 1 1 13.7 13 1.7 1.7 0 0 1 12 14.7Zm4.4-6.5a1 1 0 1 1 1-1 1 1 0 0 1-1 1Z"/></svg></a>
          <button id="copy-column-link" class="btn-outline" type="button">Copiar link</button>
          <a class="btn-outline" href="colunistas.html">Voltar para colunistas</a>
          <button id="show-comment" class="btn-outline" type="button">Comentar</button>
        </div>
        <div class="row-actions">
          ${prev ? `<a class="btn-outline" href="coluna.html?id=${prev.id}">← Coluna anterior</a>` : ''}
          ${next ? `<a class="btn-outline" href="coluna.html?id=${next.id}">Próxima coluna →</a>` : ''}
        </div>
      </section>`;

    const relatedWrap = document.getElementById('column-related-list');
    if (relatedWrap) {
      relatedWrap.innerHTML = '';
      columnistPosts
        .filter((item) => item.id !== post.id)
        .slice(0, 2)
        .forEach((item) => {
          relatedWrap.innerHTML += `<article class="card column-related-card"><p class="meta">Mesmo autor • ${fmt(item.createdAt)}</p><h3>${item.title}</h3><p>${String(item.content || '').slice(0, 140)}...</p><a href="coluna.html?id=${item.id}">Ler coluna</a></article>`;
        });
      allColumns()
        .filter((item) => item.columnistId !== post.columnistId)
        .slice(0, 2)
        .forEach((item) => {
          const relatedAuthor = allColumnists().find((c) => c.id === item.columnistId);
          relatedWrap.innerHTML += `<article class="card column-related-card"><p class="meta">${relatedAuthor?.name || 'Colunista'} • ${fmt(item.createdAt)}</p><h3>${item.title}</h3><p>${String(item.content || '').slice(0, 140)}...</p><a href="coluna.html?id=${item.id}">Ler coluna</a></article>`;
        });
    }

    const formBox = document.getElementById('comment-form-box');
    const list = document.getElementById('comments');
    let comments = [];
    const viewerToken = getCommentAuthorToken();
    document.getElementById('show-comment')?.addEventListener('click', () => {
      formBox.classList.remove('hidden');
      formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector('#comment-form textarea[name="texto"]')?.focus();
    });
    const shareUrl = encodeURIComponent(location.href);
    const shareText = `${post.title} - ${author?.name || 'Colunista PODBEN'}`;
    const waLink = document.getElementById('share-column-wa');
    const fbLink = document.getElementById('share-column-fb');
    const igLink = document.getElementById('share-column-ig');
    if (waLink) waLink.href = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${location.href}`)}`;
    if (fbLink) fbLink.href = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
    document.getElementById('share-column')?.addEventListener('click', () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${location.href}`)}`, '_blank', 'noreferrer');
    });
    document.getElementById('copy-column-link')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(location.href);
      showToast('Link copiado!', 'success');
    });
    document.getElementById('share-column-ig')?.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(location.href);
      showToast('Link copiado! Compartilhe manualmente no Instagram.', 'info');
    });
    const canManageColumnComment = (comment) => session?.role === 'alpha_admin'
      || (session?.username && session.username === comment.authorUsername)
      || (session?.role === 'columnist' && session.columnistId === post.columnistId)
      || (comment.authorToken && comment.authorToken === viewerToken);
    const render = () => {
      list.innerHTML = '';
      if (!comments.length) {
        list.innerHTML = '<p class="comments-empty-state">Nenhum comentário ainda. Seja o primeiro a comentar!</p>';
      }
      comments.forEach((c) => {
        const actions = canManageColumnComment(c)
          ? `<div class="row-actions comment-actions"><button type="button" class="btn-outline edit-col-comment" data-id="${c.id}">Editar</button><button type="button" class="btn-outline delete-col-comment" data-id="${c.id}">Excluir</button></div>`
          : '';
        list.innerHTML += `<article class="comment card"><img class="avatar" src="${c.authorPhoto || 'https://i.pravatar.cc/90?img=3'}" alt="${c.authorName}"/><div><strong>${c.authorName}</strong><p class="meta">${fmt(c.createdAt)}${c.updatedAt !== c.createdAt ? ` • editado` : ''}</p><p>${c.content}</p>${actions}</div></article>`;
      });
    };
    async function loadColumnComments() {
      try {
        const resp = await fetch(`${API_BASE}/comments?context=column&contextId=${id}`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.items)) comments = data.items;
        }
      } catch (_err) {}
      render();
    }
    loadColumnComments();
    document.getElementById('comment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await fetch(`${API_BASE}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: 'column', contextId: id, authorName: fd.get('nome'), authorPhoto: fd.get('foto') || '', authorUsername: session?.username || null, authorToken: viewerToken, content: fd.get('texto') }),
        });
      } catch (_err) {}
      e.target.reset();
      showToast('Comentário enviado! Aguardando aprovação do administrador.', 'info');
    });
    list?.addEventListener('click', async (e) => {
      const commentId = Number(e.target.dataset.id);
      if (!commentId) return;
      const target = comments.find((c) => Number(c.id) === commentId);
      if (!target || !canManageColumnComment(target)) return;
      if (e.target.classList.contains('delete-col-comment')) {
        try {
          await fetch(`${API_BASE}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authorToken: viewerToken }),
          });
        } catch (_err) {}
        loadColumnComments();
      }
      if (e.target.classList.contains('edit-col-comment')) {
        const nextText = window.prompt('Editar comentário:', target.content || '');
        if (!nextText || !nextText.trim()) return;
        try {
          await fetch(`${API_BASE}/comments/${commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authorToken: viewerToken, content: nextText.trim() }),
          });
        } catch (_err) {}
        loadColumnComments();
      }
    });
    enhanceGoogleComments();
  }

  function renderColumnistEditor() {
    const panel = document.getElementById('editor-panel'); if (!panel) return;
    const columnistId = new URLSearchParams(location.search).get('id'); const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (!session || session.role !== 'columnist' || session.columnistId !== columnistId) return; panel.classList.remove('hidden');
    const ownPosts = document.getElementById('own-posts');
    const renderOwn = () => {
      const extras = JSON.parse(localStorage.getItem('podben_columns') || '[]').filter((p) => p.columnistId === columnistId);
      ownPosts.innerHTML = '';
      extras.forEach((p) => {
        ownPosts.innerHTML += `
          <article class="card editor-post-card">
            <label class="editor-field-label" for="title-${p.id}">Título da coluna</label>
            <input id="title-${p.id}" value="${p.title}" placeholder="Digite o título da coluna" data-id="${p.id}" data-field="title"/>
            <label class="editor-field-label" for="content-${p.id}">Conteúdo da coluna</label>
            <div class="text-toolbar" data-target="content-${p.id}"><button type="button" data-wrap="strong">B</button><button type="button" data-wrap="em">I</button><button type="button" data-wrap="u">U</button><button type="button" data-wrap="a">Link</button></div>
            <textarea id="content-${p.id}" rows="7" placeholder="Digite o conteúdo completo da coluna" data-id="${p.id}" data-field="content">${p.content}</textarea>
            <div class="row-actions">
              <button type="button" class="save-post" data-id="${p.id}">Salvar edição</button>
              <button type="button" class="delete-post" data-id="${p.id}">Excluir</button>
            </div>
          </article>
        `;
      });
      enhanceRichEditors();
    };
    document.getElementById('post-form')?.addEventListener('submit',(e)=>{e.preventDefault();const fd=new FormData(e.target);const extras=JSON.parse(localStorage.getItem('podben_columns')||'[]');extras.unshift({id:Date.now(),columnistId,title:fd.get('titulo'),content:fd.get('conteudo'),createdAt:new Date().toISOString()});localStorage.setItem('podben_columns',JSON.stringify(extras));e.target.reset();renderOwn();renderColunistaTimeline();});
    document.addEventListener('click',(e)=>{if(e.target.classList.contains('delete-post')){const id=Number(e.target.dataset.id);let extras=JSON.parse(localStorage.getItem('podben_columns')||'[]');extras=extras.filter((p)=>p.id!==id||p.columnistId!==columnistId);localStorage.setItem('podben_columns',JSON.stringify(extras));renderOwn();renderColunistaTimeline();} if(e.target.classList.contains('save-post')){const id=Number(e.target.dataset.id);const title=document.querySelector(`input[data-id="${id}"][data-field="title"]`)?.value||'';const content=document.querySelector(`textarea[data-id="${id}"][data-field="content"]`)?.value||'';const extras=JSON.parse(localStorage.getItem('podben_columns')||'[]').map((p)=>(p.id===id&&p.columnistId===columnistId?{...p,title,content}:p));localStorage.setItem('podben_columns',JSON.stringify(extras));renderOwn();renderColunistaTimeline();}});
    renderOwn();
  }

  function renderAdmin() {
    const form = document.getElementById('login-form'); if (!form) return;
    const info = document.getElementById('login-info');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit');
    const submitLabel = submitBtn?.querySelector('.submit-label');
    const passwordToggle = document.getElementById('login-password-toggle');
    const eyeOpenIcon = passwordToggle?.querySelector('.icon-eye-open');
    const eyeClosedIcon = passwordToggle?.querySelector('.icon-eye-closed');
    const emailError = document.getElementById('login-email-error');
    const passwordError = document.getElementById('login-password-error');
    const otpModal = document.getElementById('otp-modal');
    const otpForm = document.getElementById('otp-form');
    const otpInput = document.getElementById('otp-code');
    const otpCancel = document.getElementById('otp-cancel');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const showResetBtn = document.getElementById('show-reset-btn');
    const registerForm = document.getElementById('register-form');
    const registerRole = document.getElementById('register-role');
    const registerAdminSecretWrap = document.getElementById('register-admin-secret-wrap');
    const resetRequestForm = document.getElementById('reset-request-form');
    const resetConfirmForm = document.getElementById('reset-confirm-form');
    let pendingCreds = null;
    const setInfo = (message, state = '') => {
      if (!info) return;
      info.textContent = message;
      info.classList.remove('is-error', 'is-success', 'is-pending');
      if (state) info.classList.add(`is-${state}`);
    };
    const sessionPreview = getSession();
    const previewPhoto = document.getElementById('login-preview-photo');
    const previewName = document.getElementById('login-preview-name');
    const previewEmail = document.getElementById('login-preview-email');
    if (sessionPreview) {
      if (previewPhoto) previewPhoto.src = sessionPreview.photoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
      if (previewName) previewName.textContent = sessionPreview.name || 'Usuário';
      if (previewEmail) previewEmail.textContent = sessionPreview.email || 'sessão ativa detectada';
    }
    const setSubmitState = (isLoading) => {
      if (!submitBtn) return;
      submitBtn.disabled = isLoading;
      submitBtn.setAttribute('aria-busy', String(isLoading));
      if (submitLabel) submitLabel.textContent = isLoading ? 'Validando credenciais...' : 'Entrar com segurança';
    };
    const showFieldError = (field, fieldError, message) => {
      if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (fieldError) fieldError.textContent = message || '';
    };
    const validateForm = () => {
      const email = String(emailInput?.value || '').trim();
      const password = String(passwordInput?.value || '');
      let isValid = true;
      showFieldError(emailInput, emailError, '');
      showFieldError(passwordInput, passwordError, '');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError(emailInput, emailError, 'Informe um e-mail válido.');
        isValid = false;
      }
      if (!password || password.length < 8) {
        showFieldError(passwordInput, passwordError, 'A senha precisa ter ao menos 8 caracteres.');
        isValid = false;
      }
      return isValid;
    };
    const closeOtpModal = () => {
      otpModal?.classList.add('hidden');
      otpForm?.reset();
      pendingCreds = null;
    };
    const warmUpServer = async () => {
      try {
        await Promise.race([
          fetch(`${API_BASE.replace(/\/+$/,'')}/health`, { method: 'GET', mode: 'no-cors' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]).catch(() => {});
      } catch {}
    };
    warmUpServer();

    const postJson = async (url, payload, timeoutMs = 30000, retries = 1) => {
      let resp;
      try {
        resp = await Promise.race([
          fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ]);
      } catch {
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          return postJson(url, payload, timeoutMs, 0);
        }
        return { resp: { ok: false, status: 0 }, dataResp: { error: 'Servidor iniciando... Tente novamente em alguns segundos.' } };
      }
      const raw = await resp.text();
      let dataResp = {};
      if (raw) {
        try {
          dataResp = JSON.parse(raw);
        } catch {
          dataResp = {};
        }
      }
      if (!raw || typeof dataResp !== 'object' || Array.isArray(dataResp)) {
        if (resp.status === 404) {
          dataResp = { error: 'Endpoint não encontrado. Verifique se a API foi publicada.' };
        } else if (resp.status >= 500) {
          dataResp = { error: 'Servidor está acordando (Render hibernou). Tente novamente em 10 segundos.' };
        } else {
          dataResp = { error: `Resposta inválida do servidor (HTTP ${resp.status}).` };
        }
      }
      return { resp, dataResp };
    };
    const submitLogin = async (payload) => {
      const { resp, dataResp } = await postJson(`${API_BASE}/auth/login`, payload);
      if (!resp.ok && !dataResp.error) return { resp, dataResp: { error: 'Resposta inválida do servidor. Verifique a URL da API e o proxy /api.' } };
      return { resp, dataResp };
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm()) {
        setInfo('Revise os campos destacados para continuar.', 'error');
        return;
      }
      setInfo('Validando credenciais de acesso...', 'pending');
      setSubmitState(true);
      try {
        const fd = new FormData(form);
        const payload = { email: fd.get('email'), password: fd.get('senha') };
        const { resp, dataResp } = await submitLogin(payload);

        if (!resp.ok) {
          if (dataResp.code === 'OTP_REQUIRED') {
            pendingCreds = payload;
            otpModal?.classList.remove('hidden');
            otpInput?.focus();
            setInfo('Confirmação em duas etapas necessária.', 'pending');
            return;
          }
          setInfo(dataResp.error || 'Falha no login.', 'error');
          return;
        }

        saveSession({
          role: dataResp.role,
          columnistId: dataResp.columnistId || null,
          username: dataResp.username,
          email: dataResp.email,
          name: dataResp.name || dataResp.username,
          photoUrl: dataResp.photoUrl || '',
        });
        if (dataResp.role === 'columnist') return window.location.href = `colunista.html?id=${dataResp.columnistId}`;
        if (dataResp.role === 'alpha_admin') return window.location.href = 'admin-dashboard.html';
        window.location.href = 'index.html';
      } catch (_error) {
        setInfo('Não foi possível conectar à API. Confira deploy da API, CORS e proxy /api.', 'error');
      } finally {
        setSubmitState(false);
      }
    });
    otpForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingCreds) {
        setInfo('Faça login com e-mail e senha antes de validar o código.', 'error');
        closeOtpModal();
        return;
      }
      setInfo('Validando código de autenticação...', 'pending');
      const fd = new FormData(otpForm);
      try {
        const { resp, dataResp } = await submitLogin({ ...pendingCreds, otp: fd.get('otp') });
        if (!resp.ok) {
          setInfo(dataResp.error || 'Falha na validação do código.', 'error');
          return;
        }
        closeOtpModal();
        saveSession({
          role: dataResp.role,
          columnistId: dataResp.columnistId || null,
          username: dataResp.username,
          email: dataResp.email,
          name: dataResp.name || dataResp.username,
          photoUrl: dataResp.photoUrl || '',
        });
        if (dataResp.role === 'columnist') return window.location.href = `colunista.html?id=${dataResp.columnistId}`;
        if (dataResp.role === 'alpha_admin') return window.location.href = 'admin-dashboard.html';
        window.location.href = 'index.html';
      } catch (_error) {
        setInfo('Erro de comunicação ao validar o código.', 'error');
      }
    });
    otpCancel?.addEventListener('click', () => {
      closeOtpModal();
      setInfo('Confirmação em duas etapas cancelada.', 'pending');
    });
    passwordToggle?.addEventListener('click', () => {
      const isPassword = passwordInput?.type === 'password';
      if (passwordInput) passwordInput.type = isPassword ? 'text' : 'password';
      eyeOpenIcon?.classList.toggle('hidden', isPassword);
      eyeClosedIcon?.classList.toggle('hidden', !isPassword);
      passwordToggle.setAttribute('aria-pressed', String(isPassword));
      passwordToggle.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
      passwordInput?.focus();
    });
    const closeAuxForms = () => {
      registerForm?.classList.add('hidden');
      resetRequestForm?.classList.add('hidden');
      resetConfirmForm?.classList.add('hidden');
    };
    const resetTokenParam = new URLSearchParams(window.location.search).get('reset_token');
    if (resetTokenParam) {
      if (window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const details = document.querySelector('.auth-secondary-block');
      if (details) details.open = true;
      closeAuxForms();
      const tokenInput = document.getElementById('reset-token');
      if (tokenInput) tokenInput.value = resetTokenParam;
      if (resetConfirmForm) {
        resetConfirmForm.classList.remove('hidden');
        setTimeout(() => resetConfirmForm.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
    showRegisterBtn?.addEventListener('click', () => {
      const opening = registerForm?.classList.contains('hidden');
      closeAuxForms();
      if (opening) registerForm?.classList.remove('hidden');
    });
    const forgotPasswordBtn = document.getElementById('forgot-password-btn');
    forgotPasswordBtn?.addEventListener('click', () => {
      const details = document.querySelector('.auth-secondary-block');
      if (details) details.open = true;
      closeAuxForms();
      if (resetRequestForm) {
        resetRequestForm.classList.remove('hidden');
        setTimeout(() => resetRequestForm.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    });
    showResetBtn?.addEventListener('click', () => {
      closeAuxForms();
      if (resetRequestForm) resetRequestForm.classList.remove('hidden');
      if (resetConfirmForm) resetConfirmForm.classList.remove('hidden');
      setTimeout(() => showResetBtn?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    registerRole?.addEventListener('change', () => {
      registerAdminSecretWrap?.classList.toggle('hidden', registerRole.value !== 'alpha_admin');
    });
    registerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
        role: String(fd.get('role') || 'columnist'),
        adminSecret: String(fd.get('adminSecret') || ''),
      };
      if (!payload.name || !payload.email || payload.password.length < 8) {
        setInfo('Preencha nome, e-mail e senha (mínimo 8 caracteres).', 'error');
        return;
      }
      if (payload.role === 'alpha_admin' && !payload.adminSecret) {
        setInfo('Para criar Admin Alpha, informe a chave administrativa (ADMIN_SIGNUP_SECRET).', 'error');
        return;
      }
      setInfo('Criando conta...', 'pending');
      const { resp, dataResp } = await postJson(`${API_BASE}/auth/register`, payload);
      if (!resp.ok) {
        setInfo(dataResp.error || 'Não foi possível cadastrar agora.', 'error');
        return;
      }
      registerForm.reset();
      registerAdminSecretWrap?.classList.add('hidden');
      setInfo('Conta criada com sucesso. Faça login para continuar.', 'success');
    });
    resetRequestForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(resetRequestForm);
      const email = String(fd.get('email') || '').trim();
      if (!email) {
        setInfo('Informe um e-mail para recuperação.', 'error');
        return;
      }
      setInfo('Acordando servidor e gerando recuperação de senha...', 'pending');
      const { resp, dataResp } = await postJson(`${API_BASE}/auth/forgot-password`, { email });
      if (!resp.ok) {
        setInfo(dataResp.error || 'Falha ao solicitar recuperação.', 'error');
        return;
      }
      if (dataResp.devToken) {
        document.getElementById('reset-token').value = dataResp.devToken;
        resetConfirmForm?.classList.remove('hidden');
        setInfo('Token gerado e preenchido. Defina a nova senha abaixo.', 'pending');
        return;
      }
      resetConfirmForm?.classList.remove('hidden');
      setInfo(dataResp.message || 'Token gerado. Cole o token dos logs do Render no campo abaixo.', 'success');
    });
    resetConfirmForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(resetConfirmForm);
      const token = String(fd.get('token') || '').trim();
      const newPassword = String(fd.get('newPassword') || '');
      if (!token || newPassword.length < 8) {
        setInfo('Informe token e uma nova senha com pelo menos 8 caracteres.', 'error');
        return;
      }
      setInfo('Atualizando senha...', 'pending');
      const { resp, dataResp } = await postJson(`${API_BASE}/auth/reset-password`, { token, newPassword });
      if (!resp.ok) {
        setInfo(dataResp.error || 'Não foi possível redefinir a senha.', 'error');
        return;
      }
      resetConfirmForm.reset();
      setInfo('Senha redefinida com sucesso. Faça login com a nova senha.', 'success');
    });
  }

  function renderProfilePage() {
    const form = document.getElementById('profile-form');
    if (!form) return;
    const passwordForm = document.getElementById('profile-password-form');
    const feedback = document.getElementById('profile-feedback');
    const photoInput = form.elements.photoUrl;
    const photoFileInput = document.getElementById('profile-photo-file');
    const photoTrigger = document.getElementById('profile-photo-trigger');
    const photoPreview = document.getElementById('profile-photo-preview');
    const removePhotoBtn = document.getElementById('profile-photo-remove');
    const cropModal = document.getElementById('profile-crop-modal');
    const cropStage = document.getElementById('profile-crop-stage');
    const cropImage = document.getElementById('profile-crop-image');
    const cropZoom = document.getElementById('profile-crop-zoom');
    const cropApplyBtn = document.getElementById('profile-crop-apply');
    const cropCancelBtn = document.getElementById('profile-crop-cancel');
    const session = getSession();
    if (!session) {
      window.location.href = 'admin.html';
      return;
    }
    const defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    const maxProfileUploadBytes = 700 * 1024;
    const setFeedback = (message, isError = false) => {
      if (!feedback) return;
      feedback.textContent = message;
      feedback.classList.toggle('is-error', isError);
      feedback.classList.toggle('is-success', !isError);
    };
    const setPhotoPreview = (value) => {
      if (!photoPreview) return;
      photoPreview.src = value || defaultAvatar;
    };
    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler imagem selecionada.'));
      reader.readAsDataURL(file);
    });
    const cropState = { src: '', scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 };
    const renderCropImage = () => {
      if (!cropImage) return;
      cropImage.style.transform = `translate(calc(-50% + ${cropState.x}px), calc(-50% + ${cropState.y}px)) scale(${cropState.scale})`;
    };
    const openCropModal = (src) => {
      if (!cropModal || !cropImage || !cropZoom) return;
      cropState.src = src;
      cropState.x = 0;
      cropState.y = 0;
      cropImage.src = src;
      cropImage.onload = () => {
        if (!cropStage) { cropModal.classList.remove('hidden'); return; }
        const stageRect = cropStage.getBoundingClientRect();
        const stageW = stageRect.width || 360;
        const stageH = stageRect.height || 360;
        const imgW = cropImage.naturalWidth || stageW;
        const imgH = cropImage.naturalHeight || stageH;
        const fitScale = Math.min(stageW / imgW, stageH / imgH, 1);
        cropState.scale = fitScale;
        cropZoom.min = fitScale;
        cropZoom.max = Math.max(fitScale * 3, 3);
        cropZoom.value = String(fitScale);
        renderCropImage();
      };
      cropModal.classList.remove('hidden');
    };
    const closeCropModal = () => {
      if (!cropModal) return;
      cropModal.classList.add('hidden');
      cropState.dragging = false;
    };
    const cropToDataUrl = () => {
      if (!cropImage || !cropStage) return '';
      const stageRect = cropStage.getBoundingClientRect();
      const size = Math.floor(Math.min(stageRect.width, stageRect.height));
      if (!size) return '';
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      const imgW = cropImage.naturalWidth;
      const imgH = cropImage.naturalHeight;
      if (!imgW || !imgH) return '';
      const drawW = imgW * cropState.scale;
      const drawH = imgH * cropState.scale;
      const centerX = size / 2 + cropState.x;
      const centerY = size / 2 + cropState.y;
      const drawX = centerX - drawW / 2;
      const drawY = centerY - drawH / 2;
      ctx.drawImage(cropImage, drawX, drawY, drawW, drawH);
      return canvas.toDataURL('image/jpeg', 0.9);
    };
    form.elements.name.value = session.name || '';
    form.elements.email.value = session.email || session.username || '';
    photoInput.value = session.photoUrl || '';
    setPhotoPreview(photoInput.value);
    if (form.elements.bio) form.elements.bio.value = session.bio || '';

    photoTrigger?.addEventListener('click', () => {
      photoFileInput?.click();
    });

    cropZoom?.addEventListener('input', () => {
      cropState.scale = Number(cropZoom.value || 1);
      renderCropImage();
    });
    const beginDrag = (clientX, clientY) => {
      cropState.dragging = true;
      cropState.startX = clientX;
      cropState.startY = clientY;
      cropState.startOffsetX = cropState.x;
      cropState.startOffsetY = cropState.y;
    };
    const updateDrag = (clientX, clientY) => {
      if (!cropState.dragging) return;
      cropState.x = cropState.startOffsetX + (clientX - cropState.startX);
      cropState.y = cropState.startOffsetY + (clientY - cropState.startY);
      renderCropImage();
    };
    cropStage?.addEventListener('mousedown', (e) => beginDrag(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => updateDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', () => { cropState.dragging = false; });
    cropStage?.addEventListener('touchstart', (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      beginDrag(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      updateDrag(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', () => { cropState.dragging = false; });
    cropCancelBtn?.addEventListener('click', closeCropModal);
    cropModal?.addEventListener('click', (e) => {
      if (e.target === cropModal) closeCropModal();
    });
    cropApplyBtn?.addEventListener('click', () => {
      const cropped = cropToDataUrl();
      if (!cropped) {
        setFeedback('Não foi possível aplicar o recorte da foto.', true);
        return;
      }
      photoInput.value = cropped;
      setPhotoPreview(cropped);
      closeCropModal();
      if (photoFileInput) photoFileInput.value = '';
      setFeedback('Recorte aplicado. Clique em "Salvar perfil" para confirmar.');
    });

    photoFileInput?.addEventListener('change', async () => {
      const file = photoFileInput.files?.[0];
      if (!file) return;
      if (!String(file.type || '').startsWith('image/')) {
        setFeedback('Selecione apenas arquivos de imagem.', true);
        photoFileInput.value = '';
        return;
      }
      if (file.size > maxProfileUploadBytes) {
        setFeedback('Imagem muito grande. Use até 700KB.', true);
        photoFileInput.value = '';
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        openCropModal(dataUrl);
      } catch (_error) {
        setFeedback('Não foi possível processar a imagem selecionada.', true);
      }
    });
    document.getElementById('admin-news-image-cloudinary')?.addEventListener('click', () => {
      if (typeof cloudinary === 'undefined') {
        if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Widget Cloudinary não carregado.';
        return;
      }
      const widget = cloudinary.createUploadWidget({
        cloudName: window.PODBEN_CLOUDINARY_CLOUD_NAME || 'dqq4qonkb',
        uploadPreset: window.PODBEN_CLOUDINARY_UPLOAD_PRESET || 'podben_uploads',
        folder: 'noticias',
        sources: ['local', 'url', 'camera'],
        multiple: false,
        maxFiles: 1,
      }, (error, result) => {
        if (!error && result && result.event === 'success') {
          const url = result.info.secure_url;
          if (newsImageInput) newsImageInput.value = url;
          if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Imagem enviada via Cloudinary!';
        }
      });
      widget.open();
    });

    removePhotoBtn?.addEventListener('click', () => {
      photoInput.value = '';
      if (photoFileInput) photoFileInput.value = '';
      setPhotoPreview('');
      setFeedback('Foto removida. Clique em "Salvar perfil" para confirmar.');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        photoUrl: String(fd.get('photoUrl') || '').trim(),
        bio: String(fd.get('bio') || '').trim(),
      };
      if (!payload.name || !payload.email) {
        setFeedback('Preencha nome e e-mail para salvar o perfil.', true);
        return;
      }
      try {
        const resp = await fetch(`${API_BASE}/auth/profile`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const dataResp = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setFeedback(dataResp.error || dataResp.detail || 'Não foi possível salvar o perfil agora.', true);
          return;
        }
        saveSession({
          role: dataResp.role,
          columnistId: dataResp.columnistId || null,
          username: dataResp.username,
          email: dataResp.email,
          name: dataResp.name || dataResp.username,
          photoUrl: dataResp.photoUrl || '',
          bio: dataResp.bio || '',
        });
        setPhotoPreview(dataResp.photoUrl || '');
        photoInput.value = dataResp.photoUrl || '';
        form.elements.name.value = dataResp.name || payload.name;
        form.elements.email.value = dataResp.email || payload.email;
        if (form.elements.bio) form.elements.bio.value = dataResp.bio || payload.bio;
        setFeedback('Perfil atualizado com sucesso.');
      } catch (_error) {
        setFeedback('Falha de comunicação ao salvar perfil.', true);
      }
    });

    passwordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(passwordForm);
      const payload = {
        currentPassword: String(fd.get('currentPassword') || ''),
        newPassword: String(fd.get('newPassword') || ''),
      };
      if (!payload.currentPassword || payload.newPassword.length < 8) {
        setFeedback('Informe senha atual e nova senha (mínimo 8 caracteres).', true);
        return;
      }
      try {
        const resp = await fetch(`${API_BASE}/auth/change-password`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const dataResp = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setFeedback(dataResp.error || 'Não foi possível alterar a senha.', true);
          return;
        }
        passwordForm.reset();
        setFeedback('Senha alterada com sucesso.');
      } catch (_error) {
        setFeedback('Erro de comunicação ao alterar senha.', true);
      }
    });
  }


  function renderAdminDashboard() {
    const form = document.getElementById('admin-news-form');
    const galleryForm = document.getElementById('admin-gallery-form');
    if (!form && !galleryForm) return;
    const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (!session || session.role !== 'alpha_admin') {
      window.location.href = 'admin.html';
      return;
    }
    const list = document.getElementById('admin-news-list');
    const newsSearch = document.getElementById('admin-news-search');
    const newsFilter = document.getElementById('admin-news-filter');
    const newsSort = document.getElementById('admin-news-sort');
    const previewBtn = document.getElementById('admin-news-preview-btn');
    const draftBtn = document.getElementById('admin-news-draft-btn');
    const newsFeedback = document.getElementById('admin-news-feedback');
    const previewCard = document.getElementById('admin-news-preview-card');
    const newsImageInput = document.getElementById('admin-image');
    const newsImageFileInput = document.getElementById('admin-news-image-file');
    const newsImageUploadBtn = document.getElementById('admin-news-image-upload-btn');
    const newsImageUploadFeedback = document.getElementById('admin-news-image-upload-feedback');
    const galleryList = document.getElementById('admin-gallery-list');
    const galleryUploadInput = document.getElementById('gallery-upload-files');
    const galleryUploadBtn = document.getElementById('gallery-upload-btn');
    const galleryUploadFeedback = document.getElementById('gallery-upload-feedback');
    const updateDashboardSummary = () => {
      const remote = remoteNewsLoaded ? remoteNewsCache : [];
      const local = getAdminNews();
      const newsItems = [...remote, ...local.filter((n) => !remote.some((r) => r.id === n.id))];
      const galleryItems = getAdminGallery();
      const studies = remoteStudiesLoaded ? remoteStudiesCache : (Array.isArray(data?.studies) ? data.studies : []);
      const recentWindow = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentCount = newsItems.filter((n) => new Date(n.createdAt || Date.now()).getTime() >= recentWindow).length;
      const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
      set('summary-news-count', newsItems.length);
      set('summary-studies-count', studies.length);
      set('summary-gallery-count', galleryItems.length);
      set('summary-recent-count', recentCount);
    };
    const render = () => {
      if (!list) {
        updateDashboardSummary();
        return;
      }
      const remote = remoteNewsLoaded ? remoteNewsCache : [];
      const local = getAdminNews();
      let items = [...remote, ...local.filter((n) => !remote.some((r) => r.id === n.id))];
      const term = String(newsSearch?.value || '').trim().toLowerCase();
      const filter = String(newsFilter?.value || 'all');
      const sort = String(newsSort?.value || 'recent');
      if (term) items = items.filter((n) => `${n.title || ''} ${n.category || ''}`.toLowerCase().includes(term));
      if (filter !== 'all') items = items.filter((n) => String(n.category || '') === filter);
      if (sort === 'oldest') items = items.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      if (sort === 'title') items = items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR'));
      list.innerHTML = '';
      const allCategories = [...remote, ...local];
      const categories = [...new Set(allCategories.map((n) => String(n.category || '').trim()).filter(Boolean))];
      if (newsFilter) {
        const prev = newsFilter.value;
        newsFilter.innerHTML = '<option value="all">Todas categorias</option>' + categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
        if ([...newsFilter.options].some((opt) => opt.value === prev)) newsFilter.value = prev;
      }
      items.forEach((n) => {
        list.innerHTML += `
          <article class="card admin-news-item">
            <div class="admin-edit-grid">
              <label class="admin-field"><span>Título</span><input value="${n.title}" placeholder="Título da publicação" data-id="${n.id}" data-field="title"/></label>
              <label class="admin-field"><span>Categoria</span><input value="${n.category || ''}" data-id="${n.id}" data-field="category"/></label>
              <label class="admin-field"><span>Status</span><input value="${n.status || 'published'}" data-id="${n.id}" data-field="status"/></label>
              <label class="admin-field"><span>Texto</span><div class="text-toolbar" data-target="news-text-${n.id}"><button type="button" data-wrap="strong">B</button><button type="button" data-wrap="em">I</button><button type="button" data-wrap="u">U</button><button type="button" data-wrap="h2">H2</button><button type="button" data-wrap="ul">Lista</button><button type="button" data-wrap="quote">Citação</button><button type="button" data-wrap="a">Link</button></div><textarea id="news-text-${n.id}" placeholder="Texto completo da notícia" data-id="${n.id}" data-field="text">${n.text}</textarea></label>
              <label class="admin-field"><span>Imagem (URL)</span><input value="${n.image || ''}" placeholder="https://..." data-id="${n.id}" data-field="image"/></label>
              <label class="admin-field"><span>Vídeo embed (opcional)</span><input value="${n.video || ''}" placeholder="https://www.youtube.com/embed/..." data-id="${n.id}" data-field="video"/></label>
              <label class="admin-field"><span>Link externo</span><input value="${n.link || ''}" placeholder="https://..." data-id="${n.id}" data-field="link"/></label>
            </div>
            <div class="row-actions admin-item-actions">
              <button class="save-news" data-id="${n.id}">Salvar edição</button>
              <button class="duplicate-news" data-id="${n.id}">Duplicar</button>
              <button class="delete-news" data-id="${n.id}">Excluir</button>
              <a class="btn-outline" href="noticia.html?id=${n.id}" target="_blank">Visualizar</a>
            </div>
          </article>
        `;
      });
      if (!items.length) list.innerHTML = '<p class="meta">Nenhuma publicação encontrada com os filtros aplicados.</p>';
      updateDashboardSummary();
      enhanceRichEditors();
    };

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const saved = await apiCreateNews({
          category: fd.get('category'),
          title: fd.get('title'),
          text: fd.get('text'),
          image: String(fd.get('image') || '').trim(),
          video: fd.get('video') || '',
          link: fd.get('link') || '',
        });
        form.reset();
        if (newsFeedback) newsFeedback.textContent = 'Publicação criada com sucesso no banco de dados.';
        render();
      } catch (err) {
        if (newsFeedback) newsFeedback.textContent = err.message || 'Erro ao publicar.';
      }
    });
    previewBtn?.addEventListener('click', () => {
      if (!form) return;
      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim() || 'Sem título';
      const text = String(fd.get('text') || '').trim() || 'Sem conteúdo.';
      previewCard?.classList.remove('hidden');
      if (previewCard) previewCard.innerHTML = `<h3>${title}</h3><p class="meta">${String(fd.get('category') || 'Sem categoria')}</p><p>${text.slice(0, 380)}</p>`;
    });
    draftBtn?.addEventListener('click', () => {
      if (!form) return;
      const fd = new FormData(form);
      const drafts = JSON.parse(localStorage.getItem('podben_admin_news_drafts') || '[]');
      drafts.unshift({ id: Date.now(), ...Object.fromEntries(fd.entries()) });
      localStorage.setItem('podben_admin_news_drafts', JSON.stringify(drafts.slice(0, 20)));
      if (newsFeedback) newsFeedback.textContent = 'Rascunho salvo localmente.';
    });
    [newsSearch, newsFilter, newsSort].forEach((el) => el?.addEventListener('input', render));

    const renderGalleryAdmin = () => {
      if (!galleryList) return;
      const items = getAdminGallery();
      galleryList.innerHTML = '';
      items.forEach((item) => {
        galleryList.innerHTML += `
          <article class="card admin-news-item">
            <div class="admin-edit-grid">
              <label class="admin-field"><span>Título</span><input data-id="${item.id}" data-media-field="title" value="${item.title || ''}" placeholder="Título do item"/></label>
              <label class="admin-field"><span>Categoria</span><input data-id="${item.id}" data-media-field="category" value="${item.category || ''}" placeholder="Eventos, Cultos..."/></label>
              <label class="admin-field"><span>Tipo</span><select data-id="${item.id}" data-media-field="mediaType"><option value="image" ${item.mediaType !== 'video' ? 'selected' : ''}>Foto</option><option value="video" ${item.mediaType === 'video' ? 'selected' : ''}>Vídeo</option></select></label>
              <label class="admin-field"><span>Data</span><input data-id="${item.id}" data-media-field="createdAt" value="${item.createdAt || ''}" placeholder="2026-04-17T12:00:00-04:00"/></label>
              <label class="admin-field" style="grid-column:1 / -1"><span>URL da mídia</span><input data-id="${item.id}" data-media-field="url" value="${item.url || ''}" placeholder="https://... (imagem ou link de vídeo)"/></label>
              <label class="admin-field" style="grid-column:1 / -1"><span>Legenda</span><textarea data-id="${item.id}" data-media-field="caption" placeholder="Descrição breve">${item.caption || ''}</textarea></label>
            </div>
            <div class="row-actions admin-item-actions">
              <button class="save-gallery-item" data-id="${item.id}" type="button">Salvar edição</button>
              <button class="delete-gallery-item" data-id="${item.id}" type="button">Excluir</button>
              <a class="btn-outline" href="galeria.html" target="_blank">Visualizar</a>
            </div>
          </article>
        `;
      });
      if (!items.length) galleryList.innerHTML = '<p class="meta">Ainda não há fotos/vídeos cadastrados no painel.</p>';
    };

    const uploadFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });

    newsImageUploadBtn?.addEventListener('click', async () => {
      const file = newsImageFileInput?.files?.[0];
      if (!file) {
        if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Selecione uma imagem para enviar.';
        return;
      }
      if (!String(file.type || '').startsWith('image/')) {
        if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Arquivo inválido. Selecione uma imagem.';
        return;
      }
      if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Enviando imagem...';
      try {
        const fileDataUrl = await uploadFileAsDataUrl(file);
        const resp = await fetch(`${API_BASE}/auth/upload-media`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileDataUrl }),
        });
        const dataResp = await resp.json().catch(() => ({}));
        if (!resp.ok || !dataResp.url) {
          if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = dataResp.error || 'Falha ao enviar imagem.';
          return;
        }
        if (newsImageInput) newsImageInput.value = dataResp.url;
        if (newsImageFileInput) newsImageFileInput.value = '';
        if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Imagem enviada com sucesso e URL preenchida automaticamente.';
      } catch (_error) {
        if (newsImageUploadFeedback) newsImageUploadFeedback.textContent = 'Erro ao enviar imagem.';
      }
    });

    galleryUploadBtn?.addEventListener('click', async () => {
      const files = Array.from(galleryUploadInput?.files || []);
      if (!files.length) {
        if (galleryUploadFeedback) galleryUploadFeedback.textContent = 'Selecione ao menos 1 arquivo para enviar.';
        return;
      }
      if (galleryUploadFeedback) galleryUploadFeedback.textContent = `Enviando ${files.length} arquivo(s)...`;
      const uploadedUrls = [];
      for (const file of files) {
        try {
          const fileDataUrl = await uploadFileAsDataUrl(file);
          const resp = await fetch(`${API_BASE}/auth/upload-media`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileDataUrl }),
          });
          const dataResp = await resp.json().catch(() => ({}));
          if (!resp.ok || !dataResp.url) {
            if (galleryUploadFeedback) galleryUploadFeedback.textContent = dataResp.error || `Falha ao enviar ${file.name}.`;
            return;
          }
          uploadedUrls.push(dataResp.url);
        } catch (_error) {
          if (galleryUploadFeedback) galleryUploadFeedback.textContent = `Erro no upload de ${file.name}.`;
          return;
        }
      }
      const urlsField = galleryForm?.elements?.urls;
      if (urlsField) {
        const existing = String(urlsField.value || '').trim();
        urlsField.value = [existing, ...uploadedUrls].filter(Boolean).join('\n');
      }
      if (galleryUploadFeedback) galleryUploadFeedback.textContent = `${uploadedUrls.length} arquivo(s) enviado(s) com sucesso.`;
      if (galleryUploadInput) galleryUploadInput.value = '';
    });

    galleryForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(galleryForm);
      const urls = String(fd.get('urls') || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (!urls.length) return;
      const items = getAdminGallery();
      const baseData = {
        title: String(fd.get('title') || '').trim() || 'Registro PODBEN',
        category: String(fd.get('category') || '').trim() || 'Momentos especiais',
        caption: String(fd.get('caption') || '').trim() || 'Registro do portal PODBEN',
        createdAt: String(fd.get('createdAt') || '').trim() || new Date().toISOString(),
        mediaType: fd.get('mediaType') === 'video' ? 'video' : 'image',
        legend: 'Item publicado pelo painel admin.',
      };
      urls.forEach((url, index) => {
        items.unshift({
          id: Date.now() + index,
          ...baseData,
          title: urls.length > 1 ? `${baseData.title} #${index + 1}` : baseData.title,
          url: baseData.mediaType === 'video' ? toEmbedVideo(url) : url,
        });
      });
      setAdminGallery(items);
      galleryForm.reset();
      renderGalleryAdmin();
    });

    document.addEventListener('click', async (e) => {
      if (e.target.classList.contains('delete-news')) {
        const id = Number(e.target.dataset.id);
        try {
          await apiDeleteNews(id);
        } catch (_err) {}
        setAdminNews(getAdminNews().filter((n) => n.id !== id));
        render();
      }
      if (e.target.classList.contains('save-news')) {
        const id = Number(e.target.dataset.id);
        const val = (field) => document.querySelector(`[data-id="${id}"][data-field="${field}"]`)?.value || '';
        try {
          await apiUpdateNews(id, {
            category: val('category'),
            title: val('title'),
            text: val('text'),
            image: val('image'),
            video: val('video'),
            link: val('link'),
          });
          if (newsFeedback) newsFeedback.textContent = 'Notícia atualizada no banco de dados.';
        } catch (_err) {
          if (newsFeedback) newsFeedback.textContent = 'Erro ao atualizar: ' + _err.message;
        }
        render();
      }
      if (e.target.classList.contains('duplicate-news')) {
        const id = Number(e.target.dataset.id);
        const source = remoteNewsLoaded ? remoteNewsCache.find((n) => n.id === id) : getAdminNews().find((n) => n.id === id);
        if (!source) return;
        try {
          await apiCreateNews({
            category: source.category,
            title: `${source.title} (cópia)`,
            text: source.text,
            image: source.image || '',
            video: source.video || '',
            link: source.link || '',
          });
          if (newsFeedback) newsFeedback.textContent = 'Notícia duplicada no banco de dados.';
        } catch (_err) {
          if (newsFeedback) newsFeedback.textContent = 'Erro ao duplicar: ' + _err.message;
        }
        render();
      }
      if (e.target.classList.contains('delete-gallery-item')) {
        const id = Number(e.target.dataset.id);
        setAdminGallery(getAdminGallery().filter((item) => Number(item.id) !== id));
        renderGalleryAdmin();
      }
      if (e.target.classList.contains('save-gallery-item')) {
        const id = Number(e.target.dataset.id);
        const val = (field) => document.querySelector(`[data-id="${id}"][data-media-field="${field}"]`)?.value || '';
        const items = getAdminGallery().map((item) => (
          Number(item.id) === id
            ? {
              ...item,
              title: val('title'),
              category: val('category'),
              mediaType: val('mediaType') === 'video' ? 'video' : 'image',
              createdAt: val('createdAt') || item.createdAt,
              url: val('mediaType') === 'video' ? toEmbedVideo(val('url')) : val('url'),
              caption: val('caption'),
            }
            : item
        ));
        setAdminGallery(items);
        renderGalleryAdmin();
      }
    });

    document.getElementById('admin-logout')?.addEventListener('click', () => {
      const btn = document.getElementById('admin-logout');
      if (btn) { btn.textContent = 'Saindo...'; btn.disabled = true; }
      Promise.race([
        fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]).catch(() => {});
      localStorage.removeItem(sessionKey);
      window.location.href = 'admin.html';
    });

    render();
    renderGalleryAdmin();
    document.querySelectorAll('.admin-tab-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.adminTab;
        document.querySelectorAll('[data-admin-tab-panel]').forEach((panel) => {
          const show = target === 'dashboard' || panel.dataset.adminTabPanel === target;
          panel.classList.toggle('hidden', !show);
        });
      });
    });
  }

  function renderAdminStudiesDashboard() {
    const form = document.getElementById('admin-study-form');
    if (!form) return;
    const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (!session || session.role !== 'alpha_admin') {
      window.location.href = 'admin.html';
      return;
    }
    const feedback = document.getElementById('admin-study-feedback');
    const searchInput = document.getElementById('admin-study-search');
    const statusFilter = document.getElementById('admin-study-filter');
    const previewTitle = document.getElementById('study-preview-title');
    const previewSummary = document.getElementById('study-preview-summary');
    const previewCover = document.getElementById('study-cover-preview');
    const coverUrlInput = document.getElementById('study-cover');
    const coverFileName = document.getElementById('study-cover-file-name');
    const pdfName = document.getElementById('study-pdf-file-name');
    const totalStat = document.getElementById('study-stat-total');
    const publishedStat = document.getElementById('study-stat-published');
    const draftStat = document.getElementById('study-stat-draft');
    const pdfStat = document.getElementById('study-stat-pdf');
    const resetBtn = document.getElementById('study-reset');
    const logoutBtn = document.getElementById('admin-logout');
    const actionInput = document.getElementById('study-action');
    const list = document.getElementById('admin-study-list');
    let currentSearch = '';
    let currentFilter = 'all';
    const toDateTimeLocalValue = (iso) => {
      if (!iso) return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const offsetMs = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
    };
    const fromDateTimeLocalValue = (value) => {
      if (!value) return new Date().toISOString();
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return new Date().toISOString();
      return date.toISOString();
    };
    const showFeedback = (msg, isError = false) => {
      if (!feedback) return;
      feedback.textContent = msg;
      feedback.style.color = isError ? '#b42318' : '#2e5aac';
    };

    const renderStats = (items) => {
      if (totalStat) totalStat.textContent = String(items.length);
      if (publishedStat) publishedStat.textContent = String(items.filter((item) => item.status !== 'draft').length);
      if (draftStat) draftStat.textContent = String(items.filter((item) => item.status === 'draft').length);
      if (pdfStat) pdfStat.textContent = String(items.filter((item) => item.pdf).length);
    };

    const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const render = () => {
      const sourceItems = remoteStudiesLoaded
        ? remoteStudiesCache.map((item) => ({ ...item, status: item.status || 'published' }))
        : getAdminStudies().map((item) => ({ ...item, status: item.status || 'published' }));
      const items = sourceItems
        .map((item) => ({ ...item, status: item.status || 'published' }))
        .filter((item) => currentFilter === 'all' || item.status === currentFilter)
        .filter((item) => !currentSearch || `${item.title} ${item.category} ${item.bio}`.toLowerCase().includes(currentSearch));
      list.innerHTML = '';
      renderStats(sourceItems);
      items.forEach((s) => {
        try {
          list.innerHTML += `
            <article class="card admin-news-item">
              <p class="meta"><span class="news-badge">${s.status === 'draft' ? 'Rascunho' : 'Publicado'}</span> ${fmt(s.createdAt || new Date().toISOString())}</p>
              <div class="admin-edit-grid">
                <label class="admin-field"><span>Título</span><input value="${esc(s.title)}" data-id="${s.id}" data-field="title"/></label>
                <label class="admin-field"><span>Categoria</span><input value="${esc(s.category)}" data-id="${s.id}" data-field="category"/></label>
                <label class="admin-field"><span>Status</span><select data-id="${s.id}" data-field="status"><option value="published" ${s.status !== 'draft' ? 'selected' : ''}>Publicado</option><option value="draft" ${s.status === 'draft' ? 'selected' : ''}>Rascunho</option></select></label>
                <label class="admin-field"><span>Data</span><input data-id="${s.id}" data-field="createdAt" type="datetime-local" value="${toDateTimeLocalValue(s.createdAt)}"/></label>
                <label class="admin-field"><span>Imagem (URL)</span><input value="${esc(s.cover)}" data-id="${s.id}" data-field="cover"/></label>
                <label class="admin-field"><span>PDF</span><div class="file-upload-row"><input value="${esc(s.pdf)}" data-id="${s.id}" data-field="pdf"/><label class="btn-outline btn-upload" for="study-pdf-file-${s.id}">Upload PDF</label><input id="study-pdf-file-${s.id}" data-id="${s.id}" data-upload-target="pdf" type="file" accept="application/pdf" hidden/></div></label>
                <label class="admin-field" style="grid-column:1 / -1"><span>Resumo</span><textarea data-id="${s.id}" data-field="bio" rows="2">${esc(s.bio)}</textarea></label>
                <label class="admin-field" style="grid-column:1 / -1"><span>Conteúdo</span><div class="text-toolbar" data-target="study-content-${s.id}"><button type="button" data-wrap="strong">B</button><button type="button" data-wrap="em">I</button><button type="button" data-wrap="u">U</button><button type="button" data-wrap="h2">H2</button><button type="button" data-wrap="ul">Lista</button><button type="button" data-wrap="quote">Citação</button><button type="button" data-wrap="mark">Reflexão</button><button type="button" data-wrap="a">Link</button></div><textarea id="study-content-${s.id}" data-id="${s.id}" data-field="content">${esc(s.content)}</textarea></label>
              </div>
              <div class="row-actions admin-item-actions">
                <button class="save-study" data-id="${s.id}" type="button">Atualizar</button>
                <button class="duplicate-study" data-id="${s.id}" type="button">Duplicar</button>
                <button class="delete-study" data-id="${s.id}" type="button">Excluir</button>
                <a class="btn-outline" href="estudo.html?id=${s.id}" target="_blank">Visualizar</a>
              </div>
            </article>
          `;
        } catch (e) {
          console.error('Erro ao renderizar estudo', s.id, e);
        }
      });
      if (!items.length) {
        list.innerHTML = `
          <article class="card admin-empty-state">
            <h3>Nenhum estudo encontrado</h3>
            <p class="meta">Crie o primeiro estudo bíblico usando o formulário acima para iniciar seu acervo editorial.</p>
          </article>
        `;
      }
      enhanceRichEditors();
      document.querySelectorAll('input[type="file"][data-upload-target="pdf"]').forEach((input) => {
        const id = input.dataset.id;
        const target = id ? document.querySelector(`[data-id="${id}"][data-field="pdf"]`) : null;
        bindPdfUploadButton(input, target);
      });
    };
    document.querySelectorAll('[data-submit-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (actionInput) actionInput.value = btn.dataset.submitAction || 'publish';
        showFeedback('Processando...');
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        document.querySelectorAll('#admin-study-form [data-rich-id]').forEach((field) => {
          const rich = field.dataset.richId ? document.getElementById(field.dataset.richId) : null;
          if (rich) field.value = rich.innerHTML;
        });
        const fd = new FormData(form);
        const action = fd.get('action') || actionInput?.value || 'publish';
        const now = new Date().toISOString();
        if (!fd.get('title') || !fd.get('category') || !fd.get('summary') || !fd.get('content')) {
          showFeedback('Preencha os campos obrigatórios: título, categoria, resumo e conteúdo.', true);
          return;
        }
        const status = action === 'draft' ? 'draft' : (fd.get('status') || 'published');
        const createdAt = fd.get('createdAt') ? fromDateTimeLocalValue(fd.get('createdAt')) : now;
        const payload = {
          title: fd.get('title'),
          category: fd.get('category'),
          bio: fd.get('summary'),
          content: fd.get('content'),
          cover: fd.get('cover') || 'https://picsum.photos/seed/estudo/280/360',
          pdf: fd.get('pdf') || '',
          author: 'PODBEN',
          status,
          createdAt,
        };
        const savedItem = await apiCreateStudy(payload);
        if (action === 'preview') {
          const previewUrl = `estudo.html?id=${savedItem.id}`;
          const opened = window.open(previewUrl, '_blank');
          if (!opened) window.location.href = previewUrl;
        }
        form.reset();
        if (actionInput) actionInput.value = 'publish';
        if (previewTitle) previewTitle.textContent = 'Título do estudo';
        if (previewSummary) previewSummary.textContent = 'Resumo aparecerá aqui conforme você digita.';
        if (previewCover) previewCover.src = 'https://picsum.photos/seed/estudo-preview/520/300';
        if (coverFileName) coverFileName.textContent = 'Nenhum arquivo selecionado';
        if (pdfName) pdfName.textContent = 'PDF: não selecionado';
        showFeedback(action === 'draft' ? 'Rascunho salvo com sucesso.' : action === 'preview' ? 'Estudo salvo e aberto em pré-visualização.' : 'Estudo publicado com sucesso.');
        render();
      } catch (err) {
        showFeedback('Erro ao publicar: ' + err.message, true);
      }
    });
    document.addEventListener('click', async (e) => {
      if (e.target.classList.contains('delete-study')) {
        const id = Number(e.target.dataset.id);
        try {
          await apiDeleteStudy(id);
          showFeedback('Estudo excluído com sucesso.');
        } catch (err) {
          showFeedback('Erro ao excluir: ' + err.message, true);
        }
        render();
      }
      if (e.target.classList.contains('duplicate-study')) {
        const id = Number(e.target.dataset.id);
        const source = remoteStudiesLoaded
          ? remoteStudiesCache.find((item) => Number(item.id) === id)
          : getAdminStudies().find((item) => Number(item.id) === id);
        if (!source) return;
        try {
          await apiCreateStudy({
            title: `${source.title} (cópia)`,
            category: source.category,
            bio: source.bio || '',
            content: source.content || '',
            cover: source.cover || '',
            pdf: source.pdf || '',
            author: source.author || 'PODBEN',
            status: 'draft',
            createdAt: new Date().toISOString(),
          });
          showFeedback('Estudo duplicado como rascunho.');
        } catch (err) {
          showFeedback('Erro ao duplicar: ' + err.message, true);
        }
        render();
      }
      if (e.target.classList.contains('save-study')) {
        const id = Number(e.target.dataset.id);
        const val = (field) => document.querySelector(`[data-id="${id}"][data-field="${field}"]`)?.value || '';
        try {
          await apiUpdateStudy(id, {
            title: val('title'),
            category: val('category'),
            bio: val('bio') || String(val('content')).slice(0, 180),
            content: val('content'),
            cover: val('cover'),
            pdf: val('pdf'),
            author: 'PODBEN',
            status: val('status') || 'published',
            createdAt: fromDateTimeLocalValue(val('createdAt')),
          });
          showFeedback('Estudo atualizado com sucesso.');
        } catch (err) {
          showFeedback('Erro ao atualizar: ' + err.message, true);
        }
        render();
      }
    });
    searchInput?.addEventListener('input', () => {
      currentSearch = String(searchInput.value || '').trim().toLowerCase();
      render();
    });
    statusFilter?.addEventListener('change', () => {
      currentFilter = statusFilter.value || 'all';
      render();
    });
    document.getElementById('study-title')?.addEventListener('input', (e) => {
      if (previewTitle) previewTitle.textContent = e.target.value || 'Título do estudo';
    });
    document.getElementById('study-summary')?.addEventListener('input', (e) => {
      if (previewSummary) previewSummary.textContent = e.target.value || 'Resumo aparecerá aqui conforme você digita.';
    });
    coverUrlInput?.addEventListener('input', () => {
      if (previewCover) previewCover.src = coverUrlInput.value || 'https://picsum.photos/seed/estudo-preview/520/300';
    });
    const uploadFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
    const compressImage = (dataUrl, maxW = 800, quality = 0.7) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h *= maxW / w; w = maxW; }
        if (h > maxW) { w *= maxW / h; h = maxW; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
    function makeLocalUpload(targetInputId, previewIdOrNull, fileNameIdOrNull, acceptTypes) {
      const btn = document.getElementById(targetInputId === 'study-pdf' ? 'study-pdf-cloudinary' : 'study-upload-cloudinary');
      if (!btn) return;
      btn.textContent = 'Upload do computador';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = acceptTypes;
      input.style.display = 'none';
      btn.parentNode.appendChild(input);
      btn.addEventListener('click', () => {
        input.value = '';
        input.click();
      });
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        showFeedback('Lendo arquivo...');
        try {
          const isImage = acceptTypes.startsWith('image');
          let dataUrl = await uploadFileAsDataUrl(file);
          if (isImage) dataUrl = await compressImage(dataUrl);
          const targetInput = document.getElementById(targetInputId);
          if (targetInput) targetInput.value = dataUrl;
          if (previewIdOrNull) {
            const previewEl = document.getElementById(previewIdOrNull);
            if (previewEl) previewEl.src = dataUrl;
          }
          if (fileNameIdOrNull) {
            const nameEl = document.getElementById(fileNameIdOrNull);
            if (nameEl) nameEl.textContent = file.name;
          }
          const sizeKB = Math.round(dataUrl.length * 3 / 4 / 1024);
          showFeedback(`${file.name} carregado (${sizeKB} KB)`);
        } catch (err) {
          showFeedback('Erro: ' + err.message, true);
      }
    });

    const adminUsersSection = document.getElementById('admin-users-section');
    const profileUserForm = document.getElementById('profile-user-form');
    const profileUserList = document.getElementById('profile-user-list');
    const profileUserFeedback = document.getElementById('profile-user-feedback');
    const profileUserPhoto = document.getElementById('profile-user-photo');
    const profileUserPhotoUpload = document.getElementById('profile-user-photo-upload');
    const profileUserPhotoFileName = document.getElementById('profile-user-photo-file-name');
    if (session && session.role === 'alpha_admin' && adminUsersSection) {
      adminUsersSection.style.display = '';
      const showUserFeedback = (msg, isError = false) => {
        if (!profileUserFeedback) return;
        profileUserFeedback.textContent = msg;
        profileUserFeedback.style.color = isError ? '#b42318' : '#2e5aac';
      };
      const escUser = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const renderUserList = async () => {
        if (!profileUserList) return;
        try {
          const resp = await fetch(`${API_BASE}/auth/users`, { credentials: 'include' });
          if (!resp.ok) return;
          const data = await resp.json().catch(() => ({}));
          if (!Array.isArray(data.items)) return;
          profileUserList.innerHTML = '';
          data.items.forEach((u) => {
            profileUserList.innerHTML += `
              <article class="card" style="display:flex;gap:.65rem;align-items:center;padding:.75rem">
                <img src="${escUser(u.photoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png')}" alt="${escUser(u.name)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #d5e3f9"/>
                <div style="flex:1;min-width:0">
                  <strong>${escUser(u.name)}</strong>
                  <p class="meta" style="margin:0;font-size:.84rem">${escUser(u.email)} &bull; ${u.role === 'alpha_admin' ? 'Admin' : 'Colunista'}</p>
                </div>
                ${u.role !== 'alpha_admin' ? `<button class="delete-profile-user btn-outline" data-id="${u.id}" type="button" style="border-color:#fecaca;color:#dc2626;font-size:.82rem">Excluir</button>` : ''}
              </article>
            `;
          });
          if (!data.items.length) profileUserList.innerHTML = '<p class="meta">Nenhum usuário encontrado.</p>';
        } catch (_err) {}
      };
      profileUserForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(profileUserForm);
        const name = String(fd.get('name') || '').trim();
        const email = String(fd.get('email') || '').trim();
        const password = String(fd.get('password') || '');
        const photoUrl = String(fd.get('photoUrl') || '').trim();
        if (!name || !email || password.length < 8) {
          showUserFeedback('Preencha nome, e-mail e senha (mínimo 8 caracteres).', true);
          return;
        }
        showUserFeedback('Cadastrando...');
        try {
          const resp = await fetch(`${API_BASE}/auth/users`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, photoUrl }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) { showUserFeedback(data.error || 'Falha ao cadastrar.', true); return; }
          profileUserForm.reset();
          if (profileUserPhotoFileName) profileUserPhotoFileName.textContent = '';
          showUserFeedback('Colunista cadastrado com sucesso!');
          renderUserList();
        } catch (_err) { showUserFeedback('Erro de comunicação.', true); }
      });
      profileUserList?.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('delete-profile-user')) return;
        const id = Number(e.target.dataset.id);
        if (!id || !confirm('Excluir este usuário?')) return;
        try {
          const resp = await fetch(`${API_BASE}/auth/users/${id}`, { method: 'DELETE', credentials: 'include' });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) { showUserFeedback(data.error || 'Falha ao excluir.', true); return; }
          showUserFeedback('Usuário excluído.');
          renderUserList();
        } catch (_err) { showUserFeedback('Erro ao excluir.', true); }
      });
      if (profileUserPhotoUpload && typeof cloudinary !== 'undefined') {
        profileUserPhotoUpload.addEventListener('click', () => {
          const widget = cloudinary.createUploadWidget({
            cloudName: window.PODBEN_CLOUDINARY_CLOUD_NAME || 'dqq4qonkb',
            uploadPreset: window.PODBEN_CLOUDINARY_UPLOAD_PRESET || 'podben_uploads',
            folder: 'podben/profiles',
            sources: ['local', 'url', 'camera'],
            multiple: false,
          }, (error, result) => {
            if (!error && result && result.event === 'success') {
              if (profileUserPhoto) profileUserPhoto.value = result.info.secure_url;
              if (profileUserPhotoFileName) profileUserPhotoFileName.textContent = 'Foto enviada!';
            }
          });
          widget.open();
        });
      } else if (profileUserPhotoUpload) {
        profileUserPhotoUpload.addEventListener('click', () => {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.style.display = 'none';
          document.body.appendChild(fileInput);
          fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
              const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result || ''));
                r.onerror = () => reject(new Error('Falha'));
                r.readAsDataURL(file);
              });
              if (profileUserPhoto) profileUserPhoto.value = dataUrl;
              if (profileUserPhotoFileName) profileUserPhotoFileName.textContent = file.name;
            } catch (_err) {}
            fileInput.remove();
          });
          fileInput.click();
        });
      }
      renderUserList();
    }
  }
    makeLocalUpload('study-cover', 'study-cover-preview', 'study-cover-file-name', 'image/*');
    makeLocalUpload('study-pdf', null, 'study-pdf-file-name', 'application/pdf,.pdf');
    resetBtn?.addEventListener('click', () => {
      showFeedback('Formulário limpo.');
      if (previewTitle) previewTitle.textContent = 'Título do estudo';
      if (previewSummary) previewSummary.textContent = 'Resumo aparecerá aqui conforme você digita.';
      if (previewCover) previewCover.src = 'https://picsum.photos/seed/estudo-preview/520/300';
      if (coverFileName) coverFileName.textContent = '';
      if (pdfName) pdfName.textContent = 'Nenhum PDF selecionado';
    });
    logoutBtn?.addEventListener('click', () => {
      logoutBtn.textContent = 'Saindo...';
      logoutBtn.disabled = true;
      Promise.race([
        fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]).catch(() => {});
      localStorage.removeItem(sessionKey);
      window.location.href = 'admin.html';
    });
    showFeedback('Painel pronto para edição de estudos.');
    render();
  }

  function renderAdminUsers() {
    const form = document.getElementById('admin-user-form');
    if (!form) return;
    const session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (!session || session.role !== 'alpha_admin') return;
    const feedback = document.getElementById('admin-user-feedback');
    const list = document.getElementById('admin-user-list');
    const photoInput = document.getElementById('admin-user-photo');
    const photoUploadBtn = document.getElementById('admin-user-photo-upload');
    const photoFileName = document.getElementById('admin-user-photo-file-name');
    let usersCache = [];

    const showFeedback = (msg, isError = false) => {
      if (!feedback) return;
      feedback.textContent = msg;
      feedback.style.color = isError ? '#b42318' : '#2e5aac';
    };

    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const renderList = () => {
      if (!list) return;
      list.innerHTML = '';
      usersCache.forEach((u) => {
        list.innerHTML += `
          <article class="card admin-news-item">
            <div style="display:flex;gap:.75rem;align-items:center">
              <img src="${esc(u.photoUrl || 'https://cdn-icons-png.flaticon.com/512/149/149071.png')}" alt="${esc(u.name)}" style="width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid #d5e3f9"/>
              <div style="flex:1;min-width:0">
                <strong style="font-size:1rem;color:#1c355f">${esc(u.name)}</strong>
                <p class="meta" style="margin:0">${esc(u.email)} &bull; ${u.role === 'alpha_admin' ? 'Admin Alpha' : 'Colunista'}</p>
                <p class="meta" style="margin:0;font-size:.82rem">ID: ${u.columnistId || '—'} &bull; Criado em ${fmt(u.createdAt)}</p>
              </div>
              <div class="row-actions" style="flex-shrink:0">
                <a class="btn-outline" href="colunista.html?id=${esc(u.columnistId || '')}" target="_blank">Ver perfil</a>
                ${u.role !== 'alpha_admin' ? `<button class="delete-user btn-outline" data-id="${u.id}" type="button" style="border-color:#fecaca;color:#dc2626">Excluir</button>` : ''}
              </div>
            </div>
          </article>
        `;
      });
      if (!usersCache.length) list.innerHTML = '<p class="meta">Nenhum usuário encontrado.</p>';
    };

    async function loadUsers() {
      try {
        const resp = await fetch(`${API_BASE}/auth/users`, { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => ({}));
        if (Array.isArray(data.items)) usersCache = data.items;
      } catch (_err) {}
      renderList();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name') || '').trim();
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const photoUrl = String(fd.get('photoUrl') || '').trim();
      if (!name || !email || password.length < 8) {
        showFeedback('Preencha nome, e-mail e senha (mínimo 8 caracteres).', true);
        return;
      }
      showFeedback('Cadastrando colunista...');
      try {
        const resp = await fetch(`${API_BASE}/auth/users`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, photoUrl }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          showFeedback(data.error || 'Falha ao cadastrar colunista.', true);
          return;
        }
        form.reset();
        if (photoFileName) photoFileName.textContent = '';
        showFeedback('Colunista cadastrado com sucesso!');
        loadUsers();
      } catch (_err) {
        showFeedback('Erro de comunicação ao cadastrar.', true);
      }
    });

    list?.addEventListener('click', async (e) => {
      if (!e.target.classList.contains('delete-user')) return;
      const id = Number(e.target.dataset.id);
      if (!id) return;
      if (!confirm('Excluir este usuário? Esta ação não pode ser desfeita.')) return;
      try {
        const resp = await fetch(`${API_BASE}/auth/users/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          showFeedback(data.error || 'Falha ao excluir.', true);
          return;
        }
        showFeedback('Usuário excluído.');
        loadUsers();
      } catch (_err) {
        showFeedback('Erro ao excluir usuário.', true);
      }
    });

    if (photoUploadBtn && typeof cloudinary !== 'undefined') {
      photoUploadBtn.addEventListener('click', () => {
        const widget = cloudinary.createUploadWidget({
          cloudName: window.PODBEN_CLOUDINARY_CLOUD_NAME || 'dqq4qonkb',
          uploadPreset: window.PODBEN_CLOUDINARY_UPLOAD_PRESET || 'podben_uploads',
          folder: 'podben/profiles',
          sources: ['local', 'url', 'camera'],
          multiple: false,
          maxFiles: 1,
        }, (error, result) => {
          if (!error && result && result.event === 'success') {
            if (photoInput) photoInput.value = result.info.secure_url;
            if (photoFileName) photoFileName.textContent = 'Foto enviada com sucesso!';
          }
        });
        widget.open();
      });
    } else if (photoUploadBtn) {
      photoUploadBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          showFeedback('Lendo imagem...');
          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Falha ao ler imagem'));
              reader.readAsDataURL(file);
            });
            if (photoInput) photoInput.value = dataUrl;
            if (photoFileName) photoFileName.textContent = file.name;
            showFeedback('Imagem carregada. Clique em cadastrar para salvar.');
          } catch (_err) {
            showFeedback('Erro ao ler imagem.', true);
          }
          fileInput.remove();
        });
        fileInput.click();
      });
    }

    loadUsers();
  }

  function renderModerationPanel() {
    const listWrap = document.getElementById('mod-comments-list');
    const statsWrap = document.getElementById('mod-stats');
    const statusFilter = document.getElementById('mod-status-filter');
    const contextFilter = document.getElementById('mod-context-filter');
    const typeFilter = document.getElementById('mod-type-filter');
    if (!listWrap) return;

    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let currentStatus = 'pending';
    let currentContext = 'all';
    let currentType = 'comments';
    let itemsCache = [];

    const statusColors = { pending: '#f59e0b', approved: '#16a34a', rejected: '#dc2626' };
    const statusLabels = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };

    async function loadStats() {
      statsWrap.innerHTML = '';
      try {
        if (currentType === 'comments') {
          const resp = await fetch(`${API_BASE}/comments/stats`, { credentials: 'include' });
          if (resp.ok) {
            const stats = await resp.json();
            statsWrap.innerHTML = `
              <article class="card admin-stat-card" style="padding:.6rem .8rem"><p class="meta stat-label"><span class="stat-dot stat-recent" aria-hidden="true"></span>Pendentes</p><h3 style="font-size:1.3rem">${stats.pending || 0}</h3></article>
              <article class="card admin-stat-card" style="padding:.6rem .8rem"><p class="meta stat-label"><span class="stat-dot stat-published" aria-hidden="true"></span>Aprovados</p><h3 style="font-size:1.3rem">${stats.approved || 0}</h3></article>
              <article class="card admin-stat-card" style="padding:.6rem .8rem"><p class="meta stat-label"><span class="stat-dot stat-draft" aria-hidden="true"></span>Rejeitados</p><h3 style="font-size:1.3rem">${stats.rejected || 0}</h3></article>
            `;
          }
        }
      } catch (_err) {}
    }

    async function loadItems() {
      itemsCache = [];
      try {
        if (currentType === 'comments') {
          let url = `${API_BASE}/comments/all`;
          const params = [];
          if (currentStatus !== 'all') params.push(`status=${currentStatus}`);
          if (currentContext !== 'all') params.push(`context=${currentContext}`);
          if (params.length) url += '?' + params.join('&');
          const resp = await fetch(url, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.items)) itemsCache = data.items;
          }
        } else {
          let url = `${API_BASE}/public/prayer/all`;
          if (currentStatus !== 'all') url += `?status=${currentStatus}`;
          const resp = await fetch(url, { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.items)) itemsCache = data.items;
          }
        }
      } catch (_err) {}
      renderList();
    }

    function renderList() {
      listWrap.innerHTML = '';
      if (!itemsCache.length) {
        listWrap.innerHTML = '<p class="meta" style="padding:1rem;text-align:center">Nenhum item encontrado.</p>';
        return;
      }
      itemsCache.forEach((item) => {
        if (currentType === 'comments') {
          const ctxLabel = item.context === 'news' ? 'Notícia' : 'Coluna';
          listWrap.innerHTML += `
            <article class="card admin-news-item" style="padding:.85rem">
              <div style="display:flex;gap:.65rem;align-items:start">
                <img src="${esc(item.authorPhoto || 'https://i.pravatar.cc/90?img=3')}" alt="${esc(item.authorName)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #d5e3f9;flex-shrink:0"/>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin-bottom:.25rem">
                    <strong style="color:#1c355f">${esc(item.authorName)}</strong>
                    <span style="display:inline-block;padding:.15rem .45rem;border-radius:999px;font-size:.72rem;font-weight:700;background:${statusColors[item.status] || '#6b7280'}20;color:${statusColors[item.status] || '#6b7280'};border:1px solid ${statusColors[item.status] || '#6b7280'}40">${statusLabels[item.status] || item.status}</span>
                    <span class="news-badge" style="font-size:.7rem">${ctxLabel}</span>
                    <span class="meta" style="font-size:.78rem">${fmt(item.createdAt)}</span>
                  </div>
                  <p style="margin:0 0 .35rem;color:#2c4060;font-size:.92rem;line-height:1.5">${esc(item.content)}</p>
                  <div class="row-actions" style="margin-top:.4rem">
                    ${item.status !== 'approved' ? `<button class="btn mod-approve" data-id="${item.id}" type="button" style="padding:.35rem .65rem;font-size:.8rem;background:linear-gradient(135deg,#16a34a,#22c55e)">Aprovar</button>` : ''}
                    ${item.status !== 'rejected' ? `<button class="btn-outline mod-reject" data-id="${item.id}" type="button" style="padding:.35rem .65rem;font-size:.8rem;border-color:#fecaca;color:#dc2626">Rejeitar</button>` : ''}
                    <button class="btn-outline mod-delete" data-id="${item.id}" type="button" style="padding:.35rem .65rem;font-size:.8rem;border-color:#fecaca;color:#dc2626">Excluir</button>
                  </div>
                </div>
              </div>
            </article>
          `;
        } else {
          listWrap.innerHTML += `
            <article class="card admin-news-item" style="padding:.85rem">
              <div style="display:flex;gap:.65rem;align-items:start">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#25D366,#128C7E);display:grid;place-items:center;color:#fff;font-size:1.1rem;flex-shrink:0">🙏</div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin-bottom:.25rem">
                    <strong style="color:#1c355f">${esc(item.nome)}</strong>
                    <span style="display:inline-block;padding:.15rem .45rem;border-radius:999px;font-size:.72rem;font-weight:700;background:${statusColors[item.status] || '#6b7280'}20;color:${statusColors[item.status] || '#6b7280'};border:1px solid ${statusColors[item.status] || '#6b7280'}40">${statusLabels[item.status] || item.status}</span>
                    ${item.celular ? `<span class="meta" style="font-size:.78rem">📞 ${esc(item.celular)}</span>` : ''}
                    <span class="meta" style="font-size:.78rem">${fmt(item.createdAt)}</span>
                  </div>
                  <p style="margin:0 0 .35rem;color:#2c4060;font-size:.92rem;line-height:1.5;font-style:italic">${esc(item.mensagem)}</p>
                  <div class="row-actions" style="margin-top:.4rem">
                    ${item.status !== 'approved' ? `<button class="btn mod-approve" data-id="${item.id}" type="button" style="padding:.35rem .65rem;font-size:.8rem;background:linear-gradient(135deg,#16a34a,#22c55e)">Aprovar</button>` : ''}
                    ${item.status !== 'rejected' ? `<button class="btn-outline mod-reject" data-id="${item.id}" type="button" style="padding:.35rem .65rem;font-size:.8rem;border-color:#fecaca;color:#dc2626">Rejeitar</button>` : ''}
                    <button class="btn-outline mod-delete" data-id="${item.id}" type="button" style="padding:.35rem .65rem;font-size:.8rem;border-color:#fecaca;color:#dc2626">Excluir</button>
                  </div>
                </div>
              </div>
            </article>
          `;
        }
      });
    }

    typeFilter?.addEventListener('change', () => {
      currentType = typeFilter.value;
      if (contextFilter) contextFilter.style.display = currentType === 'comments' ? '' : 'none';
      loadStats();
      loadItems();
    });
    statusFilter?.addEventListener('change', () => { currentStatus = statusFilter.value; loadItems(); });
    contextFilter?.addEventListener('change', () => { currentContext = contextFilter.value; loadItems(); });

    listWrap?.addEventListener('click', async (e) => {
      const approveBtn = e.target.closest('.mod-approve');
      const rejectBtn = e.target.closest('.mod-reject');
      const deleteBtn = e.target.closest('.mod-delete');
      if (!approveBtn && !rejectBtn && !deleteBtn) return;
      const id = Number((approveBtn || rejectBtn || deleteBtn).dataset.id);
      if (!id) return;

      if (currentType === 'comments') {
        if (deleteBtn) {
          if (!confirm('Excluir este comentário?')) return;
          try { await fetch(`${API_BASE}/comments/${id}`, { method: 'DELETE', credentials: 'include' }); } catch (_err) {}
        } else {
          const newStatus = approveBtn ? 'approved' : 'rejected';
          try {
            await fetch(`${API_BASE}/comments/${id}/status`, {
              method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus }),
            });
          } catch (_err) {}
        }
      } else {
        if (deleteBtn) {
          if (!confirm('Excluir este pedido de oração?')) return;
          try { await fetch(`${API_BASE}/public/prayer/${id}`, { method: 'DELETE', credentials: 'include' }); } catch (_err) {}
        } else {
          const newStatus = approveBtn ? 'approved' : 'rejected';
          try {
            await fetch(`${API_BASE}/public/prayer/${id}/status`, {
              method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus }),
            });
          } catch (_err) {}
        }
      }
      loadItems();
      if (currentType === 'comments') loadStats();
    });

    if (contextFilter) contextFilter.style.display = currentType === 'comments' ? '' : 'none';
    loadStats();
    loadItems();
  }

  menuMobile();
  enhanceRichEditors();
  const refreshToolbarState = (toolbar) => {
    if (!toolbar) return;
    const stateMap = { strong: 'bold', em: 'italic', u: 'underline', 'align-left': 'justifyLeft', 'align-center': 'justifyCenter', 'align-right': 'justifyRight', 'align-justify': 'justifyFull' };
    toolbar.querySelectorAll('button[data-wrap]').forEach((button) => {
      const cmd = stateMap[button.dataset.wrap];
      if (!cmd) return button.classList.remove('is-active');
      try {
        button.classList.toggle('is-active', Boolean(document.queryCommandState(cmd)));
      } catch {
        button.classList.remove('is-active');
      }
    });
  };
  const runEditorCommand = (btn, toolbar) => {
    const wrap = btn?.dataset.wrap;
    if (!wrap) return;
    if (wrap === 'a') {
      const link = window.prompt('URL do link:', 'https://');
      if (!link) return;
      document.execCommand('createLink', false, link);
      return;
    }
    if (wrap === 'h2') return document.execCommand('formatBlock', false, 'h2');
    if (wrap === 'ul') return document.execCommand('insertUnorderedList', false, null);
    if (wrap === 'quote') return document.execCommand('formatBlock', false, 'blockquote');
    if (wrap === 'align-left') return document.execCommand('justifyLeft', false, null);
    if (wrap === 'align-center') return document.execCommand('justifyCenter', false, null);
    if (wrap === 'align-right') return document.execCommand('justifyRight', false, null);
    if (wrap === 'align-justify') return document.execCommand('justifyFull', false, null);
    if (wrap === 'text-color') return document.execCommand('foreColor', false, btn.value || '#1f2b44');
    if (wrap === 'highlight-color') return document.execCommand('hiliteColor', false, btn.value || '#fff4a3');
    const commandMap = { strong: 'bold', em: 'italic', u: 'underline', mark: 'hiliteColor' };
    return document.execCommand(commandMap[wrap] || 'bold', false, null);
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.text-toolbar button');
    if (!btn) return;
    const toolbar = btn.closest('.text-toolbar');
    const targetId = toolbar?.dataset.target;
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;
    const rich = target.dataset.richId ? document.getElementById(target.dataset.richId) : null;
    if (rich) {
      rich.focus();
      restoreSelectionFor(rich.id);
      runEditorCommand(btn, toolbar);
      target.value = rich.innerHTML;
      refreshToolbarState(toolbar);
      rememberSelectionFor(rich.id);
      return;
    }
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const selected = target.value.slice(start, end);
    let insert = selected;
    if (btn.dataset.wrap === 'a') {
      const link = window.prompt('URL do link:', 'https://');
      if (!link) return;
      insert = `<a href="${link}" target="_blank">${selected || 'texto do link'}</a>`;
    } else if (btn.dataset.wrap === 'h2') {
      insert = `\n<h2>${selected || 'Subtítulo'}</h2>\n`;
    } else if (btn.dataset.wrap === 'ul') {
      insert = `\n<ul><li>${selected || 'Item da lista'}</li></ul>\n`;
    } else if (btn.dataset.wrap === 'quote') {
      insert = `\n<blockquote>${selected || 'Citação em destaque'}</blockquote>\n`;
    } else if (btn.dataset.wrap === 'mark') {
      insert = `<mark>${selected || 'Reflexão importante'}</mark>`;
    } else {
      const tag = btn.dataset.wrap;
      insert = `<${tag}>${selected || 'texto'}</${tag}>`;
    }
    target.setRangeText(insert, start, end, 'end');
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
  });
  document.addEventListener('change', (e) => {
    const picker = e.target.closest('.text-toolbar input[type="color"]');
    if (!picker) return;
    const toolbar = picker.closest('.text-toolbar');
    const targetId = toolbar?.dataset.target;
    const target = targetId ? document.getElementById(targetId) : null;
    const rich = target?.dataset.richId ? document.getElementById(target.dataset.richId) : null;
    if (!rich || !target) return;
    rich.focus();
    restoreSelectionFor(rich.id);
    document.execCommand('styleWithCSS', false, true);
    runEditorCommand(picker, toolbar);
    target.value = rich.innerHTML;
    refreshToolbarState(toolbar);
    rememberSelectionFor(rich.id);
  });
  injectSearchBar();
  renderFooter();
  renderVisitorCounter();
  Promise.all([fetchRemoteStudies(), fetchRemoteColumnists(), fetchRemoteNews()]).then(() => {
    renderHome();
    renderNoticias();
    renderNoticiaDetalhe();
    renderGaleria();
    renderStudies();
    renderStudyDetail();
    renderColunistasList();
    renderColunistaTimeline();
    renderSingleColumn();
    renderColumnistEditor();
    renderAdmin();
    renderProfilePage();
    renderAdminDashboard();
    renderAdminStudiesDashboard();
    renderAdminUsers();
    renderModerationPanel();
  });

  const scrollBtn = document.createElement('button');
  scrollBtn.id = 'scroll-top-btn';
  scrollBtn.type = 'button';
  scrollBtn.setAttribute('aria-label', 'Voltar ao topo');
  scrollBtn.innerHTML = '▲';
  document.body.appendChild(scrollBtn);
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        scrollBtn.classList.toggle('visible', window.scrollY > 400);
        ticking = false;
      });
      ticking = true;
    }
  });
  scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  const phoneInput = document.getElementById('pedido-celular');
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      let v = phoneInput.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
      else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
      else if (v.length) v = `(${v}`;
      phoneInput.value = v;
    });
  }

  const maxLocalStorageBytes = 5 * 1024 * 1024;
  const estimateStringBytes = (str) => new Blob([str]).size;
  const origSetItem = localStorage.__origSetItem || localStorage.setItem;
  if (!localStorage.__origSetItem) {
    localStorage.__origSetItem = localStorage.setItem;
    localStorage.setItem = function (key, value) {
      const current = new Blob([JSON.stringify(localStorage)]).size;
      const added = estimateStringBytes(key) + estimateStringBytes(String(value));
      if (current + added > maxLocalStorageBytes * 0.85) {
        console.warn(`localStorage próximo do limite (${Math.round((current + added) / 1024)}KB). Faça backup dos dados.`);
      }
      return localStorage.__origSetItem.call(this, key, value);
    };
  }
  document.addEventListener('click', (e) => {
    const igBtn = e.target.closest('#share-column-ig, #share-study-instagram, #share-news-instagram');
    if (igBtn) return;
    const copyBtn = e.target.closest('#copy-column-link, #copy-study-link, #copy-study-link-inline, #copy-news-link');
    if (copyBtn) return;
  });
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    const revealEls = document.querySelectorAll('.card, .news, .col-card, .photo-item, .timeline-item, .study-home-card, .galeria-item, .admin-stat-card, .columnist-editorial-card, .study-list-item, .news-secondary-item');
    revealEls.forEach((el, i) => {
      el.classList.add('reveal-hidden');
      const parent = el.parentElement;
      if (parent && parent.children.length > 1) {
        const idx = Array.from(parent.children).indexOf(el);
        const delay = Math.min(idx * 0.06, 0.48);
        el.style.transitionDelay = delay + 's';
      }
      revealObserver.observe(el);
    });
  }
  document.querySelectorAll('.mouse-spotlight').forEach((section) => {
    section.addEventListener('mousemove', (e) => {
      const rect = section.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      section.style.setProperty('--mx', x + '%');
      section.style.setProperty('--my', y + '%');
    });
  });
  document.querySelectorAll('.tilt-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const tiltX = (y - 0.5) * -6;
      const tiltY = (x - 0.5) * 6;
      card.style.transform = 'perspective(800px) rotateX(' + tiltX + 'deg) rotateY(' + tiltY + 'deg)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg)';
    });
  });
  document.querySelectorAll('.card, .news, .col-card, .photo-item, .timeline-item, .study-home-card, .galeria-item').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
    });
  });
  const pageLoader = document.querySelector('.page-loader');
  if (pageLoader) {
    window.addEventListener('load', () => {
      setTimeout(() => pageLoader.classList.add('done'), 200);
    });
    setTimeout(() => { if (pageLoader && !pageLoader.classList.contains('done')) pageLoader.classList.add('done'); }, 3000);
  }
  const swapEl = document.getElementById('swap-word');
  if (swapEl) {
    const words = ['Notícias', 'Fé', 'Conteúdo cristão'];
    let idx = 0;
    setInterval(() => {
      swapEl.classList.add('exiting');
      setTimeout(() => {
        idx = (idx + 1) % words.length;
        swapEl.textContent = words[idx];
        swapEl.classList.remove('exiting');
        swapEl.classList.add('active');
      }, 350);
    }, 3000);
    swapEl.classList.add('active');
  }
  const scrollProgress = document.getElementById('scroll-progress');
  if (scrollProgress) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      requestAnimationFrame(() => { scrollProgress.style.width = h > 0 ? (window.scrollY / h * 100) + '%' : '0%'; });
    }, { passive: true });
  }
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        if (entry.target.classList.contains('stagger-children')) {
          Array.from(entry.target.children).forEach((child, i) => {
            child.style.transitionDelay = (i * 0.08) + 's';
          });
        }
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal-hidden, .reveal-left, .reveal-right, .reveal-scale, .stagger-children').forEach(el => revealObserver.observe(el));
  const parallaxBgs = document.querySelectorAll('.parallax-bg');
  if (parallaxBgs.length) {
    window.addEventListener('scroll', () => {
      requestAnimationFrame(() => {
        parallaxBgs.forEach(bg => {
          const rect = bg.closest('.parallax-wrap').getBoundingClientRect();
          const speed = 0.3;
          bg.style.transform = `translateY(${rect.top * speed}px)`;
        });
      });
    }, { passive: true });
  }
  document.querySelectorAll('.magnetic-btn').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
  document.querySelectorAll('.card-tilt').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg)'; });
  });
  document.querySelectorAll('.btn, .btn-outline, button').forEach(btn => btn.classList.add('magnetic-btn'));
})();
