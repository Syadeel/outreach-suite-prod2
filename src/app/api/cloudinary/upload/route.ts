import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Configure Cloudinary at request time (env vars are available then)
    const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
    if (CLOUDINARY_URL) {
      // Parse manually to be safe
      const match = CLOUDINARY_URL.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
      if (match) {
        cloudinary.config({
          cloud_name: match[3],
          api_key: match[1],
          api_secret: match[2],
          secure: true
        });
      }
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const folder = (formData.get('folder') as string) || 'uploads';
    const resourceType = (formData.get('resource_type') as string) || 'auto';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer then to data URI
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'application/octet-stream';
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Upload to Cloudinary using SDK
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload(
        dataUri,
        {
          folder,
          resource_type: resourceType as any,
          public_id: `upload_${Date.now()}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    return NextResponse.json({
      secure_url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
    });
  } catch (err: any) {
    console.error('Upload error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
