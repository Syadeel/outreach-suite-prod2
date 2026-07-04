import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestSecurity } from '@/lib/auth'

export const maxDuration = 60

// Whitelist of fields that can be updated
const ALLOWED_UPDATE_FIELDS = [
  'name', 'is_default', 'brand_title', 'brand_logo_url', 'brand_color',
  'badge_text', 'hero_heading', 'hero_subheading', 'hero_body',
  'cta_text', 'cta_url', 'cta_description', 'calendar_embed_code',
  'calendar_heading', 'social_proof_heading', 'social_proof_logos',
  'why_matters_heading', 'why_matters_subheading', 'why_matters_body',
  'footer_text', 'footer_powered_by', 'custom_css'
];

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabaseAdmin
      .from('landing_page_templates')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[Templates] GET error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}

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
    safeBody.updated_at = new Date().toISOString();

    if (Object.keys(safeBody).length <= 1) { // only updated_at
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // If setting as default, unset others first
    if (safeBody.is_default) {
      await supabaseAdmin
        .from('landing_page_templates')
        .update({ is_default: false })
        .neq('id', params.id)
    }

    const { data, error } = await supabaseAdmin
      .from('landing_page_templates')
      .update(safeBody)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[Templates] PATCH error:', err.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // CSRF protection
  if (!verifyRequestSecurity(_request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('landing_page_templates')
      .delete()
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Templates] DELETE error:', err.message);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
