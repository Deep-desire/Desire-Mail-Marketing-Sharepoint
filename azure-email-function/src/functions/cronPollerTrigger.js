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
      const campaignsToResume = await prisma.campaign.findMany({
        where: {
          OR: [
            { status: 'scheduled', scheduledAt: { lte: now } },
            { status: 'processing', pendingCount: { gt: 0 } },
          ],
        },
      });

      for (const campaign of campaignsToResume) {
        const instanceId = `campaign-${campaign.id}`;

        // getStatus throws (HTTP 404) when no instance exists yet for this id —
        // that is the normal case for a campaign that has never been started,
        // so it must NOT be treated as a reason to skip starting it.
        let existingStatus = null;
        try {
          existingStatus = await client.getStatus(instanceId);
        } catch (err) {
          existingStatus = null;
        }

        if (!existingStatus || existingStatus.runtimeStatus === 'Completed' || existingStatus.runtimeStatus === 'Failed') {
          try {
            await client.startNew('emailCampaignOrchestrator', {
              instanceId,
              input: { campaignId: campaign.id },
            });
            console.log(`[Cron Poller] Triggered orchestration for campaign ${campaign.id}`);
          } catch (err) {
            console.error(`[Cron Poller] Error starting orchestration for campaign ${campaign.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[Cron Poller] Error executing timer trigger poll:', err);
    }
  },
});
