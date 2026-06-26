import { NextRequest, NextResponse } from 'next/server';
import { getUploadSignature } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get('folder') || 'uploads';
    
    // Debug: log what env vars are available
    console.log('CLOUDINARY_URL:', process.env.CLOUDINARY_URL ? 'SET' : 'NOT SET');
    console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
    console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');
    console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET');
    
    const signatureData = getUploadSignature(folder);
    return NextResponse.json(signatureData);
  } catch (err: any) {
    console.error('Signature error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
