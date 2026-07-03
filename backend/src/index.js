const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { prisma } = require('./prisma');
const { generateToken, comparePassword, authenticate } = require('./auth');
const { sendEmail } = require('./email');
const { renderTemplate, invalidateTemplate } = require('./templates-service');
const { getSharePointContacts, discoverFields, testConnection, updateSharePointEmailSent } = require('./sharepoint');

require('dotenv').config();

const app = express();

// --- CORS ---
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// --- Rate limiters ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const batchLimiter = rateLimit({
  windowMs: 1000,
  max: 10,
  message: { message: 'Too many batch requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Unsubscribed list in-memory cache (5-minute TTL) ---
let _unsubscribedCache = null;
let _unsubscribedCacheTime = 0;
const UNSUB_CACHE_TTL_MS = 5 * 60 * 1000;

async function getUnsubscribedSet() {
  const now = Date.now();
  if (_unsubscribedCache && now - _unsubscribedCacheTime < UNSUB_CACHE_TTL_MS) {
    return _unsubscribedCache;
  }
  const rows = await prisma.unsubscribed.findMany({ select: { email: true } });
  _unsubscribedCache = new Set(rows.map((r) => r.email.toLowerCase()));
  _unsubscribedCacheTime = now;
  return _unsubscribedCache;
}

function invalidateUnsubscribedCache() {
  _unsubscribedCache = null;
  _unsubscribedCacheTime = 0;
}

// --- Valid campaign status transitions ---
const VALID_TRANSITIONS = {
  idle: ['processing'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['idle'],
};

function assertCanTransition(current, next) {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new Error(`Cannot transition campaign from '${current}' to '${next}'`);
  }
}

// --- Helper: finalize campaign status after all batches done ---
async function checkCampaignCompletion(campaignId) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return 'failed';

  if (campaign.pendingCount === 0 && campaign.status === 'processing') {
    const finalStatus =
      campaign.failedCount > 0 && campaign.sentCount === 0 ? 'failed' : 'completed';
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: finalStatus } });
    return finalStatus;
  }
  return campaign.status;
}

// --- Helper: mask email for GDPR compliance ---
function maskEmail(email) {
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***.***';
  const [user, domain] = parts;
  const maskedUser = user.length > 2 ? user[0] + '***' + user[user.length - 1] : '***';
  return `${maskedUser}@${domain}`;
}

// --- Async error wrapper ---
const catchAsync = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ============================================================
// API Router
// ============================================================
const apiRouter = express.Router();

// GET /health
apiRouter.get('/health', catchAsync(async (_req, res) => {
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk });
}));

// GET /config/sender
apiRouter.get('/config/sender', catchAsync(async (req, res) => {
  await authenticate(req);
  const senderEmail = process.env.AZURE_FROM_EMAIL || 'donotreply@your-domain.com';
  return res.status(200).json({ senderEmail });
}));

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

// POST /auth/login
apiRouter.post('/auth/login', loginLimiter, catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const isValid = await comparePassword(password, admin.password);
  if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = generateToken({ id: admin.id, email: admin.email, name: admin.name });
  return res.status(200).json({
    access_token: token,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
}));

// GET /auth/me
apiRouter.get('/auth/me', catchAsync(async (req, res) => {
  const user = await authenticate(req);
  const admin = await prisma.admin.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  return res.status(200).json(admin);
}));

// ─────────────────────────────────────────────
// SHAREPOINT CONTACTS
// ─────────────────────────────────────────────

// --- Helper: Reconcile live SharePoint contacts with database logs ---
// configId: optional — when provided, incremental mode only checks sends from THIS list's campaigns.
// This is critical: a contact sent via "Demo List" must still appear as NEW in "Lead List".
async function reconcileContacts(allContacts, syncMode, configId = null) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const unsubSet = await getUnsubscribedSet();

  let filteredContacts = allContacts;

  if (syncMode === 'incremental') {
    // Scope the history lookup to THIS specific SharePoint list config only.
    // Without this, contacts sent via OTHER lists would appear as already-sent here.
    let latestRecipients;

    if (configId) {
      // Scoped query: only look at recipients belonging to campaigns from this config.
      // We also fetch sp_modified_at — the snapshot of SharePoint modifiedAt we stored
      // at campaign-creation time. We compare the CURRENT SP modifiedAt against this
      // stored snapshot, NOT against sentAt, because our own EmailSent write-back
      // updates the SP item's Modified timestamp just after sentAt, causing false positives.
      latestRecipients = await prisma.$queryRaw`
        SELECT DISTINCT ON (LOWER(r.email))
          LOWER(r.email)      AS email,
          r.status,
          r.sent_at           AS "sentAt",
          r.sp_modified_at    AS "spModifiedAt"
        FROM recipients r
        INNER JOIN campaigns c ON c.id = r.campaign_id
        WHERE c.config_id = ${configId}
        ORDER BY LOWER(r.email) ASC, r.created_at DESC
      `;
    } else {
      // No configId — fall back to global history (all campaigns)
      latestRecipients = await prisma.$queryRaw`
        SELECT DISTINCT ON (LOWER(email))
          LOWER(email)        AS email,
          status,
          sent_at             AS "sentAt",
          sp_modified_at      AS "spModifiedAt"
        FROM recipients
        ORDER BY LOWER(email) ASC, created_at DESC
      `;
    }

    const recipientMap = new Map();
    for (const r of latestRecipients) {
      recipientMap.set(r.email.toLowerCase(), {
        status:       r.status,
        sentAt:       r.sentAt,
        spModifiedAt: r.spModifiedAt,   // stored snapshot from last campaign
      });
    }

    filteredContacts = allContacts.filter((c) => {
      const email = c.email.toLowerCase().trim();
      if (!email || !emailRegex.test(email)) return true; // keep invalid so user sees errors

      const lastSend = recipientMap.get(email);
      if (!lastSend) {
        return true; // 1. New contact — never sent from this list
      }

      if (lastSend.status !== 'sent') {
        return true; // 2. Previous attempt from this list failed / was skipped
      }

      // 3. Detect REAL data changes: compare the current SP modifiedAt against the
      //    snapshot we stored at the previous campaign creation.
      //    We do NOT compare against sentAt because our EmailSent write-back updates
      //    the SP item's Modified timestamp just seconds after the send, making
      //    modifiedAt > sentAt always true and poisoning incremental forever.
      if (lastSend.spModifiedAt && c.modifiedAt) {
        const prevSnapshot  = new Date(lastSend.spModifiedAt);
        const currentSPTime = new Date(c.modifiedAt);
        if (currentSPTime > prevSnapshot) {
          return true; // Real data change in SharePoint since last campaign inclusion
        }
      }

      return false; // Successfully sent from this list, no real data change — skip
    });
  }

  const seenEmails = new Set();
  let validCount = 0, invalidCount = 0, duplicateCount = 0, unsubscribedCount = 0;

  const contacts = [];
  for (const c of filteredContacts) {
    const email = c.email.toLowerCase().trim();
    const name = c.name.trim();

    if (!email || !emailRegex.test(email)) {
      invalidCount++;
      contacts.push({ name, email, status: 'invalid', reason: 'Invalid email format', itemId: c.itemId, modifiedAt: c.modifiedAt || null });
      continue;
    }
    if (seenEmails.has(email)) {
      duplicateCount++;
      contacts.push({ name, email, status: 'duplicate', reason: 'Duplicate email in list', itemId: c.itemId, modifiedAt: c.modifiedAt || null });
      continue;
    }
    seenEmails.add(email);
    if (unsubSet.has(email)) {
      unsubscribedCount++;
      contacts.push({ name, email, status: 'unsubscribed', reason: 'Email is unsubscribed', itemId: c.itemId, modifiedAt: c.modifiedAt || null });
      continue;
    }
    validCount++;
    contacts.push({ name, email, status: 'valid', reason: null, itemId: c.itemId, modifiedAt: c.modifiedAt || null });
  }

  return {
    contacts,
    total: contacts.length,
    validCount,
    invalidCount,
    duplicateCount,
    unsubscribedCount,
  };
}

// ─────────────────────────────────────────────
// SHAREPOINT CONFIG CRUD
// ─────────────────────────────────────────────

/**
 * GET /sharepoint/configs
 * Returns all active SharePoint list configurations (clientSecret masked).
 */
apiRouter.get('/sharepoint/configs', catchAsync(async (req, res) => {
  await authenticate(req);
  const configs = await prisma.sharePointConfig.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  // Mask client secrets before sending to frontend
  const safe = configs.map((c) => ({
    ...c,
    clientSecret: c.clientSecret ? '***' : null,
  }));
  return res.status(200).json({ configs: safe });
}));

/**
 * POST /sharepoint/configs
 * Create a new SharePoint list configuration.
 */
apiRouter.post('/sharepoint/configs', catchAsync(async (req, res) => {
  await authenticate(req);
  const { name, siteId, listId, tenantId, clientId, clientSecret, sortOrder } = req.body;
  if (!name || !siteId || !listId) {
    return res.status(400).json({ message: 'name, siteId, and listId are required' });
  }
  const config = await prisma.sharePointConfig.create({
    data: {
      name: name.trim(),
      siteId: siteId.trim(),
      listId: listId.trim(),
      tenantId: tenantId?.trim() || null,
      clientId: clientId?.trim() || null,
      clientSecret: clientSecret?.trim() || null,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    },
  });
  return res.status(201).json({ ...config, clientSecret: config.clientSecret ? '***' : null });
}));

/**
 * PUT /sharepoint/configs/:id
 * Update a SharePoint list configuration.
 */
apiRouter.put('/sharepoint/configs/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const { name, siteId, listId, tenantId, clientId, clientSecret, isActive, sortOrder } = req.body;

  const existing = await prisma.sharePointConfig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'SharePoint config not found' });

  const updateData = {};
  if (name       !== undefined) updateData.name         = name.trim();
  if (siteId     !== undefined) updateData.siteId        = siteId.trim();
  if (listId     !== undefined) updateData.listId        = listId.trim();
  if (tenantId   !== undefined) updateData.tenantId      = tenantId?.trim() || null;
  if (clientId   !== undefined) updateData.clientId      = clientId?.trim() || null;
  if (isActive   !== undefined) updateData.isActive      = Boolean(isActive);
  if (sortOrder  !== undefined) updateData.sortOrder     = Number(sortOrder);
  // Only update clientSecret if a real value is provided (not the masked '***')
  if (clientSecret !== undefined && clientSecret !== '***') {
    updateData.clientSecret = clientSecret?.trim() || null;
  }

  const config = await prisma.sharePointConfig.update({ where: { id }, data: updateData });
  return res.status(200).json({ ...config, clientSecret: config.clientSecret ? '***' : null });
}));

/**
 * DELETE /sharepoint/configs/:id
 * Delete a SharePoint list configuration.
 */
apiRouter.delete('/sharepoint/configs/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const existing = await prisma.sharePointConfig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'SharePoint config not found' });
  await prisma.sharePointConfig.delete({ where: { id } });
  return res.status(200).json({ message: 'SharePoint config deleted' });
}));

/**
 * POST /sharepoint/configs/:id/test
 * Test connectivity to a SharePoint list using its stored credentials.
 */
apiRouter.post('/sharepoint/configs/:id/test', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  try {
    const result = await testConnection(id);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ success: false, message: err.message });
  }
}));

/**
 * GET /sharepoint/contacts
 * Fetches all contacts from the selected SharePoint list (by configId),
 * filters out unsubscribed, and returns them categorised for the frontend.
 */
apiRouter.get('/sharepoint/contacts', catchAsync(async (req, res) => {
  await authenticate(req);
  const { mode = 'full', configId } = req.query;
  if (!configId) return res.status(400).json({ message: 'configId query parameter is required' });

  const allContacts = await getSharePointContacts(configId);
  // Pass configId so incremental mode scopes history to THIS list only
  const result = await reconcileContacts(allContacts, mode, configId);

  return res.status(200).json(result);
}));

/**
 * GET /sharepoint/fields  (debug — discover SP field names for a config)
 */
apiRouter.get('/sharepoint/fields', catchAsync(async (req, res) => {
  await authenticate(req);
  const { configId } = req.query;
  if (!configId) return res.status(400).json({ message: 'configId query parameter is required' });
  const fields = await discoverFields(configId);
  return res.status(200).json({ fields });
}));

// ─────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────

// GET /campaigns/stats/dashboard
apiRouter.get('/campaigns/stats/dashboard', catchAsync(async (req, res) => {
  await authenticate(req);
  const [totalCampaigns, totalTemplates, totalEmailsSent, totalFailedEmails] = await Promise.all([
    prisma.campaign.count(),
    prisma.template.count(),
    prisma.recipient.count({ where: { status: 'sent' } }),
    prisma.recipient.count({ where: { status: 'failed' } }),
  ]);
  return res.status(200).json({ totalCampaigns, totalTemplates, totalEmailsSent, totalFailedEmails });
}));

// ─────────────────────────────────────────────
// CAMPAIGNS  (replaces "uploads")
// ─────────────────────────────────────────────

// GET /campaigns
apiRouter.get('/campaigns', catchAsync(async (req, res) => {
  await authenticate(req);
  const campaigns = await prisma.campaign.findMany({
    include: { template: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.status(200).json(campaigns);
}));

// POST /campaigns  — create a new campaign from SharePoint contacts
apiRouter.post('/campaigns', catchAsync(async (req, res) => {
  await authenticate(req);
  const { name, templateId, syncMode = 'full', configId, contacts } = req.body;
  if (!templateId) return res.status(400).json({ message: 'templateId is required' });

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  // Use the provided contacts list if available; otherwise fetch live from SharePoint.
  // IMPORTANT: when contacts come from the frontend (already-previewed list), we still
  // honour syncMode and configId so incremental filtering is applied correctly.
  let reconciliation;
  if (Array.isArray(contacts) && contacts.length > 0) {
    // contacts already have itemId embedded from the preview step
    reconciliation = await reconcileContacts(contacts, syncMode, configId || null);
  } else {
    if (!configId) return res.status(400).json({ message: 'configId is required when contacts are not provided' });
    const allContacts = await getSharePointContacts(configId);
    reconciliation = await reconcileContacts(allContacts, syncMode, configId);
  }

  const recipientsToCreate = reconciliation.contacts
    .filter(c => c.status !== 'duplicate') // skip duplicates — don't even create a recipient row for them
    .map(c => {
      const statusMap = {
        valid: 'pending',
        invalid: 'failed',
        unsubscribed: 'skipped',
      };
      return {
        name:         c.name,
        email:        c.email,
        status:       statusMap[c.status] || 'pending',
        error:        c.reason,
        spItemId:     c.itemId || null,
        // Store the SP modifiedAt snapshot so incremental sync can compare against it
        // on the NEXT run, without being confused by our own EmailSent write-back.
        spModifiedAt: c.modifiedAt ? new Date(c.modifiedAt) : null,
      };
    });

  const campaign = await prisma.campaign.create({
    data: {
      name: name || `Campaign – ${new Date().toLocaleDateString()}`,
      templateId,
      status: 'processing',
      configId: configId || null,
      totalCount: reconciliation.validCount,
      pendingCount: reconciliation.validCount,
      skippedCount: reconciliation.unsubscribedCount,
      sentCount: 0,
      failedCount: 0,
      recipients: { create: recipientsToCreate },
    },
    include: { template: true },
  });

  return res.status(201).json(campaign);
}));

// GET /campaigns/:id
apiRouter.get('/campaigns/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  const senderEmail = process.env.AZURE_FROM_EMAIL || 'donotreply@your-domain.com';
  return res.status(200).json({ ...campaign, senderEmail });
}));

// GET /campaigns/:id/stats
apiRouter.get('/campaigns/:id/stats', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true, status: true,
      totalCount: true, sentCount: true, failedCount: true,
      pendingCount: true, skippedCount: true,
    },
  });
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  return res.status(200).json(campaign);
}));

// DELETE /campaigns/:id
apiRouter.delete('/campaigns/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  await prisma.campaign.delete({ where: { id } });
  return res.status(200).json({ message: 'Campaign deleted successfully' });
}));

// GET /campaigns/:id/recipients
apiRouter.get('/campaigns/:id/recipients', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '50', 10);
  const status = req.query.status;
  const skip = (page - 1) * limit;

  const where = { campaignId: id };
  if (status) {
    where.status = status;
  }

  const [recipients, total] = await Promise.all([
    prisma.recipient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.recipient.count({ where }),
  ]);

  return res.status(200).json({
    recipients, total, page, limit,
    totalPages: Math.ceil(total / limit),
  });
}));

// ─────────────────────────────────────────────
// SEND (batch)
// ─────────────────────────────────────────────

// POST /campaigns/:id/send-batch
apiRouter.post('/campaigns/:id/send-batch', batchLimiter, catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { recipientIds } = req.body;

  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({ message: 'recipientIds must be a non-empty array' });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

  const template = await prisma.template.findUnique({ where: { id: campaign.templateId } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  const recipients = await prisma.recipient.findMany({
    where: { id: { in: recipientIds }, campaignId: id, status: 'pending' },
  });

  if (recipients.length === 0) {
    return res.status(400).json({ message: 'No pending recipients found for the specified IDs' });
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const results = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const token = crypto
      .createHash('sha256')
      .update(recipient.email + 'desire-unsubscribe-salt')
      .digest('hex')
      .substring(0, 32);
    const unsubscribeLink = `${frontendUrl}/unsubscribe/${token}`;

    const variables = { name: recipient.name, email: recipient.email, unsubscribeLink };
    const rendered = renderTemplate(
      { id: template.id, subject: template.subject, htmlBody: template.htmlBody, plainTextBody: template.plainTextBody },
      variables
    );

    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    let success = false;

    while (attempts < maxAttempts) {
      try {
        await sendEmail({ to: recipient.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
        await prisma.recipient.update({
          where: { id: recipient.id },
          data: { status: 'sent', error: null, sentAt: new Date() },
        });

        // Trigger SharePoint write-back in background if client configurations and itemId are present
        if (campaign.configId && recipient.spItemId) {
          updateSharePointEmailSent(campaign.configId, recipient.spItemId, new Date())
            .catch(err => console.error(`[SharePoint Write-back Error] ${err.message}`));
        }

        results.push({ id: recipient.id, status: 'sent' });
        success = true;
        break;
      } catch (err) {
        attempts++;
        lastError = err;
        console.warn(`[Retry] Attempt ${attempts} failed for ${recipient.email}: ${err.message}`);
        if (attempts < maxAttempts) await sleep(2000);
      }
    }

    if (!success) {
      await prisma.recipient.update({
        where: { id: recipient.id },
        data: { status: 'failed', error: lastError?.message || 'All retry attempts failed' },
      });
      results.push({ id: recipient.id, status: 'failed' });
    }

    // Only inject individual send delay if it is NOT the last recipient in this batch
    if (i < recipients.length - 1) {
      await sleep(2500);
    }
  }

  let sentCount = 0, failedCount = 0;
  for (const r of results) {
    if (r.status === 'sent') sentCount++;
    if (r.status === 'failed') failedCount++;
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      sentCount: { increment: sentCount },
      failedCount: { increment: failedCount },
      pendingCount: { decrement: recipients.length },
    },
  });

  return res.status(200).json({ sent: sentCount, failed: failedCount });
}));

// POST /campaigns/:id/finalize
apiRouter.post('/campaigns/:id/finalize', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const status = await checkCampaignCompletion(id);
  return res.status(200).json({ status });
}));

// ─────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────

// GET /templates
apiRouter.get('/templates', catchAsync(async (req, res) => {
  await authenticate(req);
  const templates = await prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
  return res.status(200).json(templates);
}));

// POST /templates
apiRouter.post('/templates', catchAsync(async (req, res) => {
  await authenticate(req);
  const { name, subject, htmlBody, plainTextBody } = req.body;
  if (!name || !subject || !htmlBody || !plainTextBody) {
    return res.status(400).json({ message: 'name, subject, htmlBody, and plainTextBody are required' });
  }
  const template = await prisma.template.create({ data: { name, subject, htmlBody, plainTextBody } });
  return res.status(201).json(template);
}));

// POST /templates/:id/test
apiRouter.post('/templates/:id/test', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { testEmail } = req.body;
  if (!testEmail) return res.status(400).json({ message: 'testEmail is required' });

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  const rendered = renderTemplate(
    { id: template.id, subject: template.subject, htmlBody: template.htmlBody, plainTextBody: template.plainTextBody },
    { name: 'Test User', email: testEmail, unsubscribeLink: '#' }
  );
  await sendEmail({ to: testEmail, subject: `[TEST] ${rendered.subject}`, html: rendered.html, text: rendered.text });
  return res.status(200).json({ message: 'Test email sent successfully' });
}));

// GET /templates/:id
apiRouter.get('/templates/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ message: 'Template not found' });
  return res.status(200).json(template);
}));

// PUT /templates/:id
apiRouter.put('/templates/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { name, subject, htmlBody, plainTextBody } = req.body;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  invalidateTemplate(id);

  const updated = await prisma.template.update({
    where: { id },
    data: {
      name: name || template.name,
      subject: subject || template.subject,
      htmlBody: htmlBody || template.htmlBody,
      plainTextBody: plainTextBody || template.plainTextBody,
    },
  });
  return res.status(200).json(updated);
}));

// DELETE /templates/:id
apiRouter.delete('/templates/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ message: 'Template not found' });
  invalidateTemplate(id);
  await prisma.template.delete({ where: { id } });
  return res.status(200).json({ message: 'Template deleted successfully' });
}));

// ─────────────────────────────────────────────
// UNSUBSCRIBE
// ─────────────────────────────────────────────

// GET /unsubscribe/:token
apiRouter.get('/unsubscribe/:token', catchAsync(async (req, res) => {
  const { token } = req.params;
  const existing = await prisma.unsubscribed.findUnique({ where: { token } });
  if (existing) {
    return res.status(200).json({ alreadyUnsubscribed: true, email: maskEmail(existing.email) });
  }
  return res.status(200).json({ alreadyUnsubscribed: false, email: null });
}));

// POST /unsubscribe/:token
apiRouter.post('/unsubscribe/:token', catchAsync(async (req, res) => {
  const { token } = req.params;
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const expectedToken = crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase() + 'desire-unsubscribe-salt')
    .digest('hex')
    .substring(0, 32);

  if (expectedToken !== token) return res.status(404).json({ message: 'Invalid unsubscribe link' });

  const existing = await prisma.unsubscribed.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return res.status(200).json({ message: 'You are already unsubscribed', email: maskEmail(email) });
  }

  await prisma.unsubscribed.create({ data: { email: email.toLowerCase(), token } });
  invalidateUnsubscribedCache();

  return res.status(200).json({
    message: 'You have been successfully unsubscribed',
    email: maskEmail(email),
  });
}));

// GET /recipients - fetches all recipients across all campaigns for global Delivery Logs
apiRouter.get('/recipients', catchAsync(async (req, res) => {
  await authenticate(req);
  const recipients = await prisma.recipient.findMany({
    include: {
      campaign: {
        select: {
          name: true,
          template: {
            select: { name: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  return res.status(200).json({ recipients });
}));

// PUT /recipients/:id - edit recipient name and email
apiRouter.put('/recipients/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  const updated = await prisma.recipient.update({
    where: { id },
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
    },
  });

  return res.status(200).json(updated);
}));

// DELETE /recipients/:id - delete recipient and decrement campaign counters
apiRouter.delete('/recipients/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;

  const recipient = await prisma.recipient.findUnique({ where: { id } });
  if (!recipient) {
    return res.status(404).json({ message: 'Recipient not found' });
  }

  await prisma.$transaction(async (tx) => {
    // Delete the recipient
    await tx.recipient.delete({ where: { id } });

    // Decrement counters on the campaign
    const statusFieldMap = {
      sent: 'sentCount',
      failed: 'failedCount',
      pending: 'pendingCount',
      skipped: 'skippedCount',
    };
    const counterField = statusFieldMap[recipient.status];
    const isTotalCountRecipient = recipient.status === 'pending' || recipient.status === 'sent' || recipient.status === 'failed';

    await tx.campaign.update({
      where: { id: recipient.campaignId },
      data: {
        totalCount: isTotalCountRecipient ? { decrement: 1 } : undefined,
        [counterField]: { decrement: 1 },
      },
    });
  });

  return res.status(200).json({ message: 'Recipient deleted successfully' });
}));

// --- Mount router for dual path support (/api and /) ---
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[Express Error] ${err.stack || err.message}`);
  const status = err.message === 'Unauthorized' ? 401 : 400;
  return res.status(status).json({ message: err.message });
});

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => {
  console.log(`[Desire Mail Marketing] Backend listening on port ${PORT}`);
});

module.exports = app;
