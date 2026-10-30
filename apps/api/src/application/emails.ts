/** Textos dos e-mails da aplicação (pt-BR), em texto puro e HTML simples. */
import type { EmailMessage } from '../integrations/mailer';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function verificationEmail(to: string, displayName: string, link: string): EmailMessage {
  const name = displayName.trim() || 'aventureiro';
  return {
    to,
    subject: 'Confirme seu e-mail no Ascend',
    text: [
      `Olá, ${name}!`,
      '',
      'Para ativar sua conta no Ascend, confirme seu e-mail abrindo o link abaixo:',
      link,
      '',
      'O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.',
      '',
      'Ascend, um produto Falkyria.',
    ].join('\n'),
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0d0b09;font-family:Georgia,serif;color:#efe6d2">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
  <p style="letter-spacing:.3em;color:#d4a83a;font-size:13px;margin:0 0 24px">ASCEND</p>
  <h1 style="font-size:22px;margin:0 0 16px">Olá, ${escapeHtml(name)}!</h1>
  <p style="line-height:1.6;margin:0 0 24px">Para ativar sua conta no Ascend, confirme seu e-mail:</p>
  <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#d4a83a;color:#14110d;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold">Confirmar e-mail</a></p>
  <p style="line-height:1.6;font-size:13px;color:#a89e88;margin:0 0 8px">Se o botão não abrir, copie este endereço no navegador:<br>${escapeHtml(link)}</p>
  <p style="line-height:1.6;font-size:13px;color:#a89e88;margin:0">O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.</p>
</div></body></html>`,
  };
}
