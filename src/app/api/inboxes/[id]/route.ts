import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestSecurity } from '@/lib/auth'

export const maxDuration = 300

// Whitelist of fields that can be updated
const ALLOWED_UPDATE_FIELDS = [
  'email', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
  'provider', 'status', 'daily_limit', 'sent_today'
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // CSRF protection
  if (!verifyRequestSecurity(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
  }

  try {
    const body = await request.json()
    
    // Only allow whitelisted fields
    const safeBody: Record<string, any> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_UPDATE_FIELDS.includes(key)) {
        safeBody[key] = body[key];
      }
    }
    
    if (Object.keys(safeBody).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }
    
    const { data, error } = await supabaseAdmin
      .from('inboxes')
      .update(safeBody)
      .eq('id', params.id)
      .select()
    
    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Inbox not found' }, { status: 404 })
    }
    
    return NextResponse.json(data[0])
  } catch (err: any) {
    console.error('[Inboxes] PATCH error:', err.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // CSRF protection
  if (!verifyRequestSecurity(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('inboxes')
      .delete()
      .eq('id', params.id)
    
    if (error) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    
    return NextResponse.json({ message: 'Inbox deleted successfully' })
  } catch (err: any) {
    console.error('[Inboxes] DELETE error:', err.message);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
