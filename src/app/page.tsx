'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import CampaignsTab from '../components/CampaignsTab';
import LeadsTab from '../components/LeadsTab';
import VideoTab from '../components/VideoTab';
import InboxTab from '../components/InboxTab';
import AnalyticsTab from '../components/AnalyticsTab';
import SettingsTab from '../components/SettingsTab';
import TemplatesTab from '../components/TemplatesTab';
import { Sparkles, Lock, KeyRound, AlertCircle, RefreshCw } from 'lucide-react';

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
      case 'inbox':
        return <InboxTab />;
      case 'analytics':
        return <AnalyticsTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <AnalyticsTab />;
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm mt-4">Loading secure workspace...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="animated-gradient min-h-screen text-slate-100 flex items-center justify-center relative overflow-hidden p-4">
        {/* Decorative Background Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none z-0" />

        <div className="w-full max-w-md relative z-10">
          <div className="glass p-8 rounded-3xl border border-white/5 space-y-6 shadow-2xl text-center">
            {/* Header Branding */}
            <div className="space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner mx-auto mb-2">
                <Lock className="w-6 h-6 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-heading">Outreach Suite</h1>
              <p className="text-xs text-zinc-400">
                Enter your workspace key to access Capital Acquisition Systems.
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Workspace Key</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-xl glass-input text-sm text-heading"
                    required
                  />
                </div>
              </div>

              {authError && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-semibold animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authenticating}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 text-sm glow-button text-white-force"
              >
                {authenticating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
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
