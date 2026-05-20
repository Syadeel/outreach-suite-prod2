import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/gmail';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const email = searchParams.get('state'); // The state param carries the email

    if (!code || !email) {
      return NextResponse.json({ error: 'Code and state (email) parameters are required' }, { status: 400 });
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Update or insert the tokens in the database for reply monitoring
    const { error } = await supabaseAdmin
      .from('inboxes')
      .update({
        oauth_refresh_token: tokens.refresh_token || undefined, // refresh token is only sent on first auth
        oauth_access_token: tokens.access_token,
        oauth_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      })
      .eq('email', email);

    if (error) {
      console.error('Error saving OAuth tokens:', error);
      return NextResponse.json({ error: 'Failed to update credentials in database' }, { status: 500 });
    }

    // Redirect user back to the main app dashboard settings
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}?auth=success`);
  } catch (err: any) {
    console.error('OAuth Callback Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
