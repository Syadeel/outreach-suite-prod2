import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/smtp';
import { getEmailGifUrl, getPersonalizedThumbnailUrl } from '@/lib/cloudinary';

export async function POST(req: NextRequest) {
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
    const selectedInbox = activeInboxes.find(ib => ib.sent_today < ib.daily_limit);
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

    // 4. Inject VideoSpark personalized landing page + GIF if specified in campaign steps
    // Step format can store videoId inside config: e.g. currentStep.videoId
    const videoId = currentStep.videoId;
    if (videoId) {
      const { data: videoRecord } = await supabaseAdmin
        .from('video_recordings')
        .select('*')
        .eq('id', videoId)
        .single();

      if (videoRecord) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const landingPageUrl = `${appUrl}/landing/${videoRecord.id}?leadId=${lead.id}`;
        
        // Generate personalized thumbnail & GIF URLs
        const gifUrl = getEmailGifUrl(videoRecord.video_url);
        const thumbUrl = getPersonalizedThumbnailUrl(videoRecord.video_url, lead.first_name || '');

        // Create the HTML block for GIF embedding with play button overlay feel
        const videoHtmlBlock = `
          <div style="margin: 20px 0; font-family: sans-serif;">
            <a href="${landingPageUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
              <img src="${gifUrl}" alt="Personalized Video for you" width="320" style="border-radius: 8px; border: 1px solid #e2e8f0; display: block;" />
              <div style="margin-top: 8px; color: #4F46E5; font-size: 14px; font-weight: bold; text-align: center;">
                ▶ Click to watch personalized video (3:00)
              </div>
            </a>
          </div>
        `;
        
        // Append or inject video html block
        emailBody = emailBody + videoHtmlBlock;
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
