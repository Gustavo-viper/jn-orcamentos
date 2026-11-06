import nodemailer from 'nodemailer';
import { config } from '../config.js';

export const mailConfigured = () => !!config.smtp.host;

/**
 * Envia e-mail via SMTP. Sem SMTP configurado, o conteúdo é registrado no console
 * do servidor (útil em instalação local) e a função retorna false.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailConfigured()) {
    console.warn(`[email] SMTP não configurado. E-mail para ${to} não enviado.\nAssunto: ${subject}\n${text}`);
    return false;
  }
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
  return true;
}
