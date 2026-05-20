import { NextResponse } from 'next/server';
import { getUploadSignature } from '@/lib/cloudinary';

export async function GET() {
  try {
    const signatureData = getUploadSignature();
    return NextResponse.json(signatureData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
