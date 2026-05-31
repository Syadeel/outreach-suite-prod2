import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import React from 'react';

/**
 * Dynamic landing page for a specific lead.
 * It loads the lead data (including video URL) from Supabase and renders:
 *   • Screenshot as a scrolling background video (CSS animation)
 *   • The personalized lip‑sync video inside a circular overlay
 *   • CTA button linking to the prospect's website
 */
export default async function LeadLandingPage({ params }: { params: { leadId: string } }) {
  const { leadId } = params;
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('first_name,company,custom_fields')
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    notFound();
  }

  const screenshot = lead.custom_fields?.screenshot || '';
  const videoUrl = lead.custom_fields?.video_url || '';

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Scrolling background – use CSS keyframes */}
      {screenshot && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${screenshot})`,
            animation: 'scrollBg 30s linear infinite',
          }}
        />
      )}

      {/* Central video overlay – circular */}
      {videoUrl && (
        <div className="flex items-center justify-center h-full">
          <div className="w-80 h-80 rounded-full overflow-hidden shadow-lg">
            <video
              src={videoUrl}
              autoPlay
              muted
              loop
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Simple CTA */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <a
          href={lead.website}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 transition"
        >
          Visit {lead.company}
        </a>
      </div>
      <style jsx>{`
        @keyframes scrollBg {
          0% { background-position: 0% 0%; }
          100% { background-position: 100% 0%; }
        }
      `}</style>
    </div>
  );
}
