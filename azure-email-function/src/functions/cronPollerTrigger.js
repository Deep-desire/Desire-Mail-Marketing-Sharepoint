const { app } = require('@azure/functions');
const df = require('durable-functions');
const { prisma } = require('../lib/prisma');

app.timer('scheduledCampaignPoller', {
  schedule: '0 */5 * * * *',
  extraInputs: [df.input.durableClient()],
  handler: async (myTimer, context) => {
    const client = df.getClient(context);
    const now = new Date();

    try {
      const scheduledCampaigns = await prisma.campaign.findMany({
        where: {
          status: 'scheduled',
          scheduledAt: { lte: now },
        },
      });

      for (const campaign of scheduledCampaigns) {
        const instanceId = `campaign-${campaign.id}`;
        try {
          const existingStatus = await client.getStatus(instanceId);
          if (!existingStatus || existingStatus.runtimeStatus === 'Completed' || existingStatus.runtimeStatus === 'Failed') {
            await client.startNew('emailCampaignOrchestrator', {
              instanceId,
              input: { campaignId: campaign.id },
            });
            console.log(`[Cron Poller] Triggered orchestration for scheduled campaign ${campaign.id}`);
          }
        } catch (err) {
          console.error(`[Cron Poller] Error checking status for campaign ${campaign.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Cron Poller] Error executing timer trigger poll:', err);
    }
  },
});
