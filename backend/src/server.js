import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import sanitizeHtml from 'sanitize-html';
import authRoutes from './routes/auth.js';
import newsRoutes from './routes/news.js';
import publicRoutes from './routes/public.js';
import { hasDatabase, initDb } from './db.js';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  'https://podbenaqui.netlify.app',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

app.use(globalLimiter);
app.use('/auth/login', loginLimiter);
app.use('/auth', authRoutes);
app.use('/news', newsRoutes);
app.use('/public', publicRoutes);

app.post('/sanitize-preview', (req, res) => {
  const cleaned = sanitizeHtml(req.body?.html || '', { allowedTags: ['p', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li', 'a'], allowedAttributes: { a: ['href'] } });
  return res.json({ sanitized: cleaned });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;

async function bootstrap() {
  try {
    if (hasDatabase) {
      await initDb();
      console.log('Banco de dados inicializado.');
    } else {
      console.warn('DATABASE_URL ausente: endpoints persistentes retornarão 503 até configurar banco.');
    }

    app.listen(port, () => {
      console.log(`PODBEN backend listening on :${port}`);
    });
  } catch (error) {
    console.error('Falha ao inicializar servidor:', error);
    process.exit(1);
  }
}

bootstrap();
