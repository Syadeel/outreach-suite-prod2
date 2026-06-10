'use client';

import React, { useState } from 'react';
import VideoTab from './VideoTab';
import VoiceKitTab from './VoiceKitTab';
import TemplatesTab from './TemplatesTab';
import InboxTab from './InboxTab';

const SETTINGS_SECTIONS = [
  { id: 'video', label: 'VideoSpark Recorder' },
  { id: 'voicekit', label: 'VoiceKit' },
  { id: 'templates', label: 'Email Templates' },
  { id: 'inbox', label: 'Unified Inbox' },
  { id: 'account', label: 'Account' },
  { id: 'advanced', label: 'Advanced' },
];

export default function SettingsShell({ onBack }: { onBack?: () => void }) {
  const [section, setSection] = useState('video');

  const renderSection = () => {
    switch (section) {
      case 'video': return <VideoTab />;
      case 'voicekit': return <VoiceKitTab />;
      case 'templates': return <TemplatesTab />;
      case 'inbox': return <InboxTab />;
      case 'account':
        return (
          <div className="glass-panel rounded-2xl border border-slate-800/60 p-6">
            <h3 className="text-lg font-bold text-heading mb-4">Account Settings</h3>
            <p className="text-sm text-slate-400">Account configuration coming soon.</p>
          </div>
        );
      case 'advanced':
        return (
          <div className="glass-panel rounded-2xl border border-slate-800/60 p-6">
            <h3 className="text-lg font-bold text-heading mb-4">Advanced Settings</h3>
            <p className="text-sm text-slate-400">Advanced configuration coming soon.</p>
          </div>
        );
      default: return <VideoTab />;
    }
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Settings Sidebar */}
      <div className="w-56 shrink-0 glass-panel rounded-2xl border border-slate-800/60 p-4 flex flex-col h-fit sticky top-0">
        <h3 className="text-sm font-bold text-heading px-3 pb-3 border-b border-slate-800/60 mb-2">
          Settings
        </h3>
        <nav className="space-y-0.5">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                section === s.id
                  ? 'bg-gradient-to-r from-emerald-600/40 to-teal-600/20 border-l-4 border-emerald-500 text-heading font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="flex-1 min-w-0">
        {renderSection()}
      </div>
    </div>
  );
}
