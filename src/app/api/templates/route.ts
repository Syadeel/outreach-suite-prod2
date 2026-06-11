import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('landing_page_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // If setting as default, unset other defaults first
    if (body.is_default) {
      await supabaseAdmin
        .from('landing_page_templates')
        .update({ is_default: false })
        .eq('is_default', true)
    }

    const { data, error } = await supabaseAdmin
      .from('landing_page_templates')
      .insert({
        name: body.name || 'New Template',
        is_default: body.is_default || false,
        brand_title: body.brand_title || 'Capital Acquisition',
        brand_logo_url: body.brand_logo_url || null,
        brand_color: body.brand_color || '#4F46E5',
        badge_text: body.badge_text || 'Personalized Video Walkthrough',
        hero_heading: body.hero_heading || 'Hey {{first_name}} 👋',
        hero_subheading: body.hero_subheading || 'Tailored for {{company}}',
        hero_body: body.hero_body || 'I put together this personalized video for you and the team at {{company}}.',
        cta_text: body.cta_text || 'Book a 15-Min Call',
        cta_url: body.cta_url || null,
        cta_description: body.cta_description || 'If our acquisition solutions make sense for you, schedule a quick discovery call below:',
        calendar_embed_code: body.calendar_embed_code || null,
        calendar_heading: body.calendar_heading || 'Schedule a time to chat',
        social_proof_heading: body.social_proof_heading || 'Trusted by growth teams everywhere',
        social_proof_logos: body.social_proof_logos || ['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX'],
        why_matters_heading: body.why_matters_heading || "This isn't a generic pitch, {{first_name}}.",
        why_matters_subheading: body.why_matters_subheading || "It was built specifically for what you're building at {{company}}.",
        why_matters_body: body.why_matters_body || 'We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.',
        footer_text: body.footer_text || '© {{year}} {{brand_title}}. All rights reserved.',
        footer_powered_by: body.footer_powered_by || 'Powered by {{brand_title}}',
        custom_css: body.custom_css || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
