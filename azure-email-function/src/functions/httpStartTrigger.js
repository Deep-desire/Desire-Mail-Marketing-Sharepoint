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
    await client.startNew('emailCampaignOrchestrator', {
      instanceId,
      input: { campaignId },
    });

    return client.createCheckStatusResponse(request, instanceId);
  },
});
