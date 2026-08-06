# Azure Durable Functions Email & Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Azure Durable Functions microservice (`azure-email-function/`) to handle immediate email sending and scheduled campaign sending with durable timers, while keeping Vercel hosting standard Express API routes and frontend React SPA.

**Architecture:** Vercel backend handles API CRUD operations and triggers Azure Durable Function HTTP start endpoint with a security token. Azure Durable Function orchestrates email batching, sleeping for scheduled campaigns using `createTimer`, sending via SMTP/SES/Azure Email, and updating Supabase PostgreSQL & SharePoint list status.

**Tech Stack:** Azure Functions v4 (Node.js programming model), `durable-functions`, `@prisma/client`, `nodemailer`, `@azure/communication-email`, `@microsoft/microsoft-graph-client`.

## Global Constraints

- **Node.js**: v18+ runtime for Azure Functions v4.
- **Azure Storage**: Requires Azurite locally for development, Azure Blob/Table Storage connection string in production.
- **Database**: Must use shared Supabase PostgreSQL connection (`DATABASE_URL` / `DIRECT_URL`) via Prisma ORM.
- **Security**: Shared secret header `x-azure-secret` for authenticating calls from Vercel to Azure Function App.

---

### Task 1: Scaffolding Azure Functions v4 & Durable Functions Project Structure

**Files:**
- Create: `azure-email-function/package.json`
- Create: `azure-email-function/host.json`
- Create: `azure-email-function/local.settings.json`
- Create: `azure-email-function/.gitignore`

**Interfaces:**
- Consumes: Shared Prisma schema in `backend/prisma/schema.prisma`
- Produces: Azure Functions app root configuration for Node.js v4 + `durable-functions`

- [ ] **Step 1: Create `package.json` for Azure Functions App**

```json
{
  "name": "azure-email-function",
  "version": "1.0.0",
  "description": "Azure Durable Functions microservice for email sending and campaign scheduling",
  "main": "src/functions/*.js",
  "scripts": {
    "start": "func start",
    "postinstall": "prisma generate --schema=../backend/prisma/schema.prisma"
  },
  "dependencies": {
    "@azure/functions": "^4.5.0",
    "@prisma/client": "^5.15.0",
    "durable-functions": "^3.1.0",
    "handlebars": "^4.7.8",
    "nodemailer": "^6.9.13",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "azure-functions-core-tools": "^4.0.5900",
    "prisma": "^5.15.0"
  }
}
```

- [ ] **Step 2: Create `host.json`**

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

- [ ] **Step 3: Create `local.settings.json`**

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_FUNCTION_SECRET_KEY": "dev_azure_secret_key_12345",
    "DATABASE_URL": "postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    "DIRECT_URL": "postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  }
}
```

- [ ] **Step 4: Verify package installation & Prisma generation**

Run: `cd azure-email-function && npm install`
Expected: Packages installed cleanly and Prisma client generated.

---

### Task 2: Implement Shared Database & Email Services in Azure Functions App

**Files:**
- Create: `azure-email-function/src/lib/prisma.js`
- Create: `azure-email-function/src/lib/emailSender.js`
- Create: `azure-email-function/src/lib/templates.js`

**Interfaces:**
- Consumes: Prisma schema, SMTP/SES environment variables
- Produces: `sendSingleMail(emailData)` helper, `prisma` database instance, Handlebars rendering helper

- [ ] **Step 1: Create `src/lib/prisma.js`**

```javascript
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = { prisma };
```

- [ ] **Step 2: Create `src/lib/templates.js`**

```javascript
const Handlebars = require('handlebars');

function renderTemplate(templateHtml, variables = {}) {
  try {
    const compiled = Handlebars.compile(templateHtml || '');
    return compiled(variables);
  } catch (err) {
    console.error('[Template Render Error]', err);
    return templateHtml;
  }
}

module.exports = { renderTemplate };
```

- [ ] **Step 3: Create `src/lib/emailSender.js`**

```javascript
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
```

- [ ] **Step 4: Create local verification test script**

Create `azure-email-function/test_email_lib.js`:
```javascript
const { renderTemplate } = require('./src/lib/templates');
const rendered = renderTemplate('<h1>Hello {{name}}</h1>', { name: 'Test' });
console.log('Rendered:', rendered);
```
Run: `node azure-email-function/test_email_lib.js`
Expected: Output `Rendered: <h1>Hello Test</h1>`.

---

### Task 3: Implement Durable Orchestrator & Activity Functions

**Files:**
- Create: `azure-email-function/src/functions/emailCampaignOrchestrator.js`
- Create: `azure-email-function/src/functions/activities.js`

**Interfaces:**
- Consumes: `durable-functions`, `prisma`, `sendEmail`, `renderTemplate`
- Produces: `emailCampaignOrchestrator` durable orchestration function, Activity functions (`getCampaignData`, `sendBatch`, `updateStats`)

- [ ] **Step 1: Implement `src/functions/activities.js`**

```javascript
const { df } = require('durable-functions');
const { prisma } = require('../lib/prisma');
const { sendEmail } = require('../lib/emailSender');
const { renderTemplate } = require('../lib/templates');

// Activity 1: Get campaign metadata & recipients
df.app.activity('getCampaignDataActivity', {
  handler: async (input) => {
    const { campaignId } = input;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        recipients: {
          where: { status: 'pending' },
          take: 50,
        },
      },
    });
    return campaign;
  },
});

// Activity 2: Send batch of emails
df.app.activity('sendBatchActivity', {
  handler: async (input) => {
    const { recipients, template } = input;
    const results = [];

    for (const recipient of recipients) {
      try {
        const subject = recipient.aiSubject || template.subject;
        const htmlBody = renderTemplate(template.htmlBody, {
          name: recipient.name,
          email: recipient.email,
          unsubscribeLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe?email=${encodeURIComponent(recipient.email)}`,
        });

        await sendEmail({
          to: recipient.email,
          subject,
          html: htmlBody,
        });

        results.push({ id: recipient.id, status: 'sent', sentAt: new Date() });
      } catch (err) {
        results.push({ id: recipient.id, status: 'failed', error: err.message });
      }
    }
    return results;
  },
});

// Activity 3: Update campaign & recipient statistics in database
df.app.activity('updateCampaignStatsActivity', {
  handler: async (input) => {
    const { campaignId, batchResults } = input;
    
    let sentInc = 0;
    let failedInc = 0;

    for (const res of batchResults) {
      if (res.status === 'sent') {
        sentInc++;
        await prisma.recipient.update({
          where: { id: res.id },
          data: { status: 'sent', sentAt: res.sentAt },
        });
      } else {
        failedInc++;
        await prisma.recipient.update({
          where: { id: res.id },
          data: { status: 'failed', error: res.error },
        });
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: { increment: sentInc },
        failedCount: { increment: failedInc },
        pendingCount: { decrement: sentInc + failedInc },
      },
    });

    return { sentInc, failedInc };
  },
});

// Activity 4: Finalize campaign status
df.app.activity('finalizeCampaignActivity', {
  handler: async (input) => {
    const { campaignId, status } = input;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status },
    });
    return { success: true };
  },
});
```

- [ ] **Step 2: Implement `src/functions/emailCampaignOrchestrator.js`**

```javascript
const { df } = require('durable-functions');

df.app.orchestrator('emailCampaignOrchestrator', function* (context) {
  const { campaignId } = context.df.getInput();

  // Step 1: Fetch initial campaign details
  const campaign = yield context.df.callActivity('getCampaignDataActivity', { campaignId });
  if (!campaign) return { error: 'Campaign not found' };

  // Step 2: Durable Timer for Scheduled Send
  if (campaign.scheduledAt && new Date(campaign.scheduledAt) > context.df.currentUtcDateTime) {
    const fireAt = new Date(campaign.scheduledAt);
    yield context.df.createTimer(fireAt);
  }

  // Step 3: Mark campaign as processing
  yield context.df.callActivity('finalizeCampaignActivity', { campaignId, status: 'processing' });

  // Step 4: Batch sending loop
  let hasPending = true;
  while (hasPending) {
    const currentData = yield context.df.callActivity('getCampaignDataActivity', { campaignId });
    if (!currentData || !currentData.recipients || currentData.recipients.length === 0) {
      hasPending = false;
      break;
    }

    const batchResults = yield context.df.callActivity('sendBatchActivity', {
      recipients: currentData.recipients,
      template: currentData.template,
    });

    yield context.df.callActivity('updateCampaignStatsActivity', { campaignId, batchResults });

    // Optional short delay between batches for rate-limiting
    const nextTick = new Date(context.df.currentUtcDateTime.getTime() + 1000);
    yield context.df.createTimer(nextTick);
  }

  // Step 5: Mark campaign completed
  yield context.df.callActivity('finalizeCampaignActivity', { campaignId, status: 'completed' });
  return { campaignId, status: 'completed' };
});
```

---

### Task 4: Implement HTTP Trigger & Fallback Timer Trigger in Azure Functions App

**Files:**
- Create: `azure-email-function/src/functions/httpStartTrigger.js`
- Create: `azure-email-function/src/functions/cronPollerTrigger.js`

**Interfaces:**
- Consumes: `durable-functions` client, `prisma`
- Produces: HTTP API endpoint `/api/orchestration/start-campaign`, 5-minute cron timer trigger

- [ ] **Step 1: Create `src/functions/httpStartTrigger.js`**

```javascript
const { app, df } = require('@azure/functions');

app.http('startCampaignOrchestrator', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'orchestration/start-campaign',
  extraInputs: [df.input.durableClient()],
  handler: async (request, context) => {
    const client = df.getClient(context);

    // Auth check using secret key
    const secretKey = request.headers.get('x-azure-secret');
    if (secretKey !== process.env.AZURE_FUNCTION_SECRET_KEY) {
      return { status: 401, jsonBody: { error: 'Unauthorized secret key' } };
    }

    const body = await request.json();
    const { campaignId } = body;

    if (!campaignId) {
      return { status: 400, jsonBody: { error: 'campaignId is required' } };
    }

    const instanceId = `campaign-${campaignId}`;
    await client.startNew('emailCampaignOrchestrator', {
      instanceId,
      input: { campaignId },
    });

    return client.createCheckStatusResponse(request, instanceId);
  },
});
```

- [ ] **Step 2: Create `src/functions/cronPollerTrigger.js`**

```javascript
const { app, df } = require('@azure/functions');
const { prisma } = require('../lib/prisma');

app.timer('scheduledCampaignPoller', {
  schedule: '0 */5 * * * *',
  extraInputs: [df.input.durableClient()],
  handler: async (myTimer, context) => {
    const client = df.getClient(context);
    const now = new Date();

    const scheduledCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: now },
      },
    });

    for (const campaign of scheduledCampaigns) {
      const instanceId = `campaign-${campaign.id}`;
      try {
        const existingStatus = await client.getStatus(instanceId);
        if (!existingStatus || existingStatus.runtimeStatus === 'Completed' || existingStatus.runtimeStatus === 'Failed') {
          await client.startNew('emailCampaignOrchestrator', {
            instanceId,
            input: { campaignId: campaign.id },
          });
          console.log(`[Cron Poller] Triggered orchestration for campaign ${campaign.id}`);
        }
      } catch (err) {
        console.error(`[Cron Poller] Failed starting campaign ${campaign.id}:`, err);
      }
    }
  },
});
```

---

### Task 5: Integrate Vercel API Backend with Azure Functions Trigger

**Files:**
- Modify: `backend/src/index.js:700-850`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `AZURE_FUNCTION_URL`, `AZURE_FUNCTION_SECRET_KEY`
- Produces: Axios HTTP call to Azure Function trigger upon campaign start/schedule in Vercel API

- [ ] **Step 1: Add environment variables to `backend/.env.example`**

```env
AZURE_FUNCTION_URL=https://<your-app-name>.azurewebsites.net
AZURE_FUNCTION_SECRET_KEY=dev_azure_secret_key_12345
```

- [ ] **Step 2: Update campaign trigger logic in `backend/src/index.js`**

Add helper function to trigger Azure Durable Function:
```javascript
const axios = require('axios');

async function triggerAzureDurableCampaign(campaignId) {
  const azureUrl = process.env.AZURE_FUNCTION_URL;
  const secretKey = process.env.AZURE_FUNCTION_SECRET_KEY;

  if (!azureUrl) {
    console.warn('[Vercel API] AZURE_FUNCTION_URL not configured. Falling back to local scheduler if available.');
    return false;
  }

  try {
    const response = await axios.post(
      `${azureUrl}/api/orchestration/start-campaign`,
      { campaignId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-azure-secret': secretKey,
        },
        timeout: 5000,
      }
    );
    console.log(`[Vercel API] Successfully triggered Azure Durable Function for campaign ${campaignId}:`, response.data);
    return true;
  } catch (err) {
    console.error(`[Vercel API] Error triggering Azure Durable Function for campaign ${campaignId}:`, err.message);
    return false;
  }
}
```

In campaign create / trigger route, call `triggerAzureDurableCampaign(campaign.id)` right after saving the campaign into DB.

---

### Task 6: Verification & End-to-End System Testing

**Files:**
- Create: `azure-email-function/test_orchestration.js`

- [ ] **Step 1: Test Azurite emulator & Azure Functions local host**

Run local Azurite emulator and `npm start` inside `azure-email-function/`.

- [ ] **Step 2: Run end-to-end integration script**

Create script to simulate Vercel API calling Azure HTTP Start Trigger with test campaign ID in DB.

- [ ] **Step 3: Commit all files to git repository**

```bash
git add azure-email-function backend/src/index.js docs/superpowers
git commit -m "feat: implement Azure Durable Functions for email sending & scheduling"
```
