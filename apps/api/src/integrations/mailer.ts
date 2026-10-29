/**
 * Envio de e-mail. A aplicação depende só da interface `Mailer`; o servidor escolhe a implementação:
 * SMTP (Gmail com senha de app) em produção, memória nos testes. Nenhum conteúdo de e-mail vai para o log.
 */
import nodemailer from 'nodemailer';
import { AppError } from '../shared/errors';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return {
    async send(message) {
      try {
        await transport.sendMail({ from: cfg.from, ...message });
      } catch {
        // Não repassa a mensagem do provedor: pode conter dados da conta SMTP.
        throw new AppError(503, 'email_unavailable', 'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.');
      }
    },
  };
}

/** Guarda as mensagens em memória (testes e desenvolvimento sem SMTP). */
export function createMemoryMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
