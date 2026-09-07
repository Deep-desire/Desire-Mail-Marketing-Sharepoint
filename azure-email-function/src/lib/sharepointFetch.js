const { prisma } = require('./prisma');

const _tokenCache = new Map();

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

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    throw new Error(`Failed to acquire Graph API token (tenant ${tenantId}): ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const expiresAt = now + data.expires_in * 1000;
  _tokenCache.set(cacheKey, { token: data.access_token, expiresAt });
  return data.access_token;
}

async function graphGetWithRetry(url, token, context, maxRetries = 5) {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      return res.json();
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(`Graph API request failed (${res.status}): ${await res.text()}`);
    }

    const retryAfterHeader = res.headers.get('retry-after');
    const delayMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : Math.min(1000 * 2 ** attempt, 30_000);

    context?.warn?.(`[SharePoint Fetch] Graph API ${res.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delayMs));
    attempt += 1;
  }
}

async function fetchColumnMap(siteId, listId, token, context) {
  try {
    const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`;
    const data = await graphGetWithRetry(url, token, context);
    const columns = data.value || [];
    const map = new Map();
    for (const col of columns) {
      if (col.displayName && col.name) {
        map.set(col.displayName.trim(), col.name.trim());
      }
    }
    return map;
  } catch (err) {
    context?.warn?.(`[SharePoint Fetch] Could not fetch columns metadata: ${err.message}`);
    return new Map();
  }
}

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

async function loadConfig(configId) {
  const config = await prisma.sharePointConfig.findUnique({ where: { id: configId } });
  if (!config) {
    throw new Error(`SharePoint config '${configId}' not found.`);
  }
  if (!config.isActive) {
    throw new Error(`SharePoint config '${config.name}' is disabled.`);
  }
  return config;
}

/**
 * Fetch all contacts from a SharePoint List identified by DB config UUID.
 * Pages through @odata.nextLink with retry/backoff on 429/5xx, unconstrained
 * by any HTTP request timeout (unlike the Vercel-hosted backend).
 */
async function fetchAllSharePointContacts(configId, context) {
  const dbConfig = await loadConfig(configId);
  const { tenantId, clientId, clientSecret, siteId, listId, name } = resolveCredentials(dbConfig);

  if (!siteId || !listId) {
    throw new Error(`SharePoint config '${name}' is missing Site ID or List ID.`);
  }

  const token = await getAccessToken(tenantId, clientId, clientSecret);
  const columnMap = await fetchColumnMap(siteId, listId, token, context);

  const baseUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`;
  let nextUrl = `${baseUrl}?expand=fields&$top=999`;
  const allItems = [];
  let page = 0;

  while (nextUrl) {
    const data = await graphGetWithRetry(nextUrl, token, context);
    const { value = [], '@odata.nextLink': nextLink } = data;
    allItems.push(...value);
    page += 1;
    context?.log?.(`[SharePoint Fetch] '${name}' page ${page}: +${value.length} items (total ${allItems.length})`);
    nextUrl = nextLink || null;
  }

  if (allItems.length === 0) {
    context?.warn?.(`[SharePoint Fetch] List '${name}' returned 0 items`);
    return { contacts: [], rawItemCount: 0 };
  }

  const { nameField, emailField } = resolveFieldNames(allItems, columnMap);

  if (!emailField) {
    const available = Object.keys(allItems[0]?.fields || {}).join(', ');
    throw new Error(
      `Could not detect an Email field in SharePoint list '${name}'. Available fields: ${available}`
    );
  }

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

      const friendlyFields = {};
      for (const [key, val] of Object.entries(fields)) {
        if (key.startsWith('@') || key === 'id' || key === 'ContentType' || key === 'Attachments' || key.endsWith('LookupId')) continue;
        const displayName = reverseColumnMap.get(key) || key;
        friendlyFields[displayName] = val;
      }

      return { name: name_v, email, modifiedAt, itemId: item.id, rawFields: friendlyFields };
    })
    .filter((c) => c.email);

  context?.log?.(`[SharePoint Fetch] Fetched ${contacts.length} contacts with a valid email out of ${allItems.length} raw items from '${name}' (emailField='${emailField}', nameField='${nameField}')`);
  return { contacts, rawItemCount: allItems.length };
}

module.exports = { fetchAllSharePointContacts };
