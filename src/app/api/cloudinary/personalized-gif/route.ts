import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { v2 as cloudinary } from 'cloudinary';

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');
    const website = searchParams.get('website');

    if (!videoId) {
      return NextResponse.json({ error: 'videoId query parameter is required' }, { status: 400 });
    }

    // 1. Fetch the video details from Supabase
    const { data: video, error: dbError } = await supabaseAdmin
      .from('video_recordings')
      .select('*')
      .eq('id', videoId)
      .single();

    if (dbError || !video) {
      return NextResponse.json({ error: 'Video recording not found' }, { status: 404 });
    }

    const rawVideoUrl = video.video_url;
    if (!rawVideoUrl) {
      return NextResponse.json({ error: 'Video URL not found in recording' }, { status: 404 });
    }

    // Extract Cloudinary cloud name, public ID, etc. from video_url
    const match = rawVideoUrl.match(/res\.cloudinary\.com\/([^/]+)\/video\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i);
    if (!match) {
      // Fallback: just redirect to standard GIF
      return NextResponse.redirect(video.gif_url || rawVideoUrl);
    }

    const cloudName = match[1];
    const videoPublicId = match[2];
    const videoPublicIdWithColons = videoPublicId.replace(/\//g, ':');

    // If website parameter is missing or empty, fall back to standard non-personalized GIF
    if (!website || website === '{{website}}') {
      const fallbackGif = rawVideoUrl
        .replace('/video/upload/', '/video/upload/w_400,c_scale,f_gif,q_auto,du_3,e_loop/')
        .replace(/\.[^/.]+$/, '.gif');
      return NextResponse.redirect(fallbackGif);
    }

    // Normalize website URL to extract clean domain name
    const normalizedWebsite = website.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").toLowerCase();
    const domain = normalizedWebsite.split('/')[0];
    const screenshotName = `screenshot_${domain.replace(/[^a-z0-9_-]/g, '_')}`;

    // Cloudinary folder path
    const folder = 'screenshots';
    const screenshotPublicId = `${folder}/${screenshotName}`;

    // Verify if screenshot already exists in Cloudinary to avoid rate-limiting/over-fetching
    let uploadScreenshot = true;
    try {
      await cloudinary.api.resource(screenshotPublicId, { resource_type: 'image' });
      uploadScreenshot = false;
      console.log(`Screenshot for ${domain} already exists in Cloudinary. Skipping upload.`);
    } catch (err) {
      console.log(`Screenshot for ${domain} does not exist. Fetching and uploading...`);
    }

    if (uploadScreenshot) {
      // Microlink high-resolution desktop view URL
      const targetWebsite = `https://${domain}`;
      const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetWebsite)}&screenshot=true&screenshot.fullPage=false&screenshot.type=png&screenshot.viewport.width=1280&screenshot.viewport.height=800&embed=screenshot.url`;
      
      // Upload raw Microlink URL to Cloudinary
      await cloudinary.uploader.upload(microlinkUrl, {
        public_id: screenshotName,
        folder: folder,
        overwrite: true,
        resource_type: 'image'
      });
      console.log(`Uploaded screenshot to Cloudinary: ${screenshotPublicId}`);
    }

    // Replace folder slashes with colons for Cloudinary overlays
    const screenshotPublicIdWithColons = screenshotPublicId.replace(/\//g, ':');
    
    // Construct the overlay URL
    // Base asset is video. Overlay screenshot image (scaled down to GIF dimensions: w_400, h_250),
    // then overlay video in a small circle in the bottom-left corner (w_90, h_90).
    const personalizedGifUrl = `https://res.cloudinary.com/${cloudName}/video/upload/l_${screenshotPublicIdWithColons},w_400,h_250,c_fill/fl_layer_apply/l_video:${videoPublicIdWithColons},w_95,h_95,c_fill,r_max/fl_layer_apply,g_south_west,x_15,y_15/f_gif,du_3,e_loop/${videoPublicId}.gif`;

    console.log(`Redirecting to personalized GIF URL: ${personalizedGifUrl}`);

    // Perform redirect to the final looping GIF
    return NextResponse.redirect(personalizedGifUrl);
  } catch (err: any) {
    console.error('Error generating personalized GIF:', err);
    // Fallback to standard GIF
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
