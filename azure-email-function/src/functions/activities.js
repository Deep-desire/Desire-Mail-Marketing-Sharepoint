const df = require('durable-functions');
const { prisma } = require('../lib/prisma');
const { sendEmail } = require('../lib/emailSender');
const { renderTemplate } = require('../lib/templates');

// Activity 1: Get campaign metadata & batch of pending recipients
df.app.activity('getCampaignDataActivity', {
  handler: async (input) => {
    const { campaignId, batchSize = 50 } = input;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        recipients: {
          where: { status: 'pending' },
          take: batchSize,
        },
      },
    });
    return campaign;
  },
});

// Activity 2: Send batch of emails
df.app.activity('sendBatchActivity', {
  handler: async (input) => {
    const { recipients, template } = input;
    const results = [];

    for (const recipient of recipients) {
      try {
        const subject = recipient.aiSubject || (template ? template.subject : 'No Subject');
        const htmlContent = template ? template.htmlBody : (recipient.aiBody || '');
        
        const htmlBody = renderTemplate(htmlContent, {
          name: recipient.name,
          email: recipient.email,
          unsubscribeLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe?email=${encodeURIComponent(recipient.email)}`,
        });

        await sendEmail({
          to: recipient.email,
          subject,
          html: htmlBody,
        });

        results.push({ id: recipient.id, status: 'sent', sentAt: new Date() });
      } catch (err) {
        results.push({ id: recipient.id, status: 'failed', error: err.message });
      }
    }
    return results;
  },
});

// Activity 3: Update campaign & recipient statistics in database
df.app.activity('updateCampaignStatsActivity', {
  handler: async (input) => {
    const { campaignId, batchResults } = input;

    let sentInc = 0;
    let failedInc = 0;

    for (const res of batchResults) {
      if (res.status === 'sent') {
        sentInc++;
        await prisma.recipient.update({
          where: { id: res.id },
          data: { status: 'sent', sentAt: res.sentAt },
        });
      } else {
        failedInc++;
        await prisma.recipient.update({
          where: { id: res.id },
          data: { status: 'failed', error: res.error },
        });
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: { increment: sentInc },
        failedCount: { increment: failedInc },
        pendingCount: { decrement: sentInc + failedInc },
      },
    });

    return { sentInc, failedInc };
  },
});

// Activity 4: Finalize campaign status
df.app.activity('finalizeCampaignActivity', {
  handler: async (input) => {
    const { campaignId, status } = input;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status },
    });
    return { success: true, status };
  },
});
