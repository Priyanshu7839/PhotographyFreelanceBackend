// Outgoing email settings, shared by the enquiry and booking mailers.
// Defaults to Zoho Mail (reachus@midorimediacompany.com). Set SMTP_HOST / SMTP_PORT to use another provider.
import 'dotenv/config';

const port = Number(process.env.SMTP_PORT || 465);
const auth = {
  // SMTP_USER is the mailbox that logs in, when EMAIL_SENDER (the "From" address) is an alias of it
  user: process.env.SMTP_USER || process.env.EMAIL_SENDER,
  pass: process.env.PASSWORD_SENDER,
};

// A Gmail sender keeps working through Gmail until EMAIL_SENDER is switched to the Zoho address.
export const smtpConfig = /@gmail\.com$/i.test(process.env.EMAIL_SENDER || "") && !process.env.SMTP_HOST
  ? { service: "gmail", auth }
  : { host: process.env.SMTP_HOST || "smtp.zoho.com", port, secure: port === 465, auth };
