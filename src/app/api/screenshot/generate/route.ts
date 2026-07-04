/**
 * Screenshot Generate API — Generates website screenshot and stores in Cloudinary
 *
 * POST /api/screenshot/generate
 *   { url: string }
 *
 * Returns:
 *   { screenshotUrl: string }
 */

export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    // SSRF protection: validate URL and block private IPs
    try {
      const parsed = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Only HTTP/HTTPS URLs allowed' }, { status: 400 });
      }
      const hostname = parsed.hostname;
      // Block private/internal IPs
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      ) {
        return NextResponse.json({ error: 'Internal/private URLs are not allowed' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log(`[Screenshot] Generating screenshot for: ${normalizedUrl}`);

    // Try microlink API first
    try {
      const r = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(normalizedUrl)}&screenshot=true&meta=false&fullPage=true&timeout=20000`,
        { signal: AbortSignal.timeout(25000) }
      );
      const j = await r.json();

      if (j?.data?.screenshot?.url) {
        // Download the screenshot
        const imgResponse = await fetch(j.data.screenshot.url, { signal: AbortSignal.timeout(30000) });
        if (!imgResponse.ok) throw new Error('Failed to download screenshot');

        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

        // Upload to Cloudinary
        const timestamp = Math.round(Date.now() / 1000);
        const folder = 'website_screenshots';
        const publicId = `screenshot_${timestamp}_${normalizedUrl.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}`;

        const uploadResult = await new Promise<any>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder,
              public_id: publicId,
              resource_type: 'image',
              format: 'png',
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(imgBuffer);
        });

        const screenshotUrl = uploadResult.secure_url;
        console.log(`[Screenshot] Generated and stored: ${screenshotUrl} (${Date.now() - startTime}ms)`);

        return NextResponse.json({ screenshotUrl });
      }
    } catch (microlinkError) {
      console.log(`[Screenshot] Microlink failed: ${microlinkError}`);
    }

    // Fallback: try thum.io
    try {
      const thumUrl = `https://image.thum.io/get/width/1280/crop/800/fullpage/${normalizedUrl}`;
      const imgResponse = await fetch(thumUrl, { signal: AbortSignal.timeout(20000) });

      if (imgResponse.ok) {
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

        // Upload to Cloudinary
        const timestamp = Math.round(Date.now() / 1000);
        const folder = 'website_screenshots';
        const publicId = `screenshot_${timestamp}_${normalizedUrl.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}`;

        const uploadResult = await new Promise<any>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder,
              public_id: publicId,
              resource_type: 'image',
              format: 'png',
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(imgBuffer);
        });

        const screenshotUrl = uploadResult.secure_url;
        console.log(`[Screenshot] Generated via thum.io: ${screenshotUrl} (${Date.now() - startTime}ms)`);

        return NextResponse.json({ screenshotUrl });
      }
    } catch (thumError) {
      console.log(`[Screenshot] thum.io failed: ${thumError}`);
    }

    // All methods failed
    return NextResponse.json({ error: 'Failed to generate screenshot', screenshotUrl: null });

  } catch (err: any) {
    console.error('[Screenshot] Error:', err.message || err);
    return NextResponse.json({ error: 'Screenshot generation failed' }, { status: 500 });
  }
}
