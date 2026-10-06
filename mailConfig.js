// Outgoing email settings, shared by the enquiry and booking mailers.
// Defaults to Zoho Mail (reachus@midorimediacompany.com). Set SMTP_HOST / SMTP_PORT to use another provider.
import 'dotenv/config';

const port = Number(process.env.SMTP_PORT || 465);

export const smtpConfig = {
  host: process.env.SMTP_HOST || "smtp.zoho.com",
  port,
  secure: port === 465,
  auth: {
    user: process.env.EMAIL_SENDER,
    pass: process.env.PASSWORD_SENDER,
  },
};
