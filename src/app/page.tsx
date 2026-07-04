'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import CampaignsTab from '../components/CampaignsTab';
import LeadsTab from '../components/LeadsTab';
import VideoTab from '../components/VideoTab';
import VoiceKitTab from '../components/VoiceKitTab';
import InboxTab from '../components/InboxTab';
import AnalyticsTab from '../components/AnalyticsTab';
import SettingsTab from '../components/SettingsTab';
import TemplatesTab from '../components/TemplatesTab';
import SettingsShell from '../components/SettingsShell';
import AvatarStudioTab from '../components/AvatarStudioTab';
import { ToastProvider } from '../components/Toast';
import { Sparkles } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const [activeTab, setActiveTabState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('os-active-tab')
      if (saved) return saved
    }
    return 'analytics'
  })

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab)
    localStorage.setItem('os-active-tab', tab)
  }

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
          colors: ['#10b981', '#14b8a6', '#f59e0b']
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
      case 'templates':
        return <TemplatesTab />;
      case 'leads':
        return <LeadsTab />;
      case 'video':
        return <VideoTab />;
      case 'voicekit':
        return <VoiceKitTab />;
      case 'inbox':
        return <InboxTab />;
      case 'analytics':
        return <AnalyticsTab />;
      case 'settings':
        return <SettingsShell />;
      case 'avatar':
        return <AvatarStudioTab />;
      default:
        return <AnalyticsTab />;
    }
  };

  return (
    <ToastProvider>
    <div className={styles.page}>
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Dashboard Container */}
      <main className={styles.main}>
        
        {/* Subtle decorative background gradient circles */}
        <div className={styles.bgGlow1} />
        <div className={styles.bgGlow2} />

        {/* Tab Wrapper */}
        <div className={styles.container}>
          
          {/* Quick Notice/Banner */}
          <div className={styles.banner}>
            <div className={styles.bannerLeft}>
              <Sparkles className={styles.bannerIcon} />
              <span>Workspace loaded. Automated sequencing is active in the background.</span>
            </div>
            <span className={styles.bannerVersion}>v2.0.0 Stable</span>
          </div>

          {/* Active Pane */}
          <div className={styles.content}>
            {renderActiveTab()}
          </div>
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
