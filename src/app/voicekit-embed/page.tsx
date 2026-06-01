'use client';

import React from 'react';

export default function VoiceKitEmbed() {
  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden">
      <iframe
        src="https://Adeel020-voicekit.hf.space"
        className="w-full h-full border-none"
        allow="microphone; camera; clipboard-write; autoplay"
      />
    </div>
  );
}
