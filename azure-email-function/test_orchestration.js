const { renderTemplate } = require('./src/lib/templates');

console.log('--- Testing Azure Durable Functions Email Subsystem ---');

// 1. Test Handlebars template compiler
const sampleTemplate = '<p>Hello {{name}}, welcome to {{company}}!</p><a href="{{unsubscribeLink}}">Unsubscribe</a>';
const sampleVars = {
  name: 'Jane Doe',
  company: 'Desire Mail Marketing',
  unsubscribeLink: 'http://localhost:5173/unsubscribe?email=jane%40example.com',
};

const rendered = renderTemplate(sampleTemplate, sampleVars);
console.log('[1] Template Rendering Output:');
console.log(rendered);

if (rendered.includes('Jane Doe') && rendered.includes('Desire Mail Marketing') && rendered.includes('unsubscribe')) {
  console.log('✅ Template rendering test PASSED');
} else {
  console.error('❌ Template rendering test FAILED');
  process.exit(1);
}

console.log('\n--- All local library unit verification tests PASSED ---');
