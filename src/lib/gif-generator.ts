/**
 * gif-generator.ts
 *
 * Generates personalized GIF URLs using Cloudinary's overlay API.
 * Composites the website screenshot as background with the video as a small circle overlay.
 *
 * Zero compute — just constructs a Cloudinary URL that renders on-the-fly.
 */

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Generate a personalized GIF URL: website screenshot background + video circle overlay.
 * Returns null if inputs are invalid.
 */
export function generatePersonalizedGifUrl(options: {
  videoUrl: string;
  website?: string | null;
}): string | null {
  const { videoUrl, website } = options;

  if (!videoUrl) return null;

  // Extract Cloudinary public ID from video URL
  // Pattern: https://res.cloudinary.com/{cloud}/video/upload/{version?}/{path}.{ext}
  const match = videoUrl.match(
    /res\.cloudinary\.com\/([^/]+)\/video\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i
  );
  if (!match) return null;

  const cloudName = match[1];
  const videoPublicId = match[2];
  const videoPublicIdColons = videoPublicId.replace(/\//g, ':');

  // If no website, just make a simple GIF from the video
  if (!website || website === '{{website}}') {
    return videoUrl
      .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
      .replace(/\.[^/.]+$/, '.gif');
  }

  // Normalize website to extract domain
  const normalizedWebsite = website
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .toLowerCase();
  const domain = normalizedWebsite.split('/')[0];
  const screenshotName = `screenshot_${domain.replace(/[^a-z0-9_-]/g, '_')}`;
  const screenshotPublicId = `screenshots/${screenshotName}`;
  const screenshotColons = screenshotPublicId.replace(/\//g, ':');

  // Construct Cloudinary composite URL:
  // Layer 1: website screenshot (w_400, h_250, cropped)
  // Layer 2: video circle overlay (w_95, h_95, rounded, bottom-left)
  // Output: GIF, 3 seconds, loop
  const gifUrl =
    `https://res.cloudinary.com/${cloudName}/video/upload/` +
    `l_${screenshotColons},w_400,h_250,c_fill/fl_layer_apply/` +
    `l_video:${videoPublicIdColons},w_95,h_95,c_fill,r_max/fl_layer_apply,g_south_west,x_15,y_15/` +
    `f_gif,du_3,e_loop/${videoPublicId}.gif`;

  return gifUrl;
}

/**
 * Ensure the website screenshot exists in Cloudinary.
 * Fetches and uploads via Microlink if not already cached.
 */
export async function ensureWebsiteScreenshot(website: string): Promise<string | null> {
  if (!website) return null;

  const normalizedWebsite = website
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .toLowerCase();
  const domain = normalizedWebsite.split('/')[0];
  const screenshotName = `screenshot_${domain.replace(/[^a-z0-9_-]/g, '_')}`;
  const screenshotPublicId = `screenshots/${screenshotName}`;

  // Check if already exists
  try {
    await cloudinary.api.resource(screenshotPublicId, { resource_type: 'image' });
    return cloudinary.url(screenshotPublicId, { resource_type: 'image' });
  } catch {
    // Not cached — fetch and upload
  }

  try {
    const microlinkUrl =
      `https://api.microlink.io/?url=${encodeURIComponent(`https://${domain}`)}` +
      `&screenshot=true&screenshot.fullPage=false&screenshot.type=png` +
      `&screenshot.viewport.width=1280&screenshot.viewport.height=800&embed=screenshot.url`;

    await cloudinary.uploader.upload(microlinkUrl, {
      public_id: screenshotName,
      folder: 'screenshots',
      overwrite: true,
      resource_type: 'image',
    });

    console.log(`[gif] Uploaded screenshot for ${domain}`);
    return cloudinary.url(screenshotPublicId, { resource_type: 'image' });
  } catch (err: any) {
    console.warn(`[gif] Failed to fetch screenshot for ${domain}: ${err.message}`);
    return null;
  }
}
