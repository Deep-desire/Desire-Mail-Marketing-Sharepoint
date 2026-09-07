const { app } = require('@azure/functions');
const { fetchAllSharePointContacts } = require('../lib/sharepointFetch');

app.http('sharepointFetchContacts', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'sharepoint/contacts',
  handler: async (request, context) => {
    const secretKey = request.headers.get('x-azure-secret');
    if (process.env.AZURE_FUNCTION_SECRET_KEY && secretKey !== process.env.AZURE_FUNCTION_SECRET_KEY) {
      return { status: 401, jsonBody: { error: 'Unauthorized: invalid secret key' } };
    }

    let configId = request.query.get('configId');
    if (!configId && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      configId = body?.configId;
    }
    if (!configId) {
      return { status: 400, jsonBody: { error: 'configId parameter is required' } };
    }

    try {
      const { contacts, rawItemCount } = await fetchAllSharePointContacts(configId, context);
      return { status: 200, jsonBody: { count: contacts.length, rawItemCount, contacts } };
    } catch (err) {
      context.error(`[SharePoint Fetch] ${err.message}`);
      return { status: 500, jsonBody: { error: err.message } };
    }
  },
});
