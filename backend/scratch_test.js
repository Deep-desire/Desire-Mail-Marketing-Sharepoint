const { prisma } = require('./src/prisma');

async function test() {
  console.log("Testing database connection...");
  try {
    const campaigns = await prisma.campaign.findMany({ take: 1 });
    console.log("SUCCESS:", campaigns);
  } catch (err) {
    console.error("ERROR CONNECTING TO DATABASE:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
