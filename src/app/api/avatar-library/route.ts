// /api/avatar-library - List and create avatar library entries
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('avatar_library')
      .select('id, name, voice_ref_url, face_video_url, is_active, created_at')
      .eq('user_id', 'default_user')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to camelCase for frontend
    const mapped = (data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      voiceRefUrl: a.voice_ref_url,
      faceVideoUrl: a.face_video_url,
      isActive: a.is_active,
      createdAt: a.created_at,
    }));

    return NextResponse.json(mapped);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list avatars' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase()
    const body = await req.json();
    const { name, voiceRefUrl, faceVideoUrl, setActive } = body;

    if (!voiceRefUrl || !faceVideoUrl) {
      return NextResponse.json({ error: 'voiceRefUrl and faceVideoUrl are required' }, { status: 400 });
    }

    // If setting as active, deactivate all others first
    if (setActive) {
      await supabase
        .from('avatar_library')
        .update({ is_active: false })
        .eq('user_id', 'default_user');
    }

    const { data: newAvatar, error: insertError } = await supabase
      .from('avatar_library')
      .insert({
        user_id: 'default_user',
        name: name || 'Untitled Avatar',
        voice_ref_url: voiceRefUrl,
        face_video_url: faceVideoUrl,
        is_active: setActive || false,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: newAvatar.id,
      name: newAvatar.name,
      voiceRefUrl: newAvatar.voice_ref_url,
      faceVideoUrl: newAvatar.face_video_url,
      isActive: newAvatar.is_active,
      createdAt: newAvatar.created_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create avatar' }, { status: 500 });
  }
}
