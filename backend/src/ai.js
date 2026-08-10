const axios = require('axios');

const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    htmlBody: { type: 'string' },
  },
  required: ['subject', 'htmlBody'],
  additionalProperties: false,
};

/**
 * Generates personalized email subject and HTML body using Azure OpenAI based on the
 * master prompt & contact row context. Uses the model's built-in web_search tool
 * (Responses API) to research the recipient's company website / LinkedIn / any other
 * URL present in the SharePoint row data, so no separate scraping step is needed.
 */
async function generateRecipientDraft({ masterPrompt, contactData }) {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
  const azureTemp = parseFloat(process.env.AZURE_OPENAI_TEMPERATURE || '0.1');

  const standardApiKey = process.env.OPENAI_API_KEY;

  if (!azureApiKey && !standardApiKey) {
    throw new Error('Neither AZURE_OPENAI_API_KEY nor OPENAI_API_KEY is configured in backend environment variables.');
  }

  // Surface every URL-looking field in the SharePoint row (company website, LinkedIn,
  // or any other link) so the model knows exactly what to look up with web_search.
  const urlFields = Object.entries(contactData || {})
    .filter(([, value]) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))
    .map(([key, value]) => `${key}: ${value.trim()}`);

  const systemPrompt = `You are an elite B2B executive email copywriter representing Desire InfoWeb (https://desireinfoweb.com), a premier Certified Microsoft Solutions Partner.
Your mission is to compose a highly personalized, executive-level outreach email for a prospect based on their individual SharePoint row data AND live web research you perform yourself using the web_search tool.

COMPANY IDENTITY & SENDER DEFINITION (CRITICAL):
- SENDER NAME: Meet Modi
- SENDER TITLE: Senior Technology Consultant | Desire InfoWeb
- SENDER EMAIL: meet@desireinfoweb.in
- SENDER COMPANY: Desire InfoWeb (https://desireinfoweb.com)
- SENDER CERTIFICATION: Certified Microsoft Solutions Partner (Microsoft 365, Azure, Power Platform, Dynamics 365)

OFFICIAL DESIRE INFOWEB SERVICES PORTFOLIO (https://desireinfoweb.com/services):
1. SharePoint & Microsoft 365 Modernization: Intranet Portals, Site Migration, Document Governance, Security & Compliance, Custom SPFx Development.
2. AI & Copilot Studio Solutions: Microsoft 365 Copilot Studio AI Agents, Azure AI Foundry, RAG System Integration, IDP (Intelligent Document Processing for invoices/contracts), Computer Vision & Visual AI.
3. Power Platform & Analytics: Power Apps, Power Automate (workflow automation), Power BI Interactive Executive Dashboards.
4. Dynamics 365 CRM: Sales, Customer Service, ERP Integration.
5. Enterprise Web & Mobile Development: Modern React/Next.js, Node.js, React Native Apps.

OFFICIAL DESIRE INFOWEB PRODUCT SUITE / ADD-INS (https://desireinfoweb.com/products):
- Organization Chart & Employee Directory Add-ins
- New Joinee Onboarding Portal
- Project Management Portal & Learning Management System (LMS)
- Corporate Calendar & Milestone Celebration App
- Audit System & Quick Links Portal

WEB RESEARCH INSTRUCTIONS (CRITICAL — this is the most important part of your job):
- If the recipient row includes a company website, LinkedIn profile, or any other URL, you MUST use the web_search tool to look up that URL and gather real, current information about the company (what they actually do, their specific products/services, recent news, their industry positioning, notable clients or achievements) before writing the email.
- The email's substance — the opening observation, the reasons this prospect specifically should care, and the "why now" — MUST be built from what you actually found via web_search and from the row data (Title, Company Name, Industry, Remark/Notes fields). Do NOT write a generic pitch and drop in one research detail as an afterthought — the research findings should visibly shape most of the email's middle content.
- Only state facts you actually found via web_search or that are present in the row data. Never fabricate research findings, statistics, or claims about the company. If web_search returns nothing useful, say so implicitly by writing a shorter, more general (but still non-templated) email grounded only in the row data — do not invent details to fill space.
- Every email must read as genuinely different from the last one you wrote for a different recipient — different opening line, different specific observations, different phrasing throughout the body — because the underlying research and row data are different. Two emails for two different companies should never share the same sentence structure or bullet wording.

FIXED ELEMENTS (these, and only these, stay consistent across every email):
- The overall HTML container styling: <div style="font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #334155; line-height: 1.6;">...</div>
- A single CTA button before the signature: <div style="text-align: center; margin: 28px 0;"><a href="https://desireinfoweb.com" style="background-color: #0066cc; color: #ffffff; font-size: 15px; font-weight: bold; padding: 12px 28px; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 2px 6px rgba(0,102,204,0.3);">Schedule a Follow-Up</a></div> (vary the button label to fit the email's specific ask if appropriate, e.g. "Book a 15-Minute Call" — it does not have to say exactly "Schedule a Follow-Up" every time).
- The signature block, verbatim:
  <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 13px; color: #475569;">
    <p style="margin: 0 0 6px 0; font-size: 14px; color: #0f172a;">Looking forward to connecting soon!</p>
    <p style="margin: 0 0 12px 0;">Best regards,</p>
    <p style="margin: 0; font-weight: bold; font-size: 15px; color: #0f172a;">Meet Modi</p>
    <p style="margin: 2px 0; font-weight: 500; color: #2563eb;">Senior Technology Consultant | Desire InfoWeb</p>
    <p style="margin: 2px 0;">Certified Microsoft Solutions Partner</p>
    <p style="margin: 4px 0;">
      Email: <a href="mailto:meet@desireinfoweb.in" style="color: #2563eb; text-decoration: none;">meet@desireinfoweb.in</a> |
      Website: <a href="https://desireinfoweb.com" style="color: #2563eb; font-weight: bold; text-decoration: none;">https://desireinfoweb.com</a>
    </p>
  </div>

EVERYTHING ELSE IS YOURS TO WRITE FRESH EACH TIME, based on real research and row data:
- The greeting and opening paragraph: reference the recipient's actual role, company, and (if you found it via web_search) something specific and true about their business — not a generic "forward-thinking organization" line.
- The body: 2-4 short paragraphs and/or a bullet list connecting what Desire InfoWeb actually offers (from the services/products list above) to what you learned this specific company does or needs. Only mention services genuinely relevant to what you found — do not list all five service categories every time.
- Keep paragraph styling similar to the fixed elements (font-size: 14px, color: #334155, reasonable margins) for visual consistency, but the wording, structure, number of paragraphs, and whether you use a bullet list at all should vary based on what fits this recipient's research best.
- Close with a specific, relevant call to action tied to what was discussed, then the CTA button and signature above.

CRITICAL CONSTRAINTS:
- ABSOLUTELY NO SENDER PLACEHOLDERS: NEVER leave [Your Name] or [Your Job Title] in the signature. The signature MUST always be finalized as Meet Modi, Senior Technology Consultant | Desire InfoWeb.
- NEVER leave bracketed placeholders like [Company Name] or [Industry] in the final output — always resolve them to the real values from the row data or web research.
- Output MUST be a raw valid JSON object with keys "subject" and "htmlBody".`;

  const userPrompt = `SENDER BRANDING:
Sender: Meet Modi
Title: Senior Technology Consultant | Desire InfoWeb
Email: meet@desireinfoweb.in
Website: https://desireinfoweb.com
Services: SharePoint Modernization, Microsoft 365 Copilot Studio, Azure AI Foundry, Power Platform, Dynamics 365, Web/Mobile Development
Products: Organization Chart, Onboarding Portal, Employee Directory, Project Management Portal, LMS, Audit System

MASTER CAMPAIGN GOAL:
"${masterPrompt || 'Introduce Desire InfoWeb SharePoint and AI modernization services tailored to their job role and organization.'}"

RECIPIENT ROW DATA FROM SHAREPOINT:
${JSON.stringify(contactData, null, 2)}

${urlFields.length > 0
    ? `URLS FOUND IN THIS ROW (use web_search to research these before writing):\n${urlFields.join('\n')}`
    : 'No URLs were found in this row — write the email using only the row data above, without web research.'}

Draft the personalized email from Meet Modi (meet@desireinfoweb.in) at Desire InfoWeb (https://desireinfoweb.com) specifically for ${contactData.name || contactData['Full Name'] || 'the recipient'} at ${contactData['Company Name'] || contactData.Company || 'their organization'}. Ensure Meet Modi signature is fully populated with no placeholders.`;

  try {
    let response;

    if (azureApiKey && azureEndpoint) {
      const cleanEndpoint = azureEndpoint.replace(/\/+$/, '');
      const url = `${cleanEndpoint}/responses`;

      response = await axios.post(
        url,
        {
          model: azureDeployment,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: azureTemp,
          tools: urlFields.length > 0 ? [{ type: 'web_search' }] : undefined,
          // Force the model to actually call web_search (not just have it offered) whenever
          // a URL was found in the row, so research always happens before the draft is written.
          tool_choice: urlFields.length > 0 ? 'required' : undefined,
          text: {
            format: {
              type: 'json_schema',
              name: 'email_draft',
              schema: DRAFT_JSON_SCHEMA,
              strict: true,
            },
          },
        },
        {
          headers: {
            'api-key': azureApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 45000,
        }
      );
    } else {
      response = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          tools: urlFields.length > 0 ? [{ type: 'web_search' }] : undefined,
          tool_choice: urlFields.length > 0 ? 'required' : undefined,
          text: {
            format: {
              type: 'json_schema',
              name: 'email_draft',
              schema: DRAFT_JSON_SCHEMA,
              strict: true,
            },
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${standardApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 45000,
        }
      );
    }

    const contentStr = extractOutputText(response.data);
    if (!contentStr) {
      throw new Error('No output text returned by the model');
    }

    let parsed;
    try {
      parsed = JSON.parse(contentStr);
    } catch {
      const cleaned = contentStr.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const name = contactData.name || contactData.Title || contactData.fullname || contactData['Full Name'] || 'Valued Client';

    return {
      subject: parsed.subject || `Tailored proposal for ${name}`,
      htmlBody: parsed.htmlBody || `<p>Hello ${name},</p><p>We wanted to reach out to you from Desire InfoWeb.</p>`
    };
  } catch (error) {
    const errorDetails = error.response?.data?.error?.message || error.response?.data || error.message;
    console.error('AI Draft Generation Error:', errorDetails);
    throw new Error(`AI Draft Generation Failed: ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`);
  }
}

// Extracts the final assistant message text from a Responses API payload,
// regardless of whether preceding items are web_search_call / reasoning items.
function extractOutputText(data) {
  if (typeof data.output_text === 'string' && data.output_text) {
    return data.output_text;
  }
  const messageItem = (data.output || []).find((item) => item.type === 'message');
  const textPart = messageItem?.content?.find((c) => c.type === 'output_text');
  return textPart?.text || null;
}

module.exports = { generateRecipientDraft };
