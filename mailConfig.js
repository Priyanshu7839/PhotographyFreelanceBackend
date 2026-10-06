// Outgoing email settings, shared by the enquiry and booking mailers.
//
// Render's free plan blocks outgoing SMTP ports (25/465/587), so when
// RESEND_API_KEY is set, mail is sent over Resend's HTTPS API instead.
// Without RESEND_API_KEY it falls back to SMTP (Zoho by default; Gmail if
// EMAIL_SENDER is a Gmail address). Set SMTP_HOST / SMTP_PORT to use another server.
import 'dotenv/config';

const formatAddress = (value) => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatAddress).flat().filter(Boolean);
  if (value.address) return value.name ? `"${value.name}" <${value.address}>` : value.address;
  return String(value);
};

const toList = (value) => {
  const formatted = formatAddress(value);
  if (!formatted) return undefined;
  const list = Array.isArray(formatted) ? formatted : formatted.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)(?![^<]*>)/);
  const cleaned = list.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
};

const toAttachments = (attachments = []) =>
  attachments
    .filter((a) => a && a.content != null)
    .map((a) => ({
      filename: a.filename || 'attachment',
      content: Buffer.isBuffer(a.content)
        ? a.content.toString('base64')
        : a.encoding === 'base64'
          ? a.content
          : Buffer.from(String(a.content)).toString('base64'),
    }));

// Minimal nodemailer custom transport that posts to https://api.resend.com/emails
const resendTransport = (apiKey) => ({
  name: 'resend-http',
  version: '1.0.0',
  verify(callback) {
    callback(null, true);
  },
  send(mail, callback) {
    const data = mail.data || {};
    const body = {
      from: formatAddress(data.from) || process.env.EMAIL_SENDER,
      to: toList(data.to),
      cc: toList(data.cc),
      bcc: toList(data.bcc),
      reply_to: toList(data.replyTo),
      subject: data.subject || '',
      html: typeof data.html === 'string' ? data.html : undefined,
      text: typeof data.text === 'string' ? data.text : undefined,
    };
    const attachments = toAttachments(data.attachments);
    if (attachments.length) body.attachments = attachments;
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(`Resend API ${res.status}: ${json.message || JSON.stringify(json)}`);
        }
        callback(null, { messageId: json.id, envelope: { from: body.from, to: body.to }, response: 'OK' });
      })
      .catch((err) => callback(err));
  },
});

const port = Number(process.env.SMTP_PORT || 465);
const auth = {
  // SMTP_USER is the mailbox that logs in, when EMAIL_SENDER (the "From" address) is an alias of it.
  user: process.env.SMTP_USER || process.env.EMAIL_SENDER,
  pass: process.env.PASSWORD_SENDER,
};

export const smtpConfig = process.env.RESEND_API_KEY
  ? resendTransport(process.env.RESEND_API_KEY)
  : /@gmail\.com$/i.test(process.env.EMAIL_SENDER || '') && !process.env.SMTP_HOST
    ? { service: 'gmail', auth }
    : { host: process.env.SMTP_HOST || 'smtp.zoho.com', port, secure: port === 465, auth };
