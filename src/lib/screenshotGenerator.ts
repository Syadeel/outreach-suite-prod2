/**
 * Screenshot Generator — Generates website screenshots for leads
 * and stores them in Cloudinary for use on landing pages.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Generate a website screenshot for a lead
 * @param websiteUrl - The lead's website URL
 * @returns Screenshot URL or null if generation failed
 */
export async function generateWebsiteScreenshot(websiteUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${APP_URL}/api/screenshot/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: websiteUrl }),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!res.ok) {
      console.error('[Screenshot] API error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.screenshotUrl || null;
  } catch (err: any) {
    console.error('[Screenshot] Generation failed:', err.message);
    return null;
  }
}

/**
 * Generate screenshots for multiple leads in parallel
 * @param leads - Array of leads with website URLs
 * @returns Map of lead ID to screenshot URL
 */
export async function generateScreenshotsForLeads(
  leads: Array<{ id: string; website: string | null }>
): Promise<Map<string, string>> {
  const screenshotMap = new Map<string, string>();

  // Filter leads with websites
  const leadsWithWebsites = leads.filter(l => l.website);

  // Generate screenshots in parallel (max 5 at a time)
  const batchSize = 5;
  for (let i = 0; i < leadsWithWebsites.length; i += batchSize) {
    const batch = leadsWithWebsites.slice(i, i + batchSize);
    const promises = batch.map(async (lead) => {
      const screenshotUrl = await generateWebsiteScreenshot(lead.website!);
      if (screenshotUrl) {
        screenshotMap.set(lead.id, screenshotUrl);
      }
    });
    await Promise.all(promises);
  }

  return screenshotMap;
}
