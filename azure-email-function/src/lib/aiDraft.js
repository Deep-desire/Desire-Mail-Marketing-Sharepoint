// Generates personalized email subject and HTML body using Azure OpenAI, mirroring
// backend/src/ai.js's prompt/style. Unlike the backend version, this does not perform
// live web/LinkedIn enrichment of contactData (kept dependency-free for this service).
async function generateRecipientDraft({ masterPrompt, contactData }) {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
  const azureTemp = parseFloat(process.env.AZURE_OPENAI_TEMPERATURE || '0.1');

  if (!azureApiKey || !azureEndpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY not configured');
  }

  const systemPrompt = `You are an elite B2B executive email copywriter representing Desire InfoWeb (https://desireinfoweb.com), a premier Certified Microsoft Solutions Partner.
Your mission is to compose a highly personalized, executive-level outreach email for a prospect based on their individual row data.

COMPANY IDENTITY & SENDER DEFINITION (CRITICAL):
- SENDER NAME: Meet Modi
- SENDER TITLE: Senior Technology Consultant | Desire InfoWeb
- SENDER EMAIL: meet@desireinfoweb.in
- SENDER COMPANY: Desire InfoWeb (https://desireinfoweb.com)
- SENDER CERTIFICATION: Certified Microsoft Solutions Partner (Microsoft 365, Azure, Power Platform, Dynamics 365)

CRITICAL CONSTRAINTS:
- ABSOLUTELY NO SENDER PLACEHOLDERS: NEVER leave [Your Name] or [Your Job Title] in the signature. The signature MUST always be finalized as Meet Modi, Senior Technology Consultant | Desire InfoWeb.
- Output MUST be a raw valid JSON object with keys "subject" and "htmlBody". Do NOT enclose in markdown code blocks (\`\`\`json).`;

  const userPrompt = `MASTER CAMPAIGN GOAL:
"${masterPrompt || 'Introduce Desire InfoWeb SharePoint and AI modernization services tailored to their job role and organization.'}"

RECIPIENT ROW CONTEXT:
${JSON.stringify(contactData, null, 2)}

Draft the personalized email from Meet Modi (meet@desireinfoweb.in) at Desire InfoWeb (https://desireinfoweb.com) specifically for ${contactData.name || contactData['Full Name'] || 'the recipient'} at ${contactData['Company Name'] || contactData.Company || 'their organization'}. Ensure Meet Modi signature is fully populated with no placeholders.`;

  const cleanEndpoint = azureEndpoint.replace(/\/+$/, '');
  const url = `${cleanEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': azureApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: azureTemp,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`AI Draft Generation Failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const contentStr = data.choices[0]?.message?.content;
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
