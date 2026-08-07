const df = require('durable-functions');

df.app.orchestration('emailCampaignOrchestrator', function* (context) {
  const input = context.df.getInput();
  const campaignId = input ? input.campaignId : null;

  if (!campaignId) {
    return { error: 'campaignId input missing' };
  }

  // Step 1: Fetch initial campaign details
  const campaign = yield context.df.callActivity('getCampaignDataActivity', { campaignId });
  if (!campaign) {
    return { error: 'Campaign not found' };
  }

  // Step 2: Check for scheduled send date and sleep if in future
  if (campaign.scheduledAt && new Date(campaign.scheduledAt) > context.df.currentUtcDateTime) {
    const fireAt = new Date(campaign.scheduledAt);
    yield context.df.createTimer(fireAt);
  }

  // Step 3: Mark campaign as processing
  yield context.df.callActivity('finalizeCampaignActivity', { campaignId, status: 'processing' });

  // Step 4: Batch sending loop
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 5;
  const BATCH_DELAY_MS = (parseInt(process.env.BATCH_DELAY_SEC, 10) || 15) * 1000;

  let hasPending = true;
  while (hasPending) {
    const currentData = yield context.df.callActivity('getCampaignDataActivity', { campaignId, batchSize: BATCH_SIZE });

    if (!currentData || !currentData.recipients || currentData.recipients.length === 0) {
      hasPending = false;
      break;
    }

    const batchResults = yield context.df.callActivity('sendBatchActivity', {
      recipients: currentData.recipients,
      template: currentData.template,
      isAiGenerated: currentData.isAiGenerated,
      aiPrompt: currentData.aiPrompt,
    });

    yield context.df.callActivity('updateCampaignStatsActivity', { campaignId, batchResults });

    // Delay between batches for rate-limiting / spam-avoidance
    const nextTick = new Date(context.df.currentUtcDateTime.getTime() + BATCH_DELAY_MS);
    yield context.df.createTimer(nextTick);
  }

  // Step 5: Mark campaign completed
  yield context.df.callActivity('finalizeCampaignActivity', { campaignId, status: 'completed' });
  return { campaignId, status: 'completed' };
});
