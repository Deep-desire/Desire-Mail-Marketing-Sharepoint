const axios = require('axios');
const { enrichContactContext } = require('./webSearch');

/**
 * Generates personalized email subject and HTML body using Azure OpenAI / OpenAI based on master prompt & contact row context.
 * Automatically enriches contact data with real-time web & LinkedIn research scraped from the recipient's website.
 */
async function generateRecipientDraft({ masterPrompt, contactData }) {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
  const azureTemp = parseFloat(process.env.AZURE_OPENAI_TEMPERATURE || '0.1');

  const standardApiKey = process.env.OPENAI_API_KEY;

  if (!azureApiKey && !standardApiKey) {
    throw new Error('Neither AZURE_OPENAI_API_KEY nor OPENAI_API_KEY is configured in backend environment variables.');
  }

  // Perform automated real-time web intelligence scraping for prospect website & LinkedIn context
  const enrichedContactData = await enrichContactContext(contactData);

  const systemPrompt = `You are an elite B2B executive email copywriter representing Desire InfoWeb (https://desireinfoweb.com), a premier Certified Microsoft Solutions Partner.
Your mission is to compose a highly personalized, executive-level outreach email for a prospect based on their individual SharePoint row data AND live web research.

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

MANDATORY EMAIL WRITING STYLE & PARAGRAPH FLOW (MUST MATCH EXACTLY):
Your generated htmlBody MUST strictly follow this exact structural flow, tone, and HTML layout:

<div style="font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #334155; line-height: 1.6;">

  <p style="font-size: 16px; font-weight: bold; margin-bottom: 18px; color: #0f172a;">Dear [Recipient First Name or Name],</p>

  <p style="font-size: 14px; margin-bottom: 16px; color: #334155;">
    As the [Recipient Title/Role] of [Company Name], a forward-thinking organization in the [Industry] industry, I wanted to personally reach out to introduce a transformative opportunity for your team. With your leadership and [Company Name]’s commitment to innovation, we believe our AI-powered SharePoint modernization services can help you unlock new efficiencies and drive unparalleled collaboration across your organization.
  </p>

  <p style="font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #0f172a;">Here’s how we can support [Company Name]’s growth:</p>
  
  <ul style="padding-left: 20px; margin-bottom: 24px; font-size: 14px; color: #334155;">
    <li style="margin-bottom: 10px;"><strong>AI-Driven Insights:</strong> Leverage advanced AI and Copilot Studio to streamline workflows and enhance decision-making.</li>
    <li style="margin-bottom: 10px;"><strong>Seamless SharePoint Modernization:</strong> Upgrade your existing SharePoint infrastructure to improve usability, security, and scalability.</li>
    <li style="margin-bottom: 10px;"><strong>Tailored Solutions:</strong> Customized strategies designed to align with [Company Name]’s unique goals[and team size of X if available].</li>
  </ul>

  <p style="font-size: 14px; margin-bottom: 16px; color: #334155;">
    As a Certified Microsoft Solutions Partner, Desire InfoWeb brings deep expertise and proven methodologies to ensure a smooth and impactful transformation for your organization.
  </p>

  <p style="font-size: 14px; margin-bottom: 16px; color: #334155;">
    [Specific tailored observation based on recipient's Remark, Notes, or scraped website metadata, e.g. "I noticed that a demo has already been scheduled..." or "I noticed your company's focus on scalable software platforms..." If client website is present, add: "In the meantime, feel free to explore more on your site: <a href='[Client Website]'>[Domain]</a>."]
  </p>

  <p style="font-size: 14px; margin-bottom: 24px; color: #334155;">
    Would you be open to a brief follow-up conversation to discuss your specific needs and how we can tailor our solutions for [Company Name]?
  </p>

  <div style="text-align: center; margin: 28px 0;">
    <a href="https://desireinfoweb.com" style="background-color: #0066cc; color: #ffffff; font-size: 15px; font-weight: bold; padding: 12px 28px; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 2px 6px rgba(0,102,204,0.3);">
      Schedule a Follow-Up
    </a>
  </div>

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
</div>

CRITICAL CONSTRAINTS:
- ABSOLUTELY NO SENDER PLACEHOLDERS: NEVER leave [Your Name] or [Your Job Title] in the signature. The signature MUST always be finalized as Meet Modi, Senior Technology Consultant | Desire InfoWeb.
- Output MUST be a raw valid JSON object with keys "subject" and "htmlBody". Do NOT enclose in markdown code blocks (\`\`\`json).`;

  const userPrompt = `SENDER BRANDING:
Sender: Meet Modi
Title: Senior Technology Consultant | Desire InfoWeb
Email: meet@desireinfoweb.in
Website: https://desireinfoweb.com
Services: SharePoint Modernization, Microsoft 365 Copilot Studio, Azure AI Foundry, Power Platform, Dynamics 365, Web/Mobile Development
Products: Organization Chart, Onboarding Portal, Employee Directory, Project Management Portal, LMS, Audit System

MASTER CAMPAIGN GOAL:
"${masterPrompt || 'Introduce Desire InfoWeb SharePoint and AI modernization services tailored to their job role and organization.'}"

ENRICHED RECIPIENT ROW CONTEXT & WEB INTELLIGENCE:
${JSON.stringify(enrichedContactData, null, 2)}

Draft the personalized email from Meet Modi (meet@desireinfoweb.in) at Desire InfoWeb (https://desireinfoweb.com) specifically for ${contactData.name || contactData['Full Name'] || 'the recipient'} at ${contactData['Company Name'] || contactData.Company || 'their organization'}. Utilize the scraped website intelligence in _aiWebResearch to show real research. Ensure Meet Modi signature is fully populated with no placeholders.`;

  try {
    let response;

    if (azureApiKey && azureEndpoint) {
      const cleanEndpoint = azureEndpoint.replace(/\/+$/, '');
      const url = `${cleanEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;

      response = await axios.post(
        url,
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: azureTemp,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'api-key': azureApiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
    } else {
      response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${standardApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
    }

    const contentStr = response.data.choices[0]?.message?.content;
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

module.exports = { generateRecipientDraft };
