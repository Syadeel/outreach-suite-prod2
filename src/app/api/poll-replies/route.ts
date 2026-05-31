import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkGmailReplies } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check if database connection is configured
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase Admin is not configured. Please check your environment variables.' }, { status: 500 });
    }

    // 1. Fetch all active inboxes with Google OAuth credentials
    const { data: inboxes, error } = await supabaseAdmin
      .from('inboxes')
      .select('*')
      .eq('status', 'active')
      .not('oauth_refresh_token', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let processedCount = 0;
    const detectedReplies: any[] = [];

    for (const inbox of inboxes) {
      try {
        // Poll messages from Google Gmail API
        const replies = await checkGmailReplies(inbox.id, inbox.email);

        for (const reply of replies) {
          // Look up if this email belongs to a lead in our database
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('email', reply.fromEmail)
            .single();

          if (lead) {
            // A. Update Lead stage to 'replied'
            await supabaseAdmin
              .from('leads')
              .update({ stage: 'replied' })
              .eq('id', lead.id);

            // B. Pause any active campaigns for this lead (mark campaign lead as replied)
            await supabaseAdmin
              .from('campaign_leads')
              .update({ status: 'replied' })
              .eq('lead_id', lead.id)
              .eq('status', 'pending'); // only pause active pending ones

            // C. Log this incoming reply as a "sent_emails" entry for thread display
            // Check if this reply is already logged to prevent duplicates
            const { data: existingReply } = await supabaseAdmin
              .from('sent_emails')
              .select('id')
              .eq('message_id', reply.messageId)
              .single();

            if (!existingReply) {
              await supabaseAdmin.from('sent_emails').insert({
                campaign_id: null, // organic reply, or check thread matching later
                lead_id: lead.id,
                inbox_id: inbox.id,
                message_id: reply.messageId,
                subject: reply.subject,
                body: reply.snippet, // store snippet/body
                status: 'replied',
                sent_at: reply.receivedAt,
                replied_at: reply.receivedAt
              });

              processedCount++;
              detectedReplies.push({
                from: reply.fromEmail,
                subject: reply.subject,
                inbox: inbox.email
              });
            }
          }
        }
      } catch (inboxErr) {
        console.error(`Error polling inbox ${inbox.email}:`, inboxErr);
      }
    }

    return NextResponse.json({
      status: 'success',
      processedRepliesCount: processedCount,
      processed: detectedReplies
    });
  } catch (err: any) {
    console.error('Replies polling route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
