/**
 * seed-sharepoint.js
 * One-time script: seeds the default SharePoint list config from .env into
 * the sharepoint_configs table so the dropdown is never empty after migration.
 * Run with: node prisma/seed-sharepoint.js
 */
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  const siteId = process.env.SP_SITE_ID;
  const listId = process.env.SP_LIST_ID;

  if (!siteId || !listId) {
    console.log('[Seed] SP_SITE_ID or SP_LIST_ID not set in .env — skipping.');
    return;
  }

  // Check if any config already exists with this listId
  const existing = await prisma.sharePointConfig.findFirst({ where: { listId } });
  if (existing) {
    console.log(`[Seed] A config for listId=${listId} already exists ("${existing.name}") — skipping.`);
    return;
  }

  const config = await prisma.sharePointConfig.create({
    data: {
      name: 'Default SharePoint List',
      siteId,
      listId,
      // Credentials intentionally null → will use TENANT_ID / SP_CLIENT_ID / SP_CLIENT_SECRET env vars
      tenantId:     null,
      clientId:     null,
      clientSecret: null,
      sortOrder:    0,
    },
  });

  console.log(`[Seed] Created default config: "${config.name}" (id: ${config.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
