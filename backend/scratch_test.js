const { getSharePointContacts } = require('./src/sharepoint');

async function diagnose() {
  const LEAD_LIST_CONFIG_ID = 'b302f87a-72d9-482f-b4fc-512c81de4796';
  const SENT_AT = new Date('2026-07-03T11:05:55.000Z'); // sentAt from DB (UTC)

  console.log('\n=== SharePoint contacts modifiedAt vs sentAt ===');
  const contacts = await getSharePointContacts(LEAD_LIST_CONFIG_ID);
  for (const c of contacts) {
    const modifiedAt = new Date(c.modifiedAt);
    const isNewer = modifiedAt > SENT_AT;
    console.log(`email=${c.email}`);
    console.log(`  modifiedAt = ${c.modifiedAt}`);
    console.log(`  sentAt     = ${SENT_AT.toISOString()}`);
    console.log(`  modifiedAt > sentAt? ${isNewer}  ← if true, incremental wrongly re-includes this contact`);
    console.log('');
  }
}
diagnose().catch(console.error);
