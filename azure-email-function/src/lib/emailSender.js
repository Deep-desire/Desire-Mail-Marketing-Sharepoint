const TENANT_ID = process.env.GRAPH_TENANT_ID;
const CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const SENDER = process.env.GRAPH_SENDER_EMAIL;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

// Client-credentials (app-only) OAuth2 token for Microsoft Graph, cached until
// shortly before expiry so we don't request a new one on every send.
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Failed to acquire Graph access token (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Refresh 60s before actual expiry to avoid using a token that expires mid-request.
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Sends a single email message via Microsoft Graph (app-only sendMail on behalf of GRAPH_SENDER_EMAIL).
 * @param {object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML body
 * @param {string} [params.text] - Plain text body (used only if html is not provided)
 */
async function sendEmail({ to, subject, html, text }) {
  const token = await getAccessToken();

  const message = {
    subject,
    body: html
      ? { contentType: 'HTML', content: html }
      : { contentType: 'Text', content: text || '' },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Graph sendMail failed (${response.status}): ${errBody}`);
  }
}

module.exports = { sendEmail };
