import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { sendPrayerEmail } from '../utils/mailer.js';

const router = express.Router();

function assertDb(res) {
  if (!pool) {
    res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL)' });
    return false;
  }
  return true;
}

function mapPrayer(row) {
  return {
    id: Number(row.id),
    nome: row.nome,
    celular: row.celular,
    mensagem: row.mensagem,
    status: row.status || 'approved',
    createdAt: row.created_at,
  };
}

router.post('/prayer', async (req, res) => {
  const { nome, celular, mensagem, honeypot, recaptchaToken } = req.body || {};

  if (honeypot) return res.status(400).json({ error: 'Spam detectado' });
  if (!nome || !mensagem || !celular) return res.status(400).json({ error: 'Campos obrigatórios' });
  if (!assertDb(res)) return;

  const secret = process.env.RECAPTCHA_SECRET;
  if (secret) {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: recaptchaToken || '' }),
    });
    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: 'Falha no reCAPTCHA' });
  }

  await pool.query("INSERT INTO prayer_requests (nome, celular, mensagem, status) VALUES ($1, $2, $3, 'pending')", [nome, celular, mensagem]);
  sendPrayerEmail({ nome, celular, mensagem }).catch(() => {});
  return res.status(201).json({ ok: true });
});

router.get('/prayer', async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query("SELECT * FROM prayer_requests WHERE status = 'approved' ORDER BY created_at DESC");
  return res.json({ items: rows.map(mapPrayer) });
});

router.get('/prayer/all', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const { status } = req.query;
  let query = 'SELECT * FROM prayer_requests';
  const params = [];
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query += ' WHERE status = $1';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT 200';
  const { rows } = await pool.query(query, params);
  return res.json({ items: rows.map(mapPrayer) });
});

router.put('/prayer/:id/status', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const { rows } = await pool.query('UPDATE prayer_requests SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
  return res.json({ item: mapPrayer(rows[0]) });
});

router.delete('/prayer/:id', requireAuth, requireRole('alpha_admin'), async (req, res) => {
  if (!assertDb(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
  const result = await pool.query('DELETE FROM prayer_requests WHERE id = $1', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Pedido não encontrado' });
  return res.json({ ok: true });
});

router.get('/columnists', async (_req, res) => {
  if (!assertDb(res)) return;
  const { rows } = await pool.query(
    "SELECT id, name, email, columnist_id, photo_url, bio, created_at FROM users WHERE role = 'columnist' ORDER BY created_at DESC"
  );
  return res.json({
    items: rows.map((r) => ({
      id: r.columnist_id || String(r.id),
      dbId: Number(r.id),
      name: r.name,
      email: r.email,
      photo: r.photo_url || '',
      bio: r.bio || '',
      createdAt: r.created_at,
    })),
  });
});

let acfBible = null;
let acfLoading = null;

const BOOK_NAME_MAP = {
  genesis: 'gn', gn: 'gn', gênesis: 'gn',
  exodus: 'ex', ex: 'ex', êxodo: 'ex',
  leviticus: 'lv', lv: 'lv', levítico: 'lv',
  numbers: 'nm', nm: 'nm', números: 'nm',
  deuteronomy: 'dt', dt: 'dt', deuteronômio: 'dt', deuteronomio: 'dt',
  joshua: 'js', js: 'js', josué: 'js',
  judges: 'jz', jz: 'jz', juízes: 'jz',
  ruth: 'rt', rt: 'rt', rute: 'rt',
  '1samuel': '1sm', '1sm': '1sm', '1samuel': '1sm', '1samuel': '1sm',
  '2samuel': '2sm', '2sm': '2sm', '2samuel': '2sm',
  '1kings': '1rs', '1rs': '1rs', '1reis': '1rs',
  '2kings': '2rs', '2rs': '2rs', '2reis': '2rs',
  '1chronicles': '1cr', '1cr': '1cr', '1crônicas': '1cr', '1cronicles': '1cr',
  '2chronicles': '2cr', '2cr': '2cr', '2crônicas': '2cr', '2cronicles': '2cr',
  ezra: 'ezr', ezr: 'ezr', esdras: 'ezr',
  nehemiah: 'ne', ne: 'ne', neemias: 'ne',
  esther: 'et', et: 'et',ester: 'et',
  job: 'job', job: 'job', Jó: 'job',
  psalms: 'sl', sl: 'sl', salmos: 'sl',
  proverbs: 'pv', pv: 'pv', provérbios: 'pv',
  ecclesiastes: 'ec', ec: 'ec', eclesiastes: 'ec',
  song: 'ct', ct: 'ct', cantares: 'ct', 'songofsolomon': 'ct',
  isaiah: 'is', is: 'is', isaías: 'is',
  jeremiah: 'jr', jr: 'jr', jeremias: 'jr',
  lamentations: 'lm', lm: 'lm', lamentações: 'lm',
  ezekiel: 'ez', ez: 'ez', ezequiel: 'ez',
  daniel: 'dn', dn: 'dn', daniel: 'dn',
  hosea: 'os', os: 'os', oséias: 'os',
  joel: 'jl', jl: 'jl', joel: 'jl',
  amos: 'am', am: 'am', amós: 'am',
  obadiah: 'ob', ob: 'ob', obadias: 'ob',
  jonah: 'jon', jon: 'jon', jonas: 'jon',
  micah: 'mq', mq: 'mq', miqéias: 'mq',
  nahum: 'na', na: 'na', naum: 'na',
  habakkuk: 'hc', hc: 'hc', habacuque: 'hc',
  zephaniah: 'sf', sf: 'sf', sofonias: 'sf',
  haggai: 'ag', ag: 'ag',Ageu: 'ag',
  zechariah: 'zc', zc: 'zc', Zacarias: 'zc',
  malachi: 'ml', ml: 'ml', Malaquias: 'ml',
  matthew: 'mt', mt: 'mt', mateus: 'mt',
  mark: 'mc', mc: 'mc', marcos: 'mc',
  luke: 'lc', lc: 'lc', Lucas: 'lc',
  john: 'jo', jo: 'jo', joão: 'jo',
  acts: 'at', at: 'at', atos: 'at',
  romans: 'rm', rm: 'rm', romanos: 'rm',
  '1corinthians': '1co', '1co': '1co', '1coríntios': '1co',
  '2corinthians': '2co', '2co': '2co', '2coríntios': '2co',
  galatians: 'gl', gl: 'gl', gálatas: 'gl',
  ephesians: 'ef', ef: 'ef', efésios: 'ef',
  philippians: 'fp', fp: 'fp', filipenses: 'fp',
  colossians: 'cl', cl: 'cl', colossenses: 'cl',
  '1thessalonians': '1ts', '1ts': '1ts', '1tessalonicenses': '1ts',
  '2thessalonians': '2ts', '2ts': '2ts', '2tessalonicenses': '2ts',
  '1timothy': '1tm', '1tm': '1tm', '1timóteo': '1tm',
  '2timothy': '2tm', '2tm': '2tm', '2timóteo': '2tm',
  titus: 'tt', tt: 'tt', Tito: 'tt',
  philemon: 'fm', fm: 'fm', Filemom: 'fm',
  hebrews: 'hb', hb: 'hb', hebreus: 'hb',
  james: 'tg', tg: 'tg', Tiago: 'tg',
  '1peter': '1pe', '1pe': '1pe', '1pedro': '1pe',
  '2peter': '2pe', '2pe': '2pe', '2pedro': '2pe',
  '1john': '1jo', '1jo': '1jo', '1joão': '1jo',
  '2john': '2jo', '2jo': '2jo', '2joão': '2jo',
  '3john': '3jo', '3jo': '3jo', '3joão': '3jo',
  jude: 'jd', jd: 'jd', Judas: 'jd',
  revelation: 'ap', ap: 'ap', apocalipse: 'ap',
};

async function loadAcfBible() {
  if (acfBible) return acfBible;
  if (acfLoading) return acfLoading;

  acfLoading = (async () => {
    try {
      const https = await import('https');
      const data = await new Promise((resolve, reject) => {
        const url = 'https://raw.githubusercontent.com/maatheusgois/bible/main/versions/pt-br/acf.json';
        https.get(url, (resp) => {
          let body = '';
          resp.on('data', (chunk) => { body += chunk; });
          resp.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (_e) { reject(new Error('Parse error')); }
          });
        }).on('error', reject);
      });
      acfBible = data;
      return data;
    } catch (_err) {
      acfLoading = null;
      throw _err;
    }
  })();

  return acfLoading;
}

router.get('/bible/:reference', async (req, res) => {
  try {
    const reference = decodeURIComponent(req.params.reference).replace(/\+/g, ' ').trim().toLowerCase();
    const parts = reference.split(/\s+/);
    const chapterStr = parts.pop();
    const bookRaw = parts.join(' ');
    const chapter = parseInt(chapterStr, 10);

    if (!bookRaw || !chapter || chapter < 1) {
      return res.status(400).json({ error: 'Referência inválida. Use: livro+capítulo (ex: jo+3)' });
    }

    const bookId = BOOK_NAME_MAP[bookRaw] || bookRaw;
    const bible = await loadAcfBible();
    const book = bible.find((b) => b.id === bookId);

    if (!book) {
      return res.status(404).json({ error: `Livro não encontrado: ${bookRaw}` });
    }

    if (chapter < 1 || chapter > book.chapters.length) {
      return res.status(404).json({ error: `Capítulo não encontrado: ${chapter}` });
    }

    const verses = book.chapters[chapter - 1].map((text, i) => ({
      verse: i + 1,
      text,
    }));

    return res.json({
      reference: `${book.name} ${chapter}`,
      translation_name: 'Almeida Corrigida Fiel',
      translation_id: 'acf',
      verses,
      text: verses.map((v) => v.text).join('\n'),
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Erro ao comunicar com a API bíblica' });
  }
});

export default router;
