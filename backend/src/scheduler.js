const { prisma } = require('./prisma');
const { sendEmail, getIndividualDelay } = require('./email');
const { renderTemplate } = require('./templates-service');
const { updateSharePointEmailSent } = require('./sharepoint');
const crypto = require('crypto');

// In-memory set to track which campaigns are actively being sent
const activeCampaignSends = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main function to start the background scheduler loop.
 */
function startScheduler() {
  console.log('[Scheduler] Background campaign scheduler started.');
  
  // Run every 10 seconds
  setInterval(async () => {
    try {
      await pollAndProcessCampaigns();
    } catch (err) {
      console.error('[Scheduler] Error in scheduler tick:', err);
    }
  }, 10000);
}

/**
 * Scans the database for campaigns that need to be sent:
 * 1. Scheduled campaigns whose scheduled time is in the past.
 * 2. Unfinished campaigns in 'processing' state (e.g. after server restart).
 */
async function pollAndProcessCampaigns() {
  const now = new Date();
  
  const campaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        {
          status: 'scheduled',
          scheduledAt: { lte: now }
        },
        {
          status: 'processing',
          pendingCount: { gt: 0 }
        }
      ],
      id: { notIn: Array.from(activeCampaignSends) }
    },
    orderBy: { createdAt: 'asc' }
  });

  for (const campaign of campaigns) {
    if (activeCampaignSends.has(campaign.id)) continue;
    
    // Non-blocking trigger of campaign processing
    triggerCampaignProcessing(campaign.id).catch(err => {
      console.error(`[Scheduler] Error triggering processing for campaign ${campaign.id}:`, err);
    });
  }
}

/**
 * Non-blockingly triggers execution of a campaign.
 */
async function triggerCampaignProcessing(campaignId) {
  if (activeCampaignSends.has(campaignId)) return;
  
  activeCampaignSends.add(campaignId);
  console.log(`[Scheduler] Started processing campaign ${campaignId}`);
  
  try {
    await processCampaign(campaignId);
  } catch (err) {
    console.error(`[Scheduler] Error processing campaign ${campaignId}:`, err);
  } finally {
    activeCampaignSends.delete(campaignId);
    console.log(`[Scheduler] Finished processing campaign ${campaignId}`);
  }
}

/**
 * Runs the loop to send batches of emails for a campaign.
 */
async function processCampaign(campaignId) {
  // Ensure the campaign status is 'processing' in the database (e.g., if it was 'scheduled')
  const initialCampaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  });
  
  if (!initialCampaign) {
    console.warn(`[Scheduler] Campaign ${campaignId} not found in DB.`);
    return;
  }
  
  if (initialCampaign.status === 'scheduled') {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'processing' }
    });
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  while (true) {
    const batchSize = parseInt(process.env.BATCH_SIZE || '5', 10);
    // 1. Fetch next batch of pending recipients, then atomically claim them
    // (pending -> sending) so a concurrent/duplicate trigger for the same
    // campaign (e.g. an overlapping Azure orchestration run) can't select
    // and re-send the same rows.
    const candidates = await prisma.recipient.findMany({
      where: { campaignId, status: 'pending' },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (candidates.length === 0) {
      break;
    }

    const claim = await prisma.recipient.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: 'pending' },
      data: { status: 'sending' },
    });

    if (claim.count === 0) {
      break;
    }

    const recipients = await prisma.recipient.findMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: 'sending' },
      orderBy: { createdAt: 'asc' }
    });

    if (recipients.length === 0) {
      break;
    }

    // 2. Fetch fresh campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true }
    });

    if (!campaign || (!campaign.isAiGenerated && !campaign.template)) {
      console.error(`[Scheduler] Campaign or template not found for campaign ${campaignId}`);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'failed' }
      });
      break;
    }

    // 3. Process the batch of recipients
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const token = crypto
        .createHash('sha256')
        .update(recipient.email + 'desire-unsubscribe-salt')
        .digest('hex')
        .substring(0, 32);

      const unsubscribeLink = `${frontendUrl}/unsubscribe/${token}?email=${encodeURIComponent(recipient.email)}`;

      let renderedSubject = '';
      let renderedHtml = '';
      let renderedText = '';

      if (campaign.isAiGenerated) {
        // AI Draft Generation
        const { generateRecipientDraft } = require('./ai');

        if (recipient.aiSubject && recipient.aiBody) {
          renderedSubject = recipient.aiSubject;
          renderedHtml = recipient.aiBody;
        } else {
          // Construct rich contact data context including LinkedIn URL, Website, Company, Title, etc.
          const contactContext = (recipient.rawFields && typeof recipient.rawFields === 'object' && Object.keys(recipient.rawFields).length > 0)
            ? recipient.rawFields
            : {
                name: recipient.name,
                email: recipient.email,
                spItemId: recipient.spItemId,
              };

          try {
            console.log(`[Scheduler AI Draft] Generating personalized email for ${recipient.email}...`);
            const draft = await generateRecipientDraft({
              masterPrompt: campaign.aiPrompt,
              contactData: contactContext
            });
            renderedSubject = draft.subject;
            renderedHtml = draft.htmlBody;

            // Persist generated subject and HTML body on recipient record
            await prisma.recipient.update({
              where: { id: recipient.id },
              data: {
                aiSubject: renderedSubject,
                aiBody: renderedHtml
              }
            });
          } catch (aiErr) {
            console.error(`[Scheduler AI Draft Error] ${aiErr.message}`);
            renderedSubject = `Update for ${recipient.name}`;
            renderedHtml = `<p>Hello ${recipient.name},</p><p>We wanted to reach out regarding our latest updates.</p>`;
          }
        }

        // Append unsubscribe footer to AI generated body if not present
        if (!renderedHtml.includes('unsubscribe')) {
          renderedHtml += `<div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #888;"><p>If you wish to stop receiving these emails, you can <a href="${unsubscribeLink}" style="color: #666; text-decoration: underline;">unsubscribe here</a>.</p></div>`;
        }
        renderedText = renderedSubject;
      } else {
        // Standard Template Rendering
        const variables = { name: recipient.name, email: recipient.email, unsubscribeLink };
        const rendered = renderTemplate(
          {
            id: campaign.template.id,
            subject: campaign.template.subject,
            htmlBody: campaign.template.htmlBody,
            plainTextBody: campaign.template.plainTextBody
          },
          variables
        );
        renderedSubject = rendered.subject;
        renderedHtml = rendered.html;
        renderedText = rendered.text;
      }

      let attempts = 0;
      const maxAttempts = 3;
      let lastError = null;
      let success = false;

      while (attempts < maxAttempts) {
        try {
          await sendEmail({
            to: recipient.email,
            subject: renderedSubject,
            html: renderedHtml,
            text: renderedText
          });
          success = true;
          break;
        } catch (err) {
          attempts++;
          lastError = err;
          console.warn(`[Scheduler Retry] Attempt ${attempts} failed for ${recipient.email}: ${err.message}`);
          if (attempts < maxAttempts) await sleep(2000);
        }
      }

      if (success) {
        await prisma.recipient.update({
          where: { id: recipient.id },
          data: { status: 'sent', error: null, sentAt: new Date() }
        });

        // Trigger SharePoint write-back in background
        if (campaign.configId && recipient.spItemId) {
          updateSharePointEmailSent(campaign.configId, recipient.spItemId, new Date())
            .catch(err => console.error(`[Scheduler SharePoint Write-back Error] ${err.message}`));
        }
      } else {
        await prisma.recipient.update({
          where: { id: recipient.id },
          data: { status: 'failed', error: lastError?.message || 'All retry attempts failed' }
        });
      }

      // Update campaign counters in database
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          sentCount: success ? { increment: 1 } : undefined,
          failedCount: !success ? { increment: 1 } : undefined,
          pendingCount: { decrement: 1 }
        }
      });

      // Inject individual send delay if it is NOT the last recipient in this batch
      if (i < recipients.length - 1) {
        const delayMs = getIndividualDelay();
        console.log(`[Scheduler] Delaying for ${delayMs / 1000}s before sending next email...`);
        await sleep(delayMs);
      }
    }

    // Check if there are still pending items
    const checkCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (checkCampaign && checkCampaign.pendingCount > 0) {
      // Cooldown delay between batches
      const batchDelaySec = parseInt(process.env.BATCH_DELAY_SEC || '15', 10);
      const batchDelayMs = batchDelaySec * 1000;
      console.log(`[Scheduler] Batch complete. Cooling down for ${batchDelaySec}s before next batch of campaign ${campaignId}...`);
      await sleep(batchDelayMs);
    } else {
      break;
    }
  }

  // 4. Finalize campaign completion
  const checkCampaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  });

  if (checkCampaign && checkCampaign.pendingCount === 0 && checkCampaign.status === 'processing') {
    const finalStatus =
      checkCampaign.failedCount > 0 && checkCampaign.sentCount === 0 ? 'failed' : 'completed';
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: finalStatus }
    });
    console.log(`[Scheduler] Campaign ${campaignId} fully processed. Final status: ${finalStatus}`);
  }
}

module.exports = {
  startScheduler,
  triggerCampaignProcessing
};
