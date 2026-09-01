const { app } = require('@azure/functions');
const df = require('durable-functions');
const { prisma } = require('../lib/prisma');

app.timer('scheduledCampaignPoller', {
  schedule: '0 * * * * *',
  extraInputs: [df.input.durableClient()],
  handler: async (myTimer, context) => {
    const client = df.getClient(context);
    const now = new Date();

    try {
      // Recover recipients stranded in 'sending': a batch activity that crashed or
      // whose orchestration instance died mid-run leaves rows claimed but never
      // resolved to sent/failed, and the campaign's pendingCount/status already
      // reflect them as claimed — so nothing else will ever retry them. Anything
      // still 'sending' more than 10 minutes after being claimed is safe to assume
      // abandoned (a real send completes in well under a minute) and gets reset to
      // 'pending' so the next orchestration run picks it back up.
      const staleThreshold = new Date(now.getTime() - 10 * 60 * 1000);
      const stranded = await prisma.recipient.updateMany({
        where: { status: 'sending', updatedAt: { lte: staleThreshold } },
        data: { status: 'pending' },
      });
      if (stranded.count > 0) {
        console.log(`[Cron Poller] Reset ${stranded.count} stranded 'sending' recipient(s) back to 'pending'.`);
        await prisma.campaign.updateMany({
          where: { recipients: { some: { status: 'pending' } }, status: { in: ['completed', 'failed'] } },
          data: { status: 'processing' },
        });
      }

      const campaignsToResume = await prisma.campaign.findMany({
        where: {
          OR: [
            { status: 'scheduled', scheduledAt: { lte: now } },
            { status: 'processing', pendingCount: { gt: 0 } },
            { status: 'processing', recipients: { some: { status: 'pending' } } },
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
