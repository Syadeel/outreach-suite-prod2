import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/smtp';

export async function POST(req: NextRequest) {
  try {
    const { leadId, inboxId, subject, body, parentMessageId } = await req.json();

    if (!leadId || !inboxId || !subject || !body) {
      return NextResponse.json({ error: 'leadId, inboxId, subject, and body are required' }, { status: 400 });
    }

    // 1. Fetch lead and inbox credentials
    const { data: lead } = await supabaseAdmin.from('leads').select('*').eq('id', leadId).single();
    const { data: inbox } = await supabaseAdmin.from('inboxes').select('*').eq('id', inboxId).single();

    if (!lead || !inbox) {
      return NextResponse.json({ error: 'Lead or Inbox configuration not found' }, { status: 404 });
    }

    // 2. Dispatch manual SMTP email
    const { messageId } = await sendEmail({
      host: inbox.smtp_host,
      port: inbox.smtp_port,
      user: inbox.smtp_user,
      pass: inbox.smtp_pass,
      from: `"${inbox.provider === 'zeptomail' ? 'The Capital Acquisition' : 'Acquisition Outbound'}" <${inbox.email}>`,
      to: lead.email,
      subject,
      html: `<div style="font-family: sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">${body.replace(/\n/g, '<br />')}</div>`,
      messageId: parentMessageId // For threading follow-up
    });

    // 3. Log into sent_emails table
    await supabaseAdmin.from('sent_emails').insert({
      campaign_id: null, // manual one-off response
      lead_id: lead.id,
      inbox_id: inbox.id,
      message_id: messageId,
      subject,
      body,
      status: 'sent',
      sent_at: new Date().toISOString()
    });

    // Update inbox sent counter
    await supabaseAdmin
      .from('inboxes')
      .update({
        sent_today: inbox.sent_today + 1,
        last_sent_at: new Date().toISOString()
      })
      .eq('id', inbox.id);

    return NextResponse.json({ status: 'success', messageId });
  } catch (err: any) {
    console.error('Error dispatching manual reply:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
