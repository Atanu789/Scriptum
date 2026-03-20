type MailOptions = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

function parseBoolean(value?: string): boolean {
  return String(value || '').toLowerCase() === 'true';
}

function getRecipients(to: string | string[]): string[] {
  if (Array.isArray(to)) {
    return to.map((entry) => entry.trim()).filter(Boolean);
  }
  return to
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function sendEmail(options: MailOptions): Promise<{ sent: boolean; reason?: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!host || !user || !pass || !from) {
    return { sent: false, reason: 'SMTP env vars missing (SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM)' };
  }

  try {
    // Lazy-load nodemailer so local dev doesn't crash if package/env is missing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer') as {
      createTransport: (opts: unknown) => {
        sendMail: (payload: unknown) => Promise<unknown>;
      };
    };

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: parseBoolean(process.env.SMTP_SECURE) || port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: getRecipients(options.to).join(','),
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    return { sent: false, reason: message };
  }
}
