'use client';

import React, { useState } from 'react';
import V2Tab from './V2Tab';
import TemplatesTab from './TemplatesTab';
import InboxTab from './InboxTab';
import AccountTab from './AccountTab';
import AdvancedTab from './AdvancedTab';
import SecurityTab from './SecurityTab';

const SETTINGS_SECTIONS = [
  { id: 'v2', label: 'V2 AI Avatar' },
  { id: 'templates', label: 'Templates' },
  { id: 'inbox', label: 'Unified Inbox' },
  { id: 'account', label: 'Account' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'security', label: 'Security' },
];

export default function SettingsShell({ onBack }: { onBack?: () => void }) {
  const [section, setSection] = useState('v2');

  const renderSection = () => {
    switch (section) {
      case 'v2': return <V2Tab />;
      case 'templates': return <TemplatesTab />;
      case 'inbox': return <InboxTab />;
      case 'account': return <AccountTab />;
      case 'advanced': return <AdvancedTab />;
      case 'security': return <SecurityTab />;
      default: return <V2Tab />;
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
