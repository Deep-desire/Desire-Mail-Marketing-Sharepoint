const { app } = require('@azure/functions');
const df = require('durable-functions');

app.http('startCampaignOrchestrator', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'orchestration/start-campaign',
  extraInputs: [df.input.durableClient()],
  handler: async (request, context) => {
    const client = df.getClient(context);

    // Header secret key authentication
    const secretKey = request.headers.get('x-azure-secret');
    if (process.env.AZURE_FUNCTION_SECRET_KEY && secretKey !== process.env.AZURE_FUNCTION_SECRET_KEY) {
      return { status: 401, jsonBody: { error: 'Unauthorized: invalid secret key' } };
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return { status: 400, jsonBody: { error: 'Invalid JSON request body' } };
    }

    const { campaignId } = body || {};
    if (!campaignId) {
      return { status: 400, jsonBody: { error: 'campaignId parameter is required' } };
    }

    const instanceId = `campaign-${campaignId}`;

    // Guard against starting a second orchestration instance for a campaign that's
    // already running (e.g. a duplicate/retried trigger from the backend racing the
    // scheduledCampaignPoller) — mirrors the check already done in cronPollerTrigger.js.
    let existingStatus = null;
    try {
      existingStatus = await client.getStatus(instanceId);
    } catch (err) {
      existingStatus = null;
    }

    if (existingStatus && existingStatus.runtimeStatus !== 'Completed' && existingStatus.runtimeStatus !== 'Failed' && existingStatus.runtimeStatus !== 'Terminated') {
      return client.createCheckStatusResponse(request, instanceId);
    }

    await client.startNew('emailCampaignOrchestrator', {
      instanceId,
      input: { campaignId },
    });

    return client.createCheckStatusResponse(request, instanceId);
  },
});
