import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || 'default_user'

    const { data, error } = await supabaseAdmin
      .from('avatar_config')
      .select('voice_ref_url, face_video_url')
      .eq('user_id', userId)
      .single()

    if (error) {
      // No row yet — return nulls, not an error
      if (error.code === 'PGRST116') {
        return NextResponse.json({ voiceRefUrl: null, faceVideoUrl: null })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      voiceRefUrl: data?.voice_ref_url || null,
      faceVideoUrl: data?.face_video_url || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { voiceRefUrl, faceVideoUrl, userId = 'default_user' } = await req.json()

    const { error } = await supabaseAdmin
      .from('avatar_config')
      .upsert(
        {
          user_id: userId,
          voice_ref_url: voiceRefUrl || null,
          face_video_url: faceVideoUrl || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
