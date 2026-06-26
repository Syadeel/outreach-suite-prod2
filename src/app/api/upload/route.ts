import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bucket = (formData.get('bucket') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucket);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucket, { public: true });
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin';
    const filename = `${bucket}_${Date.now()}.${ext}`;
    const filepath = `${bucket}/${filename}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filepath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filepath);

    const publicUrl = urlData.publicUrl;

    return NextResponse.json({
      url: publicUrl,
      path: filepath,
      filename,
      bucket,
    });
  } catch (err: any) {
    console.error('Upload error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
