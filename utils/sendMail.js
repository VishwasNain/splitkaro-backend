// Sends a transactional email through Brevo (same account emailOtpController uses).
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;

module.exports = async function sendMail({ to, subject, html }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: 'Splitkaro' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Brevo send failed: ${response.status} ${await response.text()}`);
  }
};
