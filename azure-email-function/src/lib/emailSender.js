const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || process.env.AWS_ACCESS_KEY_ID,
    pass: process.env.SMTP_PASS || process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Sends a single email message via configured Nodemailer / AWS SES transport.
 * @param {object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML body
 * @param {string} [params.text] - Plain text body
 * @param {string} [params.from] - Sender address
 */
async function sendEmail({ to, subject, html, text, from }) {
  const mailOptions = {
    from: from || process.env.FROM_EMAIL || '"Desire Marketing" <noreply@desire-marketing.com>',
    to,
    subject,
    html,
    text,
  };
  return await transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };
