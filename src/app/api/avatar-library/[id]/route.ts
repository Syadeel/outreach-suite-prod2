// /api/avatar-library/[id] - Update and delete avatar library entries
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const id = params.id;
    const body = await req.json();
    const { name, isActive } = body;

    // If setting active, deactivate all others first
    if (isActive === true) {
      const { error: deactivateErr } = await supabase
        .from('avatar_library')
        .update({ is_active: false })
        .eq('user_id', 'default_user');

      if (deactivateErr) {
        return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
      }
    }

    // Build update payload
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await supabase
      .from('avatar_library')
      .update(updates)
      .eq('id', id)
      .eq('user_id', 'default_user')
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      voiceRefUrl: data.voice_ref_url,
      faceVideoUrl: data.face_video_url,
      isActive: data.is_active,
      createdAt: data.created_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update avatar' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const id = params.id;
    let force = false;
    try {
      const body = await req.json();
      force = body.force || false;
    } catch { /* no body provided */ }

    // Check if avatar exists and get status
    const { data: avatar, error: selectErr } = await supabase
      .from('avatar_library')
      .select('is_active')
      .eq('id', id)
      .eq('user_id', 'default_user')
      .single();

    if (selectErr || !avatar) {
      return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
    }

    if (!force) {
      // Check if it's the only avatar
      const { count } = await supabase
        .from('avatar_library')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', 'default_user');

      if (count === 1) {
        return NextResponse.json(
          { error: 'Cannot delete the only avatar. Create another avatar first.' },
          { status: 400 }
        );
      }

      if (avatar.is_active) {
        return NextResponse.json(
          { error: 'Cannot delete active avatar. Set another avatar as active first or use force=true.' },
          { status: 400 }
        );
      }
    }

    const { error: deleteErr } = await supabase
      .from('avatar_library')
      .delete()
      .eq('id', id)
      .eq('user_id', 'default_user');

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Avatar deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete avatar' }, { status: 500 });
  }
}
