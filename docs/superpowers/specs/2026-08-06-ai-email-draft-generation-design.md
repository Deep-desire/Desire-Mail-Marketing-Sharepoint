# Design Specification: AI-Generated Personalized Email Drafts

## 1. Executive Summary
This design specification introduces an **AI-Generated Draft Mail** option in the SharePoint Mail Marketing System. Instead of selecting static pre-defined email templates, users can enable AI generation, specify a Master Campaign Instruction / Prompt, and automatically generate personalized email subjects and HTML bodies tailored to each contact's specific SharePoint row data.

## 2. Requirements & Goals
- **Mode Selection**: Allow switching between "Static Email Template" and "AI-Generated Draft Mail" in Step 2 of the SharePoint Contacts Wizard.
- **Row Context Synthesis**: Extract and feed all visible/selected SharePoint list columns (Name, Title, Department, Company, Notes, etc.) into OpenAI for each recipient.
- **Two-Tier Personalization Architecture**:
  1. *Master Campaign Prompt*: High-level intent entered by the admin in Step 2.
  2. *Live Sample Preview*: Generate a real-time sample draft for 1 contact before launching.
  3. *Asynchronous Per-Recipient Generation*: Batch scheduler generates and persists personalized email content per contact at send time.
- **Production Safety & Auditability**: Store generated `aiSubject` and `aiBody` on each `Recipient` record in the database for delivery logs, audit, and retry capabilities.

## 3. Database Schema Changes (`prisma/schema.prisma`)
### `Campaign` Table
- `isAiGenerated`: `Boolean @default(false) @map("is_ai_generated")`
- `aiPrompt`: `String? @map("ai_prompt")`
- `aiModel`: `String? @map("ai_model")`
- `templateId`: `String? @map("template_id")` (Updated relation to optional)

### `Recipient` Table
- `aiSubject`: `String? @map("ai_subject")`
- `aiBody`: `String? @map("ai_body")`

## 4. Backend Service Architecture
### OpenAI Integration (`backend/src/ai.js`)
- Uses OpenAI API (`gpt-4o-mini` default / `gpt-4o`).
- Structured JSON output format enforced via system prompt:
  ```json
  {
    "subject": "Personalized Subject Line",
    "htmlBody": "<p>Personalized HTML Body...</p>"
  }
  ```
- Graceful Fallback: If OpenAI API fails for a recipient after retries, logs the error on `Recipient.error` status without crashing the entire campaign batch.

### Backend Endpoints (`backend/src/index.js`)
- `POST /api/ai/preview-draft`: Accepts `masterPrompt` and single contact row data, returns sample generated `{ subject, htmlBody }`.
- Campaign Creation Endpoint (`POST /api/campaigns`): Handles `isAiGenerated`, `aiPrompt`, and optional `templateId`.

### Batch Scheduler Execution (`backend/src/scheduler.js` & `backend/src/email.js`)
- When processing pending recipients for an AI campaign:
  1. Fetches raw contact data from SharePoint item or stored metadata.
  2. Invokes AI draft generator with contact's full row context.
  3. Persists generated `aiSubject` and `aiBody` to database `Recipient` record.
  4. Delivers email via Azure Communication Services / SMTP.

## 5. Frontend UI/UX Design (`SharePointContacts.tsx` & Components)
- **Step 2 Campaign Wizard**:
  - Radio/Tab Switcher: "Standard Template" vs "AI Generated Draft Mail".
  - Textarea for Master Campaign Instructions / Prompt.
  - "Preview Sample AI Draft" Button + Modal: Shows live preview of subject and HTML output for a selected contact.
- **Campaign Details / Delivery Logs**:
  - Displays whether campaign was AI-generated.
  - Allows inspecting actual personalized subject & body sent to each recipient.

## 6. Verification & Testing Strategy
- Test sample preview API endpoint with sample contact data.
- Run database migrations (`npx prisma migrate dev`).
- Run end-to-end test campaign with 2 valid SharePoint contacts using AI mode.
- Verify delivery log display and database records.
