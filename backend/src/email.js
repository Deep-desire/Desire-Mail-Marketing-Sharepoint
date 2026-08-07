const GRAPH_TENANT_ID = process.env.GRAPH_TENANT_ID;
const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const GRAPH_CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const GRAPH_SENDER_EMAIL = process.env.GRAPH_SENDER_EMAIL;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

// Client-credentials (app-only) OAuth2 token for Microsoft Graph, cached until
// shortly before expiry so we don't request a new one on every send.
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
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
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function sendViaGraph(options) {
  const token = await getAccessToken();

  const message = {
    subject: options.subject,
    body: options.html
      ? { contentType: 'HTML', content: options.html }
      : { contentType: 'Text', content: options.text || '' },
    toRecipients: [{ emailAddress: { address: options.to } }],
  };

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_SENDER_EMAIL)}/sendMail`, {
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

  return 'graph-sent';
}

async function sendEmail(options) {
  const messageId = await sendViaGraph(options);
  console.log(`Email sent via Graph to ${options.to}`);
  return { messageId, provider: 'graph' };
}

/**
 * Calculates a random individual email delay between configured minimum and maximum limits (in milliseconds).
 * Defaults to a random duration between 10 and 15 seconds.
 *
 * @returns {number} Delay in milliseconds
 */
function getIndividualDelay() {
  const minSec = parseInt(process.env.EMAIL_DELAY_MIN_SEC || '10', 10);
  const maxSec = parseInt(process.env.EMAIL_DELAY_MAX_SEC || '15', 10);
  const minMs = Math.min(minSec, maxSec) * 1000;
  const maxMs = Math.max(minSec, maxSec) * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

module.exports = { sendEmail, getIndividualDelay };
