const df = require('durable-functions');
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { sendEmail } = require('../lib/emailSender');
const { renderTemplate } = require('../lib/templates');
const { generateRecipientDraft } = require('../lib/aiDraft');

// Activity 1: Get campaign metadata & batch of pending recipients.
// Atomically claims the batch (pending -> sending) before returning it, so a
// concurrent/duplicate orchestration run (or an activity replay/retry) for the
// same campaign can't select and re-send the same recipient rows.
df.app.activity('getCampaignDataActivity', {
  handler: async (input) => {
    const { campaignId, batchSize = 50 } = input;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });
    if (!campaign) return null;

    const candidates = await prisma.recipient.findMany({
      where: { campaignId, status: 'pending' },
      take: batchSize,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return { ...campaign, recipients: [] };
    }

    const claim = await prisma.recipient.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: 'pending' },
      data: { status: 'sending' },
    });

    if (claim.count === 0) {
      return { ...campaign, recipients: [] };
    }

    const recipients = await prisma.recipient.findMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: 'sending' },
    });

    return { ...campaign, recipients };
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Random delay between individual sends within a batch, to avoid looking like
// a burst of bulk mail to receiving mail servers.
const EMAIL_DELAY_MIN_MS = (parseInt(process.env.EMAIL_DELAY_MIN_SEC, 10) || 20) * 1000;
const EMAIL_DELAY_MAX_MS = (parseInt(process.env.EMAIL_DELAY_MAX_SEC, 10) || 30) * 1000;

// Activity 2: Send batch of emails
df.app.activity('sendBatchActivity', {
  handler: async (input) => {
    const { recipients, template, isAiGenerated, aiPrompt } = input;
    const results = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      try {
        const token = crypto
          .createHash('sha256')
          .update(recipient.email + 'desire-unsubscribe-salt')
          .digest('hex')
          .substring(0, 32);
        const unsubscribeLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe/${token}?email=${encodeURIComponent(recipient.email)}`;
        const variables = { name: recipient.name, email: recipient.email, unsubscribeLink };

        let subject;
        let htmlBody;
        let textBody;

        if (isAiGenerated) {
          let aiSubject = recipient.aiSubject;
          let aiBody = recipient.aiBody;

          if (!aiSubject || !aiBody) {
            const contactData = { name: recipient.name, email: recipient.email, ...(recipient.rawFields || {}) };
            const draft = await generateRecipientDraft({ masterPrompt: aiPrompt, contactData });
            aiSubject = draft.subject;
            aiBody = draft.htmlBody;
            await prisma.recipient.update({
              where: { id: recipient.id },
              data: { aiSubject, aiBody },
            });
          }

          // AI-generated content is already fully personalized (no {{handlebars}} placeholders
          // beyond what's baked in), so it's used as-is with a manually appended unsubscribe footer.
          subject = aiSubject;
          htmlBody = `${aiBody}<p style="margin-top:24px;font-size:12px;color:#94a3b8;">Don't want to receive these emails anymore? <a href="${unsubscribeLink}">Unsubscribe</a>.</p>`;
          textBody = undefined;
        } else {
          subject = template ? template.subject : 'No Subject';
          htmlBody = renderTemplate(template ? template.htmlBody : '', variables);
          textBody = template && template.plainTextBody ? renderTemplate(template.plainTextBody, variables) : undefined;
        }

        await sendEmail({
          to: recipient.email,
          subject,
          html: htmlBody,
          text: textBody,
        });

        results.push({ id: recipient.id, status: 'sent', sentAt: new Date() });
      } catch (err) {
        results.push({ id: recipient.id, status: 'failed', error: err.message });
      }

      // Randomized delay between individual sends (not after the last one in the batch).
      if (i < recipients.length - 1) {
        const delay = EMAIL_DELAY_MIN_MS + Math.random() * (EMAIL_DELAY_MAX_MS - EMAIL_DELAY_MIN_MS);
        await sleep(delay);
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
