const { enrichContactContext } = require('./src/webSearch');

async function testWebSearch() {
  console.log('Testing Automated Web Intelligence Scraper...');

  const sampleContact = {
    'Full Name': 'Deep Patel',
    'Title': 'CEO',
    'Company Name': 'TechNova Pvt Ltd',
    'Website': 'https://desireinfoweb.com',
    'LinkedIn / Xing URL': 'https://www.linkedin.com/in/dev7088'
  };

  const enriched = await enrichContactContext(sampleContact);

  console.log('\n--- ENRICHMENT RESULT ---');
  console.log(JSON.stringify(enriched._aiWebResearch, null, 2));
}

testWebSearch().catch(err => console.error('Test error:', err));
