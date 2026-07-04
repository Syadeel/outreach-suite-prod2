import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/smtp';
import { getEmailGifUrl, getPersonalizedEmailGifUrl, getPersonalizedThumbnailUrl } from '@/lib/cloudinary';
import { verifyRequestSecurity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // CSRF protection
  if (!verifyRequestSecurity(req)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }
  
  try {
    const body = await req.json();
    const { campaignLeadId } = body;

    if (!campaignLeadId) {
      return NextResponse.json({ error: 'campaignLeadId is required' }, { status: 400 });
    }

    // 1. Fetch Campaign Lead details
    const { data: campaignLead, error: clError } = await supabaseAdmin
      .from('campaign_leads')
      .select(`
        *,
        campaign:campaigns(*),
        lead:leads(*)
      `)
      .eq('id', campaignLeadId)
      .single();

    if (clError || !campaignLead) {
      return NextResponse.json({ error: 'Campaign lead not found' }, { status: 404 });
    }

    const { campaign, lead } = campaignLead;

    // Bounce & Invalid Domain Protection: skip sending if lead is already bounced or marked invalid
    const enrichmentStatus = lead.custom_fields?.enrichment_status;
    const outreachStatus = lead.custom_fields?.outreach_status || 'good';
    if (lead.stage === 'bounce' || enrichmentStatus === 'invalid' || enrichmentStatus === 'Bad' || outreachStatus.startsWith('invalid')) {
      await supabaseAdmin
        .from('campaign_leads')
        .update({ status: 'bounce', next_send_time: null })
        .eq('id', campaignLeadId);
      
      return NextResponse.json({
        status: 'skipped',
        message: `Skipped sending because lead is flagged as invalid: stage=${lead.stage}, enrichmentStatus=${enrichmentStatus}, status=${outreachStatus}`
      });
    }

    // Verify campaign is active and step index is valid
    const steps = campaign.steps as any[];
    const currentStep = steps[campaignLead.current_step_index];

    if (!currentStep) {
      // Sequence finished
      await supabaseAdmin
        .from('campaign_leads')
        .update({ status: 'completed' })
        .eq('id', campaignLeadId);
      return NextResponse.json({ status: 'completed', message: 'No more steps in sequence' });
    }

    // 2. Select an active inbox (Rotator logic based on daily limit & sent today)
    const { data: activeInboxes, error: inboxError } = await supabaseAdmin
      .from('inboxes')
      .select('*')
      .eq('status', 'active')
      .order('sent_today', { ascending: true }); // Round-robin rotation: select the one with least sent today

    if (inboxError || !activeInboxes || activeInboxes.length === 0) {
      return NextResponse.json({ error: 'No active inboxes available' }, { status: 500 });
    }

    // Pick first available inbox that hasn't hit its daily limit
    const selectedInbox = activeInboxes.find((ib: any) => ib.sent_today < ib.daily_limit);
    if (!selectedInbox) {
      return NextResponse.json({ error: 'All active inboxes have hit their daily sending limit' }, { status: 503 });
    }

    // 3. Compile email subject & body (Merge tags)
    let emailSubject = currentStep.subject || '';
    let emailBody = currentStep.body || '';

    const replaceTags = (text: string) => {
      return text
        .replace(/\{\{first_name\}\}/g, lead.first_name || 'there')
        .replace(/\{\{last_name\}\}/g, lead.last_name || '')
        .replace(/\{\{company\}\}/g, lead.company || 'your company')
        .replace(/\{\{website\}\}/g, lead.website || '');
    };

    emailSubject = replaceTags(emailSubject);
    emailBody = replaceTags(emailBody);

    // 4. Two-phase VK video generation (async, survives Next.js 30s timeout)
    let videoId = currentStep.videoId;

    if (!videoId && currentStep.useVoiceKit) {
      const { startVkGeneration, checkVkJob, collectVkResult } = await import('@/lib/voicekit-connector');
      const { getVkJob, upsertVkJob } = await import('@/lib/vk-job-store');

      const stepIdx = campaignLead.current_step_index;
      const leadId = lead.id;
      const existingJob = getVkJob(leadId, stepIdx);

      if (existingJob && existingJob.phase === 'generating') {
        // ── Phase 2: Check existing job ──
        const status = await checkVkJob(existingJob.jobId);

        if (status.status === 'done' && status.localPath) {
          // Video ready — upload to Cloudinary + save to Supabase
          try {
            const newVideoId = await collectVkResult(
              status.localPath,
              status.firstName || lead.first_name || '',
              status.company || lead.company || '',
              leadId
            );
            videoId = newVideoId;

            // Cache videoId on the step so we don't regenerate
            steps[stepIdx].videoId = videoId;
            await supabaseAdmin.from('campaigns').update({ steps }).eq('id', campaign.id);

            upsertVkJob(leadId, stepIdx, { phase: 'done', videoId });

            console.log(`VK done for lead ${leadId}: video ${newVideoId}`);
          } catch (collectErr: any) {
            console.error('VK collect failed:', collectErr);
            upsertVkJob(leadId, stepIdx, { phase: 'failed', error: collectErr.message });
            // Fall through — email will send without video
          }
        } else if (status.status === 'error' || status.status === 'unknown') {
          // Job failed — retry or give up
          const retryCount = (existingJob.retryCount || 0) + 1;
          if (retryCount <= 3) {
            // Resubmit
            console.log(`VK retry ${retryCount}/3 for lead ${leadId}...`);
            const { jobId: newJobId } = await startVkGeneration({
              firstName: lead.first_name || '',
              company: lead.company || '',
              leadId,
              voiceSample: lead.voice_sample || '',
              script: currentStep.vk_script || '',
            });
            upsertVkJob(leadId, stepIdx, {
              jobId: newJobId,
              phase: 'generating',
              retryCount,
              error: undefined,
            });
            // Reschedule
            const retryTime = new Date(Date.now() + 10 * 60 * 1000);
            await supabaseAdmin
              .from('campaign_leads')
              .update({ next_send_time: retryTime.toISOString() })
              .eq('id', campaignLeadId);

            return NextResponse.json({
              status: 'vk_retry',
              message: `VK retry ${retryCount}/3 scheduled for ${retryTime.toISOString()}`,
            });
          } else {
            // Max retries exceeded — send without video
            console.warn(`VK failed after 3 retries for lead ${leadId}: ${status.error}`);
            upsertVkJob(leadId, stepIdx, { phase: 'failed', error: status.error || 'Max retries exceeded' });
          }
        } else {
          // Still running — reschedule check in 10 minutes
          const checkTime = new Date(Date.now() + 10 * 60 * 1000);
          await supabaseAdmin
            .from('campaign_leads')
            .update({ next_send_time: checkTime.toISOString() })
            .eq('id', campaignLeadId);

          return NextResponse.json({
            status: 'vk_pending',
            message: `VK still running, recheck at ${checkTime.toISOString()}`,
          });
        }
      } else if (existingJob && existingJob.phase === 'failed') {
        // Already failed after retries — skip VK, send without video
        console.warn(`VK previously failed for lead ${leadId}, sending without video`);
      } else {
        // ── Phase 1: Start new VK generation ──
        const vkScript = currentStep.vk_script ||
          `Hey ${lead.first_name || ''}, check out ${lead.company || 'our platform'}!`;

        try {
          const { jobId } = await startVkGeneration({
            firstName: lead.first_name || '',
            company: lead.company || '',
            leadId,
            voiceSample: lead.voice_sample || '',
            script: vkScript,
          });

          // Save job state and reschedule for 10 minutes later
          upsertVkJob(leadId, stepIdx, {
            jobId,
            phase: 'generating',
            retryCount: 0,
          });

          const checkTime = new Date(Date.now() + 10 * 60 * 1000);
          await supabaseAdmin
            .from('campaign_leads')
            .update({ next_send_time: checkTime.toISOString() })
            .eq('id', campaignLeadId);

          console.log(`VK started for lead ${leadId}: job=${jobId}, recheck at ${checkTime.toISOString()}`);
          return NextResponse.json({
            status: 'vk_started',
            message: `VK generation started for ${lead.first_name || ''} @ ${lead.company || ''}`,
          });
        } catch (vkErr: any) {
          console.error('VK start failed (sending without video):', vkErr);
          // Failed to start — send email without video
        }
      }
    }

    // 5. Inject VideoSpark personalized landing page + GIF if video is available
    // Step format can store videoId inside config: e.g. currentStep.videoId
    if (videoId) {
      const { data: videoRecord } = await supabaseAdmin
        .from('video_recordings')
        .select('*')
        .eq('id', videoId)
        .single();

      if (videoRecord) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        let landingPageUrl = `${appUrl}/landing/${videoRecord.id}?leadId=${lead.id}`;
        if (currentStep.lpTemplateId) {
          landingPageUrl += `&lpTemplateId=${currentStep.lpTemplateId}`;
        }
        
        // Generate GIF — direct Cloudinary URL (no redirect chain, works in Gmail)
        const gifUrl = videoRecord.video_url
          .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
          .replace(/\.[^/.]+$/, '.gif');
        const thumbUrl = getPersonalizedThumbnailUrl(videoRecord.video_url, lead.first_name || '');

        // Create the HTML block — Sendr.ai style: GIF preview with gradient overlay for Gmail
        const videoHtmlBlock = `
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="margin:24px 0;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                  <tr>
                    <td style="border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
                      <a href="${landingPageUrl}" target="_blank" style="text-decoration:none;display:block;">
                        <img src="${gifUrl}" alt="Personalized video for ${lead.first_name || 'you'}" width="320" style="display:block;border:0;outline:none;max-width:100%;" />
                        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background:linear-gradient(180deg,transparent,rgba(0,0,0,0.8));">
                          <tr>
                            <td align="center" style="padding:12px 16px;">
                              <div style="font-size:28px;line-height:1.2;">▶</div>
                              <div style="font-size:14px;font-weight:700;color:#ffffff;font-family:Helvetica,Arial,sans-serif;">Watch personalized video →</div>
                              <div style="font-size:12px;color:rgba(255,255,255,0.7);font-family:Helvetica,Arial,sans-serif;margin-top:2px;">A walkthrough for ${lead.first_name || 'you'} @ ${lead.company || 'your company'}</div>
                            </td>
                          </tr>
                        </table>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`;
        
        // Append or inject video html block
        if (emailBody.includes('{{video_gif}}')) {
          emailBody = emailBody.replace('{{video_gif}}', videoHtmlBlock);
        } else {
          emailBody = emailBody + videoHtmlBlock;
        }
      }
    }

    // 5. Create Sent Email Analytics record to get ID for open/click tracking
    const { data: sentEmailRecord, error: insertError } = await supabaseAdmin
      .from('sent_emails')
      .insert({
        campaign_id: campaign.id,
        lead_id: lead.id,
        inbox_id: selectedInbox.id,
        subject: emailSubject,
        body: emailBody, // placeholder for now, will update with tracking pixel
        status: 'sending'
      })
      .select('id')
      .single();

    if (insertError || !sentEmailRecord) {
      return NextResponse.json({ error: 'Failed to create analytics track record' }, { status: 500 });
    }

    const emailId = sentEmailRecord.id;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // 6. Inject Open Tracking Pixel
    const trackingPixelHtml = `<img src="${appUrl}/api/tracking/open/${emailId}" width="1" height="1" style="display:none;" />`;
    emailBody = emailBody + trackingPixelHtml;

    // 7. Inject Link Click Tracking (Rewrites all HTML links in body)
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi;
    emailBody = emailBody.replace(linkRegex, (match: string, url: string, rest: string) => {
      // Don't track tracking links or relative landing links directly
      if (url.includes('/api/tracking/') || url.startsWith('#')) return match;
      const trackedUrl = `${appUrl}/api/tracking/click?emailId=${emailId}&url=${encodeURIComponent(url)}`;
      return `<a href="${trackedUrl}"${rest}>`;
    });

    // Save final compiled body with tracking pixels to DB
    await supabaseAdmin
      .from('sent_emails')
      .update({ body: emailBody })
      .eq('id', emailId);

    // 8. Find thread details if it's a follow-up
    let parentMessageId: string | undefined;
    if (campaignLead.current_step_index > 0) {
      const { data: lastSent } = await supabaseAdmin
        .from('sent_emails')
        .select('message_id')
        .eq('campaign_id', campaign.id)
        .eq('lead_id', lead.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();
      
      if (lastSent) {
        parentMessageId = lastSent.message_id || undefined;
      }
    }

    // 9. Dispatch actual email via SMTP (ZeptoMail / SMTP2GO)
    const { messageId } = await sendEmail({
      host: selectedInbox.smtp_host,
      port: selectedInbox.smtp_port,
      user: selectedInbox.smtp_user,
      pass: selectedInbox.smtp_pass,
      from: `"${selectedInbox.provider === 'zeptomail' ? 'The Capital Acquisition' : 'Acquisition Outbound'}" <${selectedInbox.email}>`,
      to: lead.email,
      subject: emailSubject,
      html: emailBody,
      messageId: parentMessageId
    });

    // 10. Update databases (inbox metrics, sent email, campaign lead progression)
    // Update Inbox count
    await supabaseAdmin
      .from('inboxes')
      .update({
        sent_today: selectedInbox.sent_today + 1,
        last_sent_at: new Date().toISOString()
      })
      .eq('id', selectedInbox.id);

    // Update Sent Email status with message ID
    await supabaseAdmin
      .from('sent_emails')
      .update({ status: 'sent', message_id: messageId })
      .eq('id', emailId);

    // Increment step counter or mark campaign lead as completed
    const nextStepIndex = campaignLead.current_step_index + 1;
    const hasMoreSteps = nextStepIndex < steps.length;

    const updateData: any = {
      current_step_index: nextStepIndex,
      last_sent_at: new Date().toISOString(),
      status: hasMoreSteps ? 'pending' : 'completed',
    };

    if (hasMoreSteps) {
      // Calculate next send time based on delay parameter (e.g. delay_hours: 48)
      const delayHours = steps[nextStepIndex].delay_hours || 24;
      const sendTime = new Date();
      sendTime.setHours(sendTime.getHours() + delayHours);

      // Business hours adjustment
      const adjustToBusinessHours = (d: Date) => {
        const day = d.getDay();
        let adjusted = false;

        // Weekend check
        if (day === 0) { // Sunday
          d.setDate(d.getDate() + 1);
          d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
          adjusted = true;
        } else if (day === 6) { // Saturday
          d.setDate(d.getDate() + 2);
          d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
          adjusted = true;
        }

        // Business hours check (9:00 AM - 5:00 PM)
        const currentHour = d.getHours();
        if (currentHour < 9) {
          d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
          adjusted = true;
        } else if (currentHour >= 17) {
          d.setDate(d.getDate() + 1);
          d.setHours(9, Math.floor(Math.random() * 30), 0, 0);
          adjusted = true;
          
          const newDay = d.getDay();
          if (newDay === 0) d.setDate(d.getDate() + 1);
          else if (newDay === 6) d.setDate(d.getDate() + 2);
        }
        return adjusted;
      };

      while (adjustToBusinessHours(sendTime)) {}
      updateData.next_send_time = sendTime.toISOString();
    } else {
      updateData.next_send_time = null;
    }

    await supabaseAdmin
      .from('campaign_leads')
      .update(updateData)
      .eq('id', campaignLeadId);

    // Update lead CRM stage to contacted
    if (lead.stage === 'new') {
      await supabaseAdmin
        .from('leads')
        .update({ stage: 'contacted' })
        .eq('id', lead.id);
    }

    return NextResponse.json({ status: 'success', sentEmailId: emailId, messageId });
  } catch (err: any) {
    console.error('Email send endpoint error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
