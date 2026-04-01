import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import sanitizeHtml from 'sanitize-html';
import authRoutes from './routes/auth.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

app.use('/auth/login', loginLimiter);
app.use('/auth', authRoutes);

app.post('/sanitize-preview', (req, res) => {
  const cleaned = sanitizeHtml(req.body?.html || '', { allowedTags: ['p', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li', 'a'], allowedAttributes: { a: ['href'] } });
  return res.json({ sanitized: cleaned });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`PODBEN backend listening on :${port}`);
});
