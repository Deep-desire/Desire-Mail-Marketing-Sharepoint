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
  let hasPending = true;
  while (hasPending) {
    const currentData = yield context.df.callActivity('getCampaignDataActivity', { campaignId, batchSize: 50 });
    
    if (!currentData || !currentData.recipients || currentData.recipients.length === 0) {
      hasPending = false;
      break;
    }

    const batchResults = yield context.df.callActivity('sendBatchActivity', {
      recipients: currentData.recipients,
      template: currentData.template,
    });

    yield context.df.callActivity('updateCampaignStatsActivity', { campaignId, batchResults });

    // Optional short delay between batches for rate-limiting
    const nextTick = new Date(context.df.currentUtcDateTime.getTime() + 1000);
    yield context.df.createTimer(nextTick);
  }

  // Step 5: Mark campaign completed
  yield context.df.callActivity('finalizeCampaignActivity', { campaignId, status: 'completed' });
  return { campaignId, status: 'completed' };
});
