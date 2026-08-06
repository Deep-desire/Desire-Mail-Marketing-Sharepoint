require('dotenv').config();
const { generateRecipientDraft } = require('./src/ai');

async function testAi() {
  console.log('Testing Azure OpenAI Draft Generation...');
  console.log('Endpoint:', process.env.AZURE_OPENAI_ENDPOINT);
  console.log('Deployment:', process.env.AZURE_OPENAI_CHAT_DEPLOYMENT);

  const sampleContact = {
    Name: 'Jane Doe',
    Title: 'VP of Technology',
    Company: 'Acme Global Corp',
    Department: 'Information Technology',
    City: 'San Francisco',
    Notes: 'Interested in AI automation and SharePoint integration.'
  };

  const result = await generateRecipientDraft({
    masterPrompt: 'Draft an executive reach-out offering custom SharePoint & AI solutions.',
    contactData: sampleContact
  });

  console.log('\n--- SUCCESS! Generated AI Draft ---');
  console.log('Subject:', result.subject);
  console.log('HTML Body:\n', result.htmlBody);
}

testAi().catch(err => {
  console.error('Test Error:', err.message);
});
