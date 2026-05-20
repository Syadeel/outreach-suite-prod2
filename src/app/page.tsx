'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import CampaignsTab from '../components/CampaignsTab';
import LeadsTab from '../components/LeadsTab';
import VideoTab from '../components/VideoTab';
import InboxTab from '../components/InboxTab';
import AnalyticsTab from '../components/AnalyticsTab';
import SettingsTab from '../components/SettingsTab';
import { Sparkles } from 'lucide-react';
export default function Home() {
  const [activeTab, setActiveTab] = useState('campaigns');


  useEffect(() => {
    // Check if redirecting back from a successful Google OAuth flow
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      setActiveTab('settings');
      
      // Trigger confetti celebration dynamically on the client side
      import('canvas-confetti').then((module) => {
        const confetti = module.default;
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#10b981', '#14b8a6', '#f59e0b'] // Premium emerald/teal/gold confetti
        });
      }).catch(err => console.error('Failed to load confetti:', err));

      // Clear the query parameter
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'campaigns':
        return <CampaignsTab />;
      case 'leads':
        return <LeadsTab />;
      case 'video':
        return <VideoTab />;
      case 'inbox':
        return <InboxTab />;
      case 'analytics':
        return <AnalyticsTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <CampaignsTab />;
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Dashboard Container */}
      <main className="flex-1 p-8 overflow-y-auto max-h-screen relative">
        
        {/* Subtle decorative background gradient circles */}
        <div className="absolute top-10 right-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-pink-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Tab Wrapper */}
        <div className="max-w-6xl mx-auto space-y-6 relative z-10">
          
          {/* Quick Notice/Banner */}
          <div className="glass-panel px-4 py-3 rounded-2xl flex items-center justify-between border-slate-800/40 bg-indigo-950/15">
            <div className="flex items-center gap-2 text-xs text-indigo-300 font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Workspace loaded. Automated sequencing is active in the background.</span>
            </div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">v1.0.0 Stable</span>
          </div>

          {/* Active Pane */}
          <div className="animate-fadeIn">
            {renderActiveTab()}
          </div>
        </div>
      </main>
    </div>
  );
}
