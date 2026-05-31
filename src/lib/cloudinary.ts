import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Generates a signed upload signature for direct browser-to-Cloudinary upload.
 * Bypasses sending raw video bytes to our GCP server.
 */
export function getUploadSignature(folder = 'videos') {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder
    },
    process.env.CLOUDINARY_API_SECRET || ''
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    folder
  };
}

/**
 * Generates the animated GIF URL from a raw Cloudinary MP4 URL.
 * Grabs the first 3 seconds and scales it down for email size.
 */
export function getEmailGifUrl(videoUrl: string): string {
  if (!videoUrl) return '';
  // Cloudinary URLs look like: https://res.cloudinary.com/cloudname/video/upload/v12345/folder/filename.mp4
  // We want to transform it to: https://res.cloudinary.com/cloudname/video/upload/so_0,eo_3,w_300,h_169,c_fill,f_gif/v12345/folder/filename.gif
  
  // Replace the extension with .gif and inject our transformation parameters
  const gifUrl = videoUrl
    .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
    .replace(/\.[^/.]+$/, '.gif'); // change extension to .gif

  return gifUrl;
}

/**
 * Generates a personalized animated GIF URL that overlays the webcam video (cropped as a circle)
 * on top of a screenshot of the lead's website using Cloudinary image fetch.
 */
export function getPersonalizedEmailGifUrl(videoUrl: string, websiteUrl: string): string {
  if (!videoUrl) return '';
  if (!websiteUrl) return getEmailGifUrl(videoUrl);

  const match = videoUrl.match(/res\.cloudinary\.com\/([^/]+)\/video\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i);
  if (!match) return getEmailGifUrl(videoUrl);

  const cloudName = match[1];
  const publicId = match[2];
  const publicIdWithColons = publicId.replace(/\//g, ':');

  const normalizedWebsite = websiteUrl.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, "https://");
  const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(normalizedWebsite)}&screenshot=true&embed=screenshot.url`;
  
  // Base64 encode the remote URL for Cloudinary's l_fetch parameter
  const base64Url = Buffer.from(microlinkUrl).toString('base64')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    .replace(/=/g, '');

  return `https://res.cloudinary.com/${cloudName}/video/upload/l_fetch:${base64Url}/c_fill,w_400,h_250/fl_layer_apply/l_video:${publicIdWithColons},c_fill,w_100,h_100,r_max/fl_layer_apply,g_south_west,x_15,y_15/f_gif,du_3,e_loop/${publicId}.gif`;
}

/**
 * Generates a video thumbnail with a dynamic text overlay (prospect name).
 * Cloudinary allows text overlays as layers.
 */
export function getPersonalizedThumbnailUrl(videoUrl: string, prospectName: string): string {
  if (!prospectName) return videoUrl.replace(/\.[^/.]+$/, '.jpg'); // static fallback
  
  // URL encode name and replace spaces with %20
  const encodedName = encodeURIComponent(`Hey ${prospectName}!`).replace(/%20/g, '%20');
  
  // Construct a layer parameter for Cloudinary:
  // l_text:Arial_30_bold_style:text,co_rgb:ffffff,g_north_west,x_20,y_20
  const overlayText = `l_text:Arial_28_bold:${encodedName},co_rgb:ffffff,g_center,y_40`;
  const transformation = `video/upload/w_400,h_225,c_fill,${overlayText}/`;
  const thumbUrl = videoUrl
    .replace('video/upload/', transformation)
    .replace(/\.[^/.]+$/, '.jpg'); // render as JPG

  return thumbUrl;
}
