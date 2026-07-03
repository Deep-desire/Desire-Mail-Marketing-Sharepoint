/**
 * sharepoint.js
 * Microsoft Graph API service for fetching contacts from SharePoint Lists.
 * Configurations are stored in the database (SharePointConfig model).
 * Credentials fall back to .env root values if not set per-config.
 */

const axios = require('axios');
const { prisma } = require('./prisma');

// ── Multi-credential token cache: Map<"tenantId:clientId", { token, expiresAt }> ──
const _tokenCache = new Map();

/**
 * Resolve credentials for a DB config row.
 * If the config row has null credentials, falls back to main .env vars.
 */
function resolveCredentials(config) {
  return {
    tenantId:     config.tenantId     || process.env.TENANT_ID,
    clientId:     config.clientId     || process.env.SP_CLIENT_ID,
    clientSecret: config.clientSecret || process.env.SP_CLIENT_SECRET,
    siteId:       config.siteId,
    listId:       config.listId,
    name:         config.name,
  };
}

/**
 * Acquire a Graph API access token for the given credentials.
 * Caches tokens per tenantId:clientId pair with a 2-minute expiry buffer.
 */
async function getAccessToken(tenantId, clientId, clientSecret) {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'SharePoint credentials incomplete. Ensure TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET are configured.'
    );
  }

  const cacheKey = `${tenantId}:${clientId}`;
  const cached = _tokenCache.get(cacheKey);
  const now = Date.now();

  if (cached && now < cached.expiresAt - 120_000) {
    return cached.token;
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });

  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const token = res.data.access_token;
  const expiresAt = now + res.data.expires_in * 1000;
  _tokenCache.set(cacheKey, { token, expiresAt });
  console.log(`[SharePoint] Token cached for ${cacheKey}, expires in ${res.data.expires_in}s`);
  return token;
}

/**
 * Auto-detect name and email field names from first item's fields.
 * SharePoint internal field names can vary across sites.
 */
function resolveFieldNames(fields = {}) {
  const keys = Object.keys(fields);
  const nameCandidates  = ['contactname', 'title', 'fullname', 'name', 'full_x0020_name', 'firstname'];
  const emailCandidates = ['email', 'emailaddress', 'email_x0020_address', 'workemail', 'work_x0020_email'];
  
  const nameField  = keys.find((key) => nameCandidates.includes(key.toLowerCase())) || null;
  const emailField = keys.find((key) => emailCandidates.includes(key.toLowerCase())) || null;
  return { nameField, emailField };
}

/**
 * Load a SharePointConfig record from DB by its UUID.
 * Throws a descriptive error if not found.
 */
async function loadConfig(configId) {
  const config = await prisma.sharePointConfig.findUnique({ where: { id: configId } });
  if (!config) {
    throw new Error(`SharePoint config '${configId}' not found. Please add it from Settings → SharePoint Lists.`);
  }
  if (!config.isActive) {
    throw new Error(`SharePoint config '${config.name}' is disabled.`);
  }
  return config;
}

/**
 * Fetch all contacts from a SharePoint List identified by DB config UUID.
 * Returns: Array<{ name: string, email: string, modifiedAt: string }>
 */
async function getSharePointContacts(configId) {
  const dbConfig = await loadConfig(configId);
  const { tenantId, clientId, clientSecret, siteId, listId, name } = resolveCredentials(dbConfig);

  if (!siteId || !listId) {
    throw new Error(`SharePoint config '${name}' is missing Site ID or List ID.`);
  }

  const token = await getAccessToken(tenantId, clientId, clientSecret);

  const baseUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`;
  let nextUrl   = `${baseUrl}?expand=fields&$top=999`;
  const allItems = [];

  while (nextUrl) {
    const res = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { value = [], '@odata.nextLink': nextLink } = res.data;
    allItems.push(...value);
    nextUrl = nextLink || null;
  }

  if (allItems.length === 0) {
    console.warn(`[SharePoint] List '${name}' returned 0 items`);
    return [];
  }

  const { nameField, emailField } = resolveFieldNames(allItems[0]?.fields || {});

  if (!emailField) {
    const available = Object.keys(allItems[0]?.fields || {}).join(', ');
    throw new Error(
      `Could not detect an Email field in SharePoint list '${name}'. Available fields: ${available}`
    );
  }

  const contacts = allItems
    .map((item) => {
      const fields = item.fields || {};
      const name_v = nameField  ? String(fields[nameField]  || '').trim() : '';
      const email  = emailField ? String(fields[emailField] || '').trim().toLowerCase() : '';
      const modifiedAt = item.lastModifiedDateTime || fields.Modified || new Date().toISOString();
      return { name: name_v, email, modifiedAt };
    })
    .filter((c) => c.email);

  console.log(`[SharePoint] Fetched ${contacts.length} contacts from '${name}'`);
  return contacts;
}

/**
 * Test connection to a SharePoint list by fetching exactly 1 item.
 * Returns the number of fields found, confirming access.
 */
async function testConnection(configId) {
  const dbConfig = await loadConfig(configId);
  const { tenantId, clientId, clientSecret, siteId, listId, name } = resolveCredentials(dbConfig);

  const token = await getAccessToken(tenantId, clientId, clientSecret);
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=1`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  const fields = res.data.value?.[0]?.fields || {};
  const fieldNames = Object.keys(fields);
  console.log(`[SharePoint] Test OK for '${name}' — ${fieldNames.length} fields found`);
  return { success: true, message: `Connected to '${name}'`, fieldCount: fieldNames.length, fields: fieldNames };
}

/**
 * Discover field names in a SharePoint list (debug helper).
 */
async function discoverFields(configId) {
  const result = await testConnection(configId);
  return result.fields;
}

module.exports = { getSharePointContacts, getAccessToken, discoverFields, testConnection };
