import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestSecurity } from '@/lib/auth'

export const maxDuration = 300

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('inboxes')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch inboxes' }, { status: 500 })
    }
    
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[Inboxes] GET error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch inboxes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // CSRF protection
  if (!verifyRequestSecurity(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
  }

  try {
    const body = await request.json()
    
    const { data, error } = await supabaseAdmin
      .from('inboxes')
      .insert(body)
      .select()
    
    if (error) {
      return NextResponse.json({ error: 'Failed to create inbox' }, { status: 500 })
    }
    
    return NextResponse.json(data[0])
  } catch (err: any) {
    console.error('[Inboxes] POST error:', err.message);
    return NextResponse.json({ error: 'Failed to create inbox' }, { status: 500 })
  }
}
