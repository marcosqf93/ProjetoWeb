import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER;
const SITE_NAME = 'PODBEN';

export async function sendNewCommentEmail({ context, contextId, authorName, content, pageTitle }) {
  if (!ADMIN_EMAIL || !process.env.SMTP_USER) return;

  const subject = `[${SITE_NAME}] Novo comentário em ${context === 'news' ? 'notícia' : 'coluna'}`;
  const link = context === 'news'
    ? `https://podbenaqui.netlify.app/noticia.html?id=${contextId}`
    : `https://podbenaqui.netlify.app/coluna.html?id=${contextId}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:linear-gradient(135deg,#0f0c29,#1a1040);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
        <h1 style="color:#fff;margin:0;font-size:20px">${SITE_NAME}</h1>
        <p style="color:#b8a9ff;margin:4px 0 0;font-size:12px">Notificação de comentário</p>
      </div>
      <div style="background:#f8fbff;border:1px solid #d4e1f6;border-radius:10px;padding:16px">
        <p style="margin:0 0 8px;color:#4a5e82;font-size:13px;text-transform:uppercase;letter-spacing:0.04em">Novo comentário em ${context === 'news' ? 'notícia' : 'coluna'}</p>
        <p style="margin:0 0 12px"><strong>${authorName}</strong> comentou:</p>
        <blockquote style="margin:0 0 16px;padding:12px;border-left:3px solid #6c3bff;background:#fff;border-radius:8px;color:#2c4060;font-style:italic">${content}</blockquote>
        ${pageTitle ? `<p style="margin:0 0 12px;color:#5a6f91;font-size:13px">Publicação: <strong>${pageTitle}</strong></p>` : ''}
        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ver comentário</a>
      </div>
      <p style="text-align:center;color:#8899bb;font-size:11px;margin-top:16px">Você recebeu este e-mail porque é administrador do ${SITE_NAME}.</p>
    </div>`;

  await transporter.sendMail({ from: `"${SITE_NAME}" <${FROM_EMAIL}>`, to: ADMIN_EMAIL, subject, html });
}

export async function sendPrayerEmail({ nome, celular, mensagem }) {
  if (!ADMIN_EMAIL || !process.env.SMTP_USER) return;

  const subject = `[${SITE_NAME}] Novo pedido de oração`;
  const link = 'https://podbenaqui.netlify.app/';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:linear-gradient(135deg,#0f0c29,#1a1040);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
        <h1 style="color:#fff;margin:0;font-size:20px">${SITE_NAME}</h1>
        <p style="color:#b8a9ff;margin:4px 0 0;font-size:12px">Novo pedido de oração</p>
      </div>
      <div style="background:#f8fbff;border:1px solid #d4e1f6;border-radius:10px;padding:16px">
        <p style="margin:0 0 8px;color:#4a5e82;font-size:13px;text-transform:uppercase;letter-spacing:0.04em">Pedido de oração</p>
        <p style="margin:0 0 4px"><strong>${nome}</strong></p>
        ${celular ? `<p style="margin:0 0 12px;color:#5a6f91;font-size:13px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a6f91" stroke-width="2" style="vertical-align:middle"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> ${celular}</p>` : ''}
        <blockquote style="margin:0 0 16px;padding:12px;border-left:3px solid #25D366;background:#fff;border-radius:8px;color:#2c4060;font-style:italic">${mensagem}</blockquote>
        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ver no portal</a>
      </div>
      <p style="text-align:center;color:#8899bb;font-size:11px;margin-top:16px">Você recebeu este e-mail porque é administrador do ${SITE_NAME}.</p>
    </div>`;

  await transporter.sendMail({ from: `"${SITE_NAME}" <${FROM_EMAIL}>`, to: ADMIN_EMAIL, subject, html });
}
