import crypto from 'crypto';

// Parse CLOUDINARY_URL manually: cloudinary://api_key:api_secret@cloud_name
function getCloudinaryConfig() {
  const url = process.env.CLOUDINARY_URL;
  if (url) {
    const match = url.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
    if (match) {
      return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
    }
  }
  return {
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'dacq1vyxp'
  };
}

/**
 * Generates a signed upload signature for direct browser-to-Cloudinary upload.
 */
export function getUploadSignature(folder = 'uploads') {
  const config = getCloudinaryConfig();
  const timestamp = Math.round(new Date().getTime() / 1000);

  if (!config.apiSecret || !config.apiKey) {
    throw new Error('Cloudinary not configured. Set CLOUDINARY_URL env var.');
  }

  // Generate SHA1 signature manually (same as Cloudinary SDK)
  const toSign = `folder=${folder}&timestamp=${timestamp}${config.apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  return {
    signature,
    timestamp,
    apiKey: config.apiKey,
    cloudName: config.cloudName,
    folder
  };
}

/**
 * Generates the animated GIF URL from a raw Cloudinary MP4 URL.
 */
export function getEmailGifUrl(videoUrl: string): string {
  if (!videoUrl) return '';
  return videoUrl
    .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
    .replace(/\.[^/.]+$/, '.gif');
}

export function getPersonalizedEmailGifUrl(videoUrl: string, websiteUrl: string): string {
  if (!videoUrl) return '';
  if (!websiteUrl) return getEmailGifUrl(videoUrl);
  return getEmailGifUrl(videoUrl);
}

export function getPersonalizedThumbnailUrl(videoUrl: string, prospectName: string): string {
  if (!prospectName) return videoUrl.replace(/\.[^/.]+$/, '.jpg');
  const encodedName = encodeURIComponent(`Hey ${prospectName}!`);
  const overlayText = `l_text:Arial_28_bold:${encodedName},co_rgb:ffffff,g_center,y_40`;
  const transformation = `video/upload/w_400,h_225,c_fill,${overlayText}/`;
  return videoUrl.replace('video/upload/', transformation).replace(/\.[^/.]+$/, '.jpg');
}
