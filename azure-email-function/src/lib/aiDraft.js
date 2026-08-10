// Generates personalized email subject and HTML body using Azure OpenAI, mirroring
// backend/src/ai.js's prompt/style and web_search usage via the Responses API.

const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    htmlBody: { type: 'string' },
  },
  required: ['subject', 'htmlBody'],
  additionalProperties: false,
};

function extractOutputText(data) {
  if (typeof data.output_text === 'string' && data.output_text) {
    return data.output_text;
  }
  const messageItem = (data.output || []).find((item) => item.type === 'message');
  const textPart = messageItem?.content?.find((c) => c.type === 'output_text');
  return textPart?.text || null;
}

async function generateRecipientDraft({ masterPrompt, contactData }) {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
  const azureTemp = parseFloat(process.env.AZURE_OPENAI_TEMPERATURE || '0.1');

  if (!azureApiKey || !azureEndpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY not configured');
  }

  const urlFields = Object.entries(contactData || {})
    .filter(([, value]) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))
    .map(([key, value]) => `${key}: ${value.trim()}`);

  const systemPrompt = `You are an elite B2B executive email copywriter representing Desire InfoWeb (https://desireinfoweb.com), a premier Certified Microsoft Solutions Partner.
Your mission is to compose a highly personalized, executive-level outreach email for a prospect based on their individual row data AND live web research you perform yourself using the web_search tool.

COMPANY IDENTITY & SENDER DEFINITION (CRITICAL):
- SENDER NAME: Meet Modi
- SENDER TITLE: Senior Technology Consultant | Desire InfoWeb
- SENDER EMAIL: meet@desireinfoweb.in
- SENDER COMPANY: Desire InfoWeb (https://desireinfoweb.com)
- SENDER CERTIFICATION: Certified Microsoft Solutions Partner (Microsoft 365, Azure, Power Platform, Dynamics 365)

WEB RESEARCH INSTRUCTIONS (CRITICAL — this is the most important part of your job):
- If the recipient row includes a company website, LinkedIn profile, or any other URL, you MUST use the web_search tool to look up that URL and gather real, current information about the company (what they actually do, their specific products/services, recent news, industry positioning) before writing the email.
- The email's substance must be built from what you actually found via web_search and from the row data (Title, Company Name, Industry, Remark/Notes) — not a generic pitch with one research detail dropped in as an afterthought.
- Only state facts you actually found via web_search or that are present in the row data. Never fabricate research findings, statistics, or claims about the company. If web_search returns nothing useful, write a shorter, more general (but still non-templated) email grounded only in the row data.
- Every email must read as genuinely different from the last one you wrote for a different recipient — different opening line, different specific observations, different phrasing — because the underlying research and row data are different.

CRITICAL CONSTRAINTS:
- ABSOLUTELY NO SENDER PLACEHOLDERS: NEVER leave [Your Name] or [Your Job Title] in the signature. The signature MUST always be finalized as Meet Modi, Senior Technology Consultant | Desire InfoWeb.
- NEVER leave bracketed placeholders like [Company Name] in the final output — always resolve them to the real values from the row data or web research.
- Output MUST be a raw valid JSON object with keys "subject" and "htmlBody".`;

  const userPrompt = `MASTER CAMPAIGN GOAL:
"${masterPrompt || 'Introduce Desire InfoWeb SharePoint and AI modernization services tailored to their job role and organization.'}"

RECIPIENT ROW CONTEXT:
${JSON.stringify(contactData, null, 2)}

${urlFields.length > 0
    ? `URLS FOUND IN THIS ROW (use web_search to research these before writing):\n${urlFields.join('\n')}`
    : 'No URLs were found in this row — write the email using only the row data above, without web research.'}

Draft the personalized email from Meet Modi (meet@desireinfoweb.in) at Desire InfoWeb (https://desireinfoweb.com) specifically for ${contactData.name || contactData['Full Name'] || 'the recipient'} at ${contactData['Company Name'] || contactData.Company || 'their organization'}. Ensure Meet Modi signature is fully populated with no placeholders.`;

  const cleanEndpoint = azureEndpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/responses`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': azureApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`AI Draft Generation Failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const contentStr = extractOutputText(data);
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

  const name = contactData.name || contactData['Full Name'] || 'Valued Client';
  return {
    subject: parsed.subject || `Tailored proposal for ${name}`,
    htmlBody: parsed.htmlBody || `<p>Hello ${name},</p><p>We wanted to reach out to you from Desire InfoWeb.</p>`,
  };
}

module.exports = { generateRecipientDraft };
