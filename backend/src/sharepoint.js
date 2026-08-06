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
    tenantId: config.tenantId || process.env.TENANT_ID,
    clientId: config.clientId || process.env.SP_CLIENT_ID,
    clientSecret: config.clientSecret || process.env.SP_CLIENT_SECRET,
    siteId: config.siteId,
    listId: config.listId,
    name: config.name,
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
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
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
 * Fetch list column definitions from Graph API to map display names (e.g. "Email", "Full Name")
 * to internal field names (e.g. "field_7", "field_3").
 */
async function fetchColumnMap(siteId, listId, token) {
  try {
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`;
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    const columns = res.data.value || [];
    const map = new Map();
    for (const col of columns) {
      if (col.displayName && col.name) {
        map.set(col.displayName.trim(), col.name.trim());
      }
    }
    return map;
  } catch (err) {
    console.warn(`[SharePoint Column Map] Could not fetch columns metadata: ${err.message}`);
    return new Map();
  }
}

/**
 * Auto-detect name and email field names from item data and column metadata.
 * Handles standard SharePoint field names, custom names, and Excel-imported (field_0, field_7) schemas.
 */
function resolveFieldNames(allItems = [], columnMap = new Map()) {
  if (!allItems || allItems.length === 0) return { nameField: null, emailField: null };

  const firstFields = allItems[0]?.fields || {};
  const keys = Object.keys(firstFields);

  const nameCandidates = [
    'contactname', 'title', 'fullname', 'name', 'full_x0020_name', 'firstname',
    'leadowner', 'owner', 'contact', 'customername', 'person'
  ];
  const emailCandidates = [
    'email', 'emailaddress', 'email_x0020_address', 'workemail', 'work_x0020_email',
    'mail', 'primaryemail', 'e-mail'
  ];

  let emailField = null;
  let nameField = null;

  // 1. Column Map matching (displayName -> internalName)
  for (const [dispName, intName] of columnMap.entries()) {
    const cleanDisp = dispName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!emailField) {
      if (emailCandidates.some((c) => c.replace(/[^a-z0-9]/g, '') === cleanDisp) || cleanDisp.includes('email') || cleanDisp === 'mail') {
        if (keys.includes(intName)) {
          emailField = intName;
        }
      }
    }
    if (!nameField) {
      if (cleanDisp.includes('fullname') || cleanDisp.includes('contactname') || cleanDisp === 'name' || cleanDisp === 'leadowner') {
        if (keys.includes(intName)) {
          nameField = intName;
        }
      }
    }
  }

  // 2. Direct internal key name matching (e.g. 'Email', 'Title', 'WorkEmail')
  if (!emailField) {
    emailField = keys.find((key) =>
      emailCandidates.includes(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
    ) || null;
  }
  if (!nameField) {
    nameField = keys.find((key) =>
      nameCandidates.includes(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
    ) || null;
  }

  // 3. Value-based email detection: scan item field values across items for email pattern
  if (!emailField) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const sampleItems = allItems.slice(0, 15);
    const keyMatchCount = {};

    for (const item of sampleItems) {
      const f = item.fields || {};
      for (const key of Object.keys(f)) {
        if (key.startsWith('@') || key === 'id' || key === 'ContentType' || key === 'Attachments') continue;
        const val = String(f[key] || '').trim();
        if (emailRegex.test(val)) {
          keyMatchCount[key] = (keyMatchCount[key] || 0) + 1;
        }
      }
    }

    let maxCount = 0;
    for (const [key, count] of Object.entries(keyMatchCount)) {
      if (count > maxCount) {
        maxCount = count;
        emailField = key;
      }
    }
  }

  // 4. Fallback for Name field
  if (!nameField) {
    if (firstFields.Title && typeof firstFields.Title === 'string' && firstFields.Title.trim()) {
      nameField = 'Title';
    } else {
      for (const key of keys) {
        if (key === emailField || key.startsWith('@') || key === 'id' || key === 'ContentType' || key.includes('Modified') || key.includes('Created')) continue;
        const val = String(firstFields[key] || '').trim();
        if (val && val.length >= 2 && val.length <= 60 && !val.includes('{') && !val.includes('http')) {
          nameField = key;
          break;
        }
      }
    }
  }

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
  const columnMap = await fetchColumnMap(siteId, listId, token);

  const baseUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`;
  let nextUrl = `${baseUrl}?expand=fields&$top=999`;
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

  const { nameField, emailField } = resolveFieldNames(allItems, columnMap);

  if (!emailField) {
    const available = Object.keys(allItems[0]?.fields || {}).join(', ');
    throw new Error(
      `Could not detect an Email field in SharePoint list '${name}'. Available fields: ${available}`
    );
  }

  // Create a reverse column map (internalName -> displayName)
  const reverseColumnMap = new Map();
  for (const [dispName, intName] of columnMap.entries()) {
    reverseColumnMap.set(intName, dispName);
  }

  const contacts = allItems
    .map((item) => {
      const fields = item.fields || {};
      let name_v = nameField ? String(fields[nameField] || '').trim() : '';
      if (!name_v && fields.Title) name_v = String(fields.Title).trim();
      const email = emailField ? String(fields[emailField] || '').trim().toLowerCase() : '';
      const modifiedAt = item.lastModifiedDateTime || fields.Modified || new Date().toISOString();

      // Transform rawFields so internal names like field_0, field_1 are replaced by real SharePoint display names
      const friendlyFields = {};
      for (const [key, val] of Object.entries(fields)) {
        if (key.startsWith('@') || key === 'id' || key === 'ContentType' || key === 'Attachments' || key.endsWith('LookupId')) continue;
        const displayName = reverseColumnMap.get(key) || key;
        friendlyFields[displayName] = val;
      }

      return { name: name_v, email, modifiedAt, itemId: item.id, rawFields: friendlyFields };
    })
    .filter((c) => c.email);

  console.log(`[SharePoint] Fetched ${contacts.length} contacts from '${name}' using emailField '${emailField}' and nameField '${nameField}'`);
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
  const dbConfig = await loadConfig(configId);
  const { tenantId, clientId, clientSecret, siteId, listId } = resolveCredentials(dbConfig);
  const token = await getAccessToken(tenantId, clientId, clientSecret);
  const columnMap = await fetchColumnMap(siteId, listId, token);
  const conn = await testConnection(configId);
  return {
    rawFields: conn.fields,
    columnMap: Object.fromEntries(columnMap)
  };
}

// Cache of list IDs where we have verified or created the EmailSent column during this session
const _listColumnsChecked = new Set();

/**
 * Verify if the EmailSent column exists in the list; if not, create it as a Single Line of Text column.
 */
async function ensureEmailSentColumnExists(siteId, listId, token) {
  if (_listColumnsChecked.has(listId)) {
    return;
  }

  try {
    const columnsUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`;
    const res = await axios.get(columnsUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const columns = res.data.value || [];
    const hasColumn = columns.some(
      col => col.name === 'EmailSent' || col.displayName?.trim() === 'Email Sent'
    );

    if (!hasColumn) {
      console.log(`[SharePoint Column Auto-Create] 'EmailSent' column not found in list '${listId}'. Creating...`);
      await axios.post(
        columnsUrl,
        {
          displayName: 'Email Sent',
          name: 'EmailSent',
          text: {} // Empty object indicates "Single line of text" column type
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`[SharePoint Column Auto-Create] Successfully created 'EmailSent' column in list '${listId}'.`);
      // Provide a 1 second delay for SharePoint database replication/propagation
      await new Promise(r => setTimeout(r, 1000));
    }

    _listColumnsChecked.add(listId);
  } catch (err) {
    console.warn(`[SharePoint Column Auto-Create] Failed to verify/create 'EmailSent' column for list '${listId}': ${err.message}`);
  }
}

/**
 * Update the EmailSent field of a specific item in the SharePoint list.
 * Fails silently with a warning if the list doesn't have an EmailSent column or is inaccessible.
 */
async function updateSharePointEmailSent(configId, itemId, sentDate = new Date()) {
  try {
    const dbConfig = await prisma.sharePointConfig.findUnique({ where: { id: configId } });
    if (!dbConfig) {
      console.warn(`[SharePoint Write-back] Config '${configId}' not found in database. Skipping write-back.`);
      return;
    }
    const { tenantId, clientId, clientSecret, siteId, listId } = resolveCredentials(dbConfig);
    if (!siteId || !listId) {
      console.warn(`[SharePoint Write-back] Config '${dbConfig.name}' missing Site ID or List ID.`);
      return;
    }

    const token = await getAccessToken(tenantId, clientId, clientSecret);

    // Auto-create the column if it doesn't exist
    await ensureEmailSentColumnExists(siteId, listId, token);

    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}/fields`;

    // Format date as [DD/MM/YYYY] without time
    const day = String(sentDate.getDate()).padStart(2, '0');
    const month = String(sentDate.getMonth() + 1).padStart(2, '0');
    const year = sentDate.getFullYear();
    const formattedDate = `[${day}/${month}/${year}]`;

    await axios.patch(
      url,
      {
        EmailSent: formattedDate,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[SharePoint Write-back] Updated item ${itemId} in '${dbConfig.name}' with EmailSent: ${formattedDate}`);
  } catch (err) {
    console.warn(
      `[SharePoint Write-back] Failed to update EmailSent for item ${itemId} on config ${configId}: ${err.message}`
    );
  }
}

module.exports = {
  getSharePointContacts,
  getAccessToken,
  discoverFields,
  testConnection,
  updateSharePointEmailSent,
};
