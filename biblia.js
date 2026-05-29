(function () {
  const bible = window.PODBEN_DATA?.bible;
  if (!bible) return;
  const API_BASE = window.PODBEN_API_BASE || '/api';

  const bookSlugMap = {
    'Gênesis': 'genesis', 'Êxodo': 'exodus', 'Levítico': 'leviticus', 'Números': 'numbers',
    'Deuteronômio': 'deuteronomy', 'Josué': 'joshua', 'Juízes': 'judges', 'Rute': 'ruth',
    '1 Samuel': '1samuel', '2 Samuel': '2samuel', '1 Reis': '1kings', '2 Reis': '2kings',
    '1 Crônicas': '1chronicles', '2 Crônicas': '2chronicles', 'Esdras': 'ezra', 'Neemias': 'nehemiah',
    'Ester': 'esther', 'Jó': 'job', 'Salmos': 'psalms', 'Provérbios': 'proverbs',
    'Eclesiastes': 'ecclesiastes', 'Cânticos': 'songofsolomon', 'Isaías': 'isaiah',
    'Jeremias': 'jeremiah', 'Lamentações': 'lamentations', 'Ezequiel': 'ezekiel',
    'Daniel': 'daniel', 'Oseias': 'hosea', 'Joel': 'joel', 'Amós': 'amos',
    'Obadias': 'obadiah', 'Jonas': 'jonah', 'Miqueias': 'micah', 'Naum': 'nahum',
    'Habacuque': 'habakkuk', 'Sofonias': 'zephaniah', 'Ageu': 'haggai',
    'Zacarias': 'zechariah', 'Malaquias': 'malachi',
    'Mateus': 'matthew', 'Marcos': 'mark', 'Lucas': 'luke', 'João': 'john',
    'Atos': 'acts', 'Romanos': 'romans', '1 Coríntios': '1corinthians', '2 Coríntios': '2corinthians',
    'Gálatas': 'galatians', 'Efésios': 'ephesians', 'Filipenses': 'philippians',
    'Colossenses': 'colossians', '1 Tessalonicenses': '1thessalonians', '2 Tessalonicenses': '2thessalonians',
    '1 Timóteo': '1timothy', '2 Timóteo': '2timothy', 'Tito': 'titus', 'Filemom': 'philemon',
    'Hebreus': 'hebrews', 'Tiago': 'james', '1 Pedro': '1peter', '2 Pedro': '2peter',
    '1 João': '1john', '2 João': '2john', '3 João': '3john', 'Judas': 'jude', 'Apocalipse': 'revelation'
  };

  const booksSection = document.getElementById('biblia-books');
  const chaptersSection = document.getElementById('biblia-chapters');
  const readerSection = document.getElementById('biblia-reader');
  const oldTestamentWrap = document.getElementById('old-testament');
  const newTestamentWrap = document.getElementById('new-testament');
  const chapterListWrap = document.getElementById('chapter-list');
  const readerContent = document.getElementById('reader-content');
  const bookNameEl = document.getElementById('chapter-book-name');
  const readerTitleEl = document.getElementById('reader-title');
  const backToBooksBtn = document.getElementById('back-to-books');
  const backToChaptersBtn = document.getElementById('back-to-chapters');
  const prevChapterBtn = document.getElementById('prev-chapter-btn');
  const nextChapterBtn = document.getElementById('next-chapter-btn');

  let currentBook = '';
  let currentChapter = 1;
  let currentTotalChapters = 1;

  function renderBookList(books, wrap) {
    wrap.innerHTML = '';
    Object.entries(books).forEach(([name, chapters]) => {
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = name;
      a.dataset.book = name;
      a.dataset.chapters = chapters;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openBook(name, chapters);
      });
      wrap.appendChild(a);
    });
  }

  function showSection(section) {
    [booksSection, chaptersSection, readerSection].forEach((s) => s.classList.add('hidden'));
    section.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openBook(name, totalChapters) {
    currentBook = name;
    currentTotalChapters = totalChapters;
    bookNameEl.textContent = name;
    chapterListWrap.innerHTML = '';
    for (let i = 1; i <= totalChapters; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.addEventListener('click', () => openChapter(i));
      chapterListWrap.appendChild(btn);
    }
    showSection(chaptersSection);
  }

  async function openChapter(num) {
    currentChapter = num;
    readerTitleEl.textContent = `${currentBook} ${num}`;
    prevChapterBtn.disabled = currentChapter <= 1;
    nextChapterBtn.disabled = currentChapter >= currentTotalChapters;
    readerContent.innerHTML = '<p class="biblia-loading">Carregando texto...</p>';
    showSection(readerSection);

    const slug = bookSlugMap[currentBook];
    if (!slug) {
      readerContent.innerHTML = '<p class="biblia-error">Livro não encontrado na API.</p>';
      return;
    }

    try {
      const url = `https://projetoweb-zxe9.onrender.com/public/bible/${slug}+${num}?translation=acf`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('API retornou erro');
      const data = await resp.json();

      if (data.error) {
        readerContent.innerHTML = `<p class="biblia-error">${data.error}</p>`;
        return;
      }

      let html = '';
      if (data.text) {
        const verses = data.text.trim().split('\n').filter(Boolean);
        verses.forEach((verse, idx) => {
          html += `<p class="verse"><span class="verse-num">${idx + 1}</span>${verse.trim()}</p>`;
        });
      }
      readerContent.innerHTML = html || '<p class="biblia-error">Texto não encontrado para este capítulo.</p>';
    } catch (_err) {
      readerContent.innerHTML = '<p class="biblia-error">Erro ao carregar o texto. Tente novamente.</p>';
    }
  }

  backToBooksBtn?.addEventListener('click', () => showSection(booksSection));
  backToChaptersBtn?.addEventListener('click', () => openBook(currentBook, currentTotalChapters));
  prevChapterBtn?.addEventListener('click', () => { if (currentChapter > 1) openChapter(currentChapter - 1); });
  nextChapterBtn?.addEventListener('click', () => { if (currentChapter < currentTotalChapters) openChapter(currentChapter + 1); });

  renderBookList(bible.antigoTestamento, oldTestamentWrap);
  renderBookList(bible.novoTestamento, newTestamentWrap);
})();
