import { google } from 'googleapis';
import { supabaseAdmin } from './supabaseAdmin';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;

export function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/**
 * Generates the Google OAuth authorization URL.
 */
export function getAuthUrl(email: string) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.metadata',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ],
    prompt: 'consent',
    state: email, // pass email back in callback to identify
  });
}

/**
 * Gets a fresh access token, refreshing it if expired.
 */
export async function getFreshToken(inboxId: string): Promise<string> {
  const { data: inbox, error } = await supabaseAdmin
    .from('inboxes')
    .select('*')
    .eq('id', inboxId)
    .single();

  if (error || !inbox) {
    throw new Error('Inbox not found');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: inbox.oauth_access_token,
    refresh_token: inbox.oauth_refresh_token,
    expiry_date: inbox.oauth_token_expires_at ? new Date(inbox.oauth_token_expires_at).getTime() : 0,
  });

  // Check if token is expired or expiring in 5 minutes
  const isExpired = !inbox.oauth_token_expires_at || 
    (new Date(inbox.oauth_token_expires_at).getTime() - Date.now() < 300000);

  if (isExpired && inbox.oauth_refresh_token) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    // Save new token back to Database
    await supabaseAdmin
      .from('inboxes')
      .update({
        oauth_access_token: credentials.access_token,
        oauth_token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
      })
      .eq('id', inboxId);

    return credentials.access_token!;
  }

  return inbox.oauth_access_token!;
}

/**
 * Polls a Gmail inbox for new replies since the last check.
 * This runs inside our background worker / n8n workflow.
 */
export async function checkGmailReplies(inboxId: string, userEmail: string): Promise<Array<{
  messageId: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  threadId: string;
}>> {
  const accessToken = await getFreshToken(inboxId);
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  // Search query: looking for messages received in the last 24 hours that are NOT sent by userEmail
  // e.g. "to:userEmail -from:userEmail"
  const q = `to:${userEmail} -from:${userEmail}`;
  const response = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: 20
  });

  const messages = response.data.messages || [];
  const replies: any[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date', 'Message-ID', 'In-Reply-To']
    });

    const headers = detail.data.payload?.headers || [];
    const fromHeader = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const dateStr = headers.find(h => h.name === 'Date')?.value || '';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';
    const inReplyTo = headers.find(h => h.name === 'In-Reply-To')?.value || '';

    // Extract email from "Name <email@domain.com>"
    const emailRegex = /<([^>]+)>/;
    const match = fromHeader.match(emailRegex);
    const fromEmail = match ? match[1].toLowerCase().trim() : fromHeader.toLowerCase().trim();

    replies.push({
      messageId,
      inReplyTo,
      fromEmail,
      subject,
      snippet: detail.data.snippet || '',
      receivedAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      threadId: detail.data.threadId || ''
    });
  }

  return replies;
}
