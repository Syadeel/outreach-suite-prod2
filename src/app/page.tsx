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
import { Sparkles, Lock, KeyRound, AlertCircle, RefreshCw } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/check');
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
    } catch {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setAuthenticating(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
      } else {
        setAuthError(data.error || 'Invalid password');
      }
    } catch (err) {
      setAuthError('Authentication failed. Try again.');
    } finally {
      setAuthenticating(false);
    }
  };

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
  }, [isAuthenticated]);

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

  if (isAuthenticated === null) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingContent}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>Loading secure workspace...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className={styles.authContainer}>
        {/* Animated grid background */}
        <div className={styles.authBgGrid} />
        
        {/* Gradient orbs */}
        <div className={styles.authGlow1} />
        <div className={styles.authGlow2} />

        <div className={styles.authCard}>
          <div className={styles.authCardInner}>
            <div className={styles.authHeader}>
              <div className={styles.authIcon}>
                <Lock className={styles.authIconSvg} />
              </div>
              <h1 className={styles.authTitle}>Outreach Suite</h1>
              <p className={styles.authSubtitle}>
                Enter your workspace key to access Capital Acquisition Systems.
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className={styles.authForm}>
              <div>
                <label className={styles.authLabel}>Workspace Key</label>
                <div className={styles.authInputWrapper}>
                  <KeyRound className={styles.authInputIcon} />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className={styles.authInput}
                    required
                  />
                </div>
              </div>

              {authError && (
                <div className={styles.authError}>
                  <AlertCircle className={styles.authErrorIcon} />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authenticating}
                className={styles.authBtn}
              >
                {authenticating ? (
                  <>
                    <RefreshCw className={styles.authBtnIcon} /> Verifying...
                  </>
                ) : (
                  'Unlock Workspace'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
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
  );
}
