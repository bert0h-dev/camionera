import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Envío de correo con Resend (API HTTP, sin SDK).
 * Sin RESEND_API_KEY no envía: escribe el mensaje en el log, útil en desarrollo.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY') || undefined;
    this.from =
      config.get<string>('MAIL_FROM') ??
      'Central Camionera <onboarding@resend.dev>';
  }

  get enabled() {
    return !!this.apiKey;
  }

  async send(message: MailMessage) {
    if (!this.apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada; correo no enviado a ${message.to}: ${message.subject}\n${message.text}`,
      );
      return;
    }
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, ...message, to: [message.to] }),
    });
    if (!res.ok) {
      // No se expone el detalle al usuario; queda en el log del servidor
      this.logger.error(`Resend respondió ${res.status}: ${await res.text()}`);
      throw new Error('No se pudo enviar el correo');
    }
  }
}

/** Plantilla HTML sencilla con la marca (banda índigo y acento ámbar). */
export function brandedEmail(opts: {
  title: string;
  intro: string;
  action?: { label: string; url: string };
  outro?: string;
}) {
  const button = opts.action
    ? `<p style="margin:28px 0"><a href="${opts.action.url}" style="background:#fbbf24;color:#1e1b4b;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block">${opts.action.label}</a></p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#eceff8;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:linear-gradient(90deg,#1e1b4b,#4338ca);padding:24px 32px;color:#ffffff;font-size:18px;font-weight:bold">Central Camionera</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 12px;font-size:22px">${opts.title}</h1>
<p style="margin:0;line-height:1.6;color:#475569">${opts.intro}</p>
${button}
${opts.outro ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">${opts.outro}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}
