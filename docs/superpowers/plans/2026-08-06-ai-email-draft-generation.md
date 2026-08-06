# AI-Generated Personalized Email Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-Generated Draft Mail feature to the SharePoint Mail Marketing Wizard that synthesizes all contact row data into personalized email drafts via OpenAI.

**Architecture:** Extend Prisma schema to store `isAiGenerated`, `aiPrompt`, `aiSubject`, and `aiBody`. Create `backend/src/ai.js` service for OpenAI structured JSON generation. Update Step 2 of `SharePointContacts.tsx` to provide a toggle between static templates and AI drafts with live sample preview. Update `scheduler.js` and `email.js` to asynchronously generate and persist per-recipient AI content at send time.

**Tech Stack:** Node.js, Express, Prisma, PostgreSQL (Supabase), OpenAI API (`axios` or `openai`), React, TypeScript, Tailwind CSS, Lucide React icons.

## Global Constraints

- Backend must maintain backward compatibility with existing static HTML template campaigns.
- OpenAI API key is stored strictly on backend (`backend/.env` key `OPENAI_API_KEY`).
- Generated email bodies must output valid, clean, responsive HTML snippet compatible with email clients.

---

### Task 1: Prisma Schema & Database Migration

**Files:**
- Modify: `backend/prisma/schema.prisma:24-74`

**Interfaces:**
- Consumes: Prisma CLI (`npx prisma migrate dev` / `npx prisma db push`)
- Produces: Updated database schema supporting `isAiGenerated`, `aiPrompt`, `aiModel` on `Campaign`, optional `templateId`, and `aiSubject`, `aiBody` on `Recipient`.

- [ ] **Step 1: Update Prisma schema in `backend/prisma/schema.prisma`**

Update `Campaign` and `Recipient` models:
```prisma
model Campaign {
  id           String      @id @default(uuid())
  name         String
  status       String      @default("processing")
  isAiGenerated Boolean    @default(false) @map("is_ai_generated")
  aiPrompt     String?     @map("ai_prompt")
  aiModel      String?     @map("ai_model")
  templateId   String?     @map("template_id")
  template     Template?   @relation(fields: [templateId], references: [id])
  configId     String?     @map("config_id")
  config       SharePointConfig? @relation(fields: [configId], references: [id])
  syncMode     String      @default("full") @map("sync_mode")

  // Delivery stats
  totalCount   Int         @default(0) @map("total_count")
  sentCount    Int         @default(0) @map("sent_count")
  failedCount  Int         @default(0) @map("failed_count")
  pendingCount Int         @default(0) @map("pending_count")
  skippedCount Int         @default(0) @map("skipped_count")

  recipients   Recipient[]
  scheduledAt  DateTime?   @map("scheduled_at")
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt      @map("updated_at")

  @@index([status])
  @@index([createdAt])
  @@map("campaigns")
}

model Recipient {
  id           String    @id @default(uuid())
  name         String
  email        String
  status       String    @default("pending")
  error        String?
  aiSubject    String?   @map("ai_subject")
  aiBody       String?   @map("ai_body")
  sentAt       DateTime? @map("sent_at")
  spItemId     String?   @map("sp_item_id")
  spModifiedAt DateTime? @map("sp_modified_at")
  campaignId   String    @map("campaign_id")
  campaign     Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  createdAt    DateTime  @default(now()) @map("created_at")

  @@index([campaignId])
  @@index([campaignId, status])
  @@index([email])
  @@index([status])
  @@map("recipients")
}
```

- [ ] **Step 2: Run Prisma generate and database push**

Run: `cd backend && npx prisma db push`
Expected: `The database is now in sync with the Prisma schema.`

- [ ] **Step 3: Commit database schema changes**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): update campaign and recipient schema for AI draft generation"
```

---

### Task 2: Backend OpenAI Service & Preview Endpoint

**Files:**
- Create: `backend/src/ai.js`
- Modify: `backend/src/index.js`

**Interfaces:**
- Consumes: `OPENAI_API_KEY`, `axios`
- Produces: `generateRecipientDraft({ masterPrompt, recipientData })` helper and `POST /api/ai/preview-draft` route.

- [ ] **Step 1: Create `backend/src/ai.js` OpenAI generator module**

```javascript
const axios = require('axios');

/**
 * Generates personalized email subject and HTML body using OpenAI based on master prompt & contact row context.
 */
async function generateRecipientDraft({ masterPrompt, contactData }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured in backend environment variables.');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `You are an expert executive email copywriter. Your task is to compose a highly personalized, professional outreach email for a recipient using their complete background data.
Output MUST be a raw JSON object with exactly two keys:
{
  "subject": "Compelling subject line",
  "htmlBody": "Responsive clean HTML content inside a styled container card (use inline CSS, modern clean typography, brand soft background, call to action button if relevant)"
}
Do NOT enclose output in markdown blocks or extra text. Output ONLY valid JSON.`;

  const userPrompt = `MASTER CAMPAIGN GOAL / INSTRUCTION:
"${masterPrompt || 'Write a personalized executive outreach email introduces our services.'}"

RECIPIENT ROW CONTEXT & DETAILS:
${JSON.stringify(contactData, null, 2)}

Generate the personalized subject line and clean inline HTML body for this specific recipient.`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      }
    );

    const contentStr = response.data.choices[0]?.message?.content;
    const parsed = JSON.parse(contentStr);
    return {
      subject: parsed.subject || 'Personalized Message',
      htmlBody: parsed.htmlBody || `<p>Hello ${contactData.name || contactData.Title || 'there'},</p><p>We wanted to reach out regarding our services.</p>`
    };
  } catch (error) {
    console.error('OpenAI Draft Generation Error:', error.response?.data || error.message);
    throw new Error(`AI Generation failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

module.exports = { generateRecipientDraft };
```

- [ ] **Step 2: Add `/api/ai/preview-draft` and update campaign creation in `backend/src/index.js`**

In `backend/src/index.js`, import `generateRecipientDraft` from `./ai.js` and register the preview endpoint:
```javascript
const { generateRecipientDraft } = require('./ai');

// POST /api/ai/preview-draft
app.post('/api/ai/preview-draft', authenticateToken, async (req, res) => {
  try {
    const { masterPrompt, contactData } = req.body;
    if (!contactData) {
      return res.status(400).json({ error: 'contactData is required for preview' });
    }
    const draft = await generateRecipientDraft({ masterPrompt, contactData });
    return res.json(draft);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to generate AI draft preview' });
  }
});
```

And update `POST /api/campaigns` handler to accept `isAiGenerated` and `aiPrompt`:
```javascript
// Inside POST /api/campaigns handler:
const { name, templateId, isScheduled, scheduledAt, configId, syncMode, selectedItemIds, isAiGenerated, aiPrompt } = req.body;

if (!isAiGenerated && !templateId) {
  return res.status(400).json({ error: 'templateId is required when AI draft is disabled' });
}
if (isAiGenerated && !aiPrompt) {
  return res.status(400).json({ error: 'aiPrompt is required when AI draft is enabled' });
}
```

- [ ] **Step 3: Verify backend endpoint registers cleanly**

Run backend syntax check or restart dev server.

- [ ] **Step 4: Commit backend AI service changes**

```bash
git add backend/src/ai.js backend/src/index.js
git commit -m "feat(backend): implement OpenAI draft generator and preview endpoint"
```

---

### Task 3: Scheduler & Email Dispatch Integration

**Files:**
- Modify: `backend/src/scheduler.js:50-180`
- Modify: `backend/src/email.js:40-120`

**Interfaces:**
- Consumes: `generateRecipientDraft`, `Campaign.isAiGenerated`, `Recipient.spItemId`
- Produces: Dynamic per-recipient AI content generation and persistence prior to Azure/SMTP email dispatch.

- [ ] **Step 1: Update `backend/src/scheduler.js` batch processor**

In `processPendingRecipientsBatch`:
Check if `recipient.campaign.isAiGenerated` is true. If true, fetch raw item attributes from SharePoint or contact metadata, call `generateRecipientDraft`, save `aiSubject` and `aiBody` onto `recipient` via Prisma update, and pass the personalized subject & body to `sendSingleRecipientEmail`.

- [ ] **Step 2: Update `backend/src/email.js` delivery method**

Allow `sendSingleRecipientEmail` to accept `overrideSubject` and `overrideHtmlBody`:
```javascript
// Use recipient.aiSubject or template.subject
const subject = overrideSubject || recipient.aiSubject || template?.subject || 'No Subject';
const htmlContent = overrideHtmlBody || recipient.aiBody || renderedHtml;
```

- [ ] **Step 3: Commit scheduler and email dispatch updates**

```bash
git add backend/src/scheduler.js backend/src/email.js
git commit -m "feat(scheduler): integrate per-recipient AI draft generation into sending pipeline"
```

---

### Task 4: Frontend Types, API Client & Wizard UI

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/upload.api.ts`
- Modify: `frontend/src/pages/SharePointContacts.tsx`

**Interfaces:**
- Consumes: `/api/ai/preview-draft`, `uploadApi.previewAiDraft`
- Produces: UI toggle card in Step 2, Master Prompt textarea, Live Sample AI Preview modal, and Campaign Launch payload handler.

- [ ] **Step 1: Update TypeScript types in `frontend/src/types/index.ts`**

```typescript
export interface Campaign {
  id: string;
  name: string;
  status: 'processing' | 'completed' | 'failed' | 'scheduled';
  templateId?: string;
  template?: Template;
  isAiGenerated?: boolean;
  aiPrompt?: string;
  aiModel?: string;
  configId?: string;
  // ...
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  error?: string;
  aiSubject?: string;
  aiBody?: string;
  sentAt?: string;
  spItemId?: string;
}
```

- [ ] **Step 2: Add API method in `frontend/src/api/upload.api.ts`**

```typescript
previewAiDraft: (masterPrompt: string, contactData: Record<string, any>) =>
  api.post<{ subject: string; htmlBody: string }>('/ai/preview-draft', { masterPrompt, contactData }),
```

- [ ] **Step 3: Update `SharePointContacts.tsx` Wizard Step 2**

Add state variables:
```typescript
const [draftMode, setDraftMode] = useState<'template' | 'ai'>('template');
const [aiPrompt, setAiPrompt] = useState('Draft a compelling executive email introducing our AI & SharePoint modernization services tailored to their role.');
const [isAiPreviewModalOpen, setIsAiPreviewModalOpen] = useState(false);
const [aiPreviewData, setAiPreviewData] = useState<{ subject: string; htmlBody: string } | null>(null);
const [generatingAiPreview, setGeneratingAiPreview] = useState(false);
```

Render UI Mode Switcher in Step 2:
- Toggle between **"Use Pre-defined Template"** and **"✨ AI Generate Draft Mail"**.
- Textarea for `aiPrompt`.
- "Preview Sample AI Draft" button: picks 1st selected valid contact and calls `uploadApi.previewAiDraft(aiPrompt, contact.rawFields)`. Displays modal with generated preview.

- [ ] **Step 4: Commit frontend UI updates**

```bash
git add frontend/src/types/index.ts frontend/src/api/upload.api.ts frontend/src/pages/SharePointContacts.tsx
git commit -m "feat(frontend): add AI draft mode toggle and sample preview modal to campaign wizard"
```

---

### Task 5: Verification & End-to-End Walkthrough

**Files:**
- Modify: `frontend/src/pages/CampaignDetails.tsx`

- [ ] **Step 1: Update CampaignDetails page to show AI badge and personalized drafts**
- [ ] **Step 2: Run frontend build and backend tests**
- [ ] **Step 3: Create Walkthrough documentation**

```bash
git add frontend/src/pages/CampaignDetails.tsx
git commit -m "feat(frontend): display AI generated draft badges and recipient subject/body in delivery logs"
```
