import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Users, 
  Video, 
  Inbox, 
  BarChart2, 
  Settings,
  Flame,
  Sun,
  Moon
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsLightMode(true);
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isLightMode;
    setIsLightMode(newMode);
    if (newMode) {
      document.body.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  };

  const menuItems = [
    { id: 'campaigns', label: 'Campaigns', icon: Mail },
    { id: 'leads', label: 'Leads & CRM', icon: Users },
    { id: 'video', label: 'VideoSpark Recorder', icon: Video },
    { id: 'inbox', label: 'Unified Inbox', icon: Inbox },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'settings', label: 'Settings & Inboxes', icon: Settings },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-slate-800/60 p-6 flex flex-col justify-between h-screen sticky top-0">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-2 mb-8 px-2">
          <Flame className="w-8 h-8 text-emerald-500 animate-pulse" />
          <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
            OS
          </span>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600/40 to-teal-600/20 border-l-4 border-emerald-500 text-white font-medium shadow-lg shadow-emerald-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Branding & Theme Footer */}
      <div className="border-t border-slate-800/60 pt-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-300">
            G
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Ghost</h4>
            <p className="text-xs text-slate-500">Personal Workspace</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          title={`Switch to ${isLightMode ? 'Dark' : 'Light'} Mode`}
          className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800/40 transition-colors"
        >
          {isLightMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
}
