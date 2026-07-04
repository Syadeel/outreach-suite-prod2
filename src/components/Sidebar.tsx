import React, { useState, useEffect } from 'react';
import { 
  Users, 
  BarChart2, 
  Settings,
  Sun,
  Moon,
  Mail,
  FileText,
  Inbox,
  Video,
  Mic,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut
} from 'lucide-react';
import styles from './Sidebar.module.css';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      setIsDarkMode(true);
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDarkMode;
    setIsDarkMode(newIsDark);
    if (newIsDark) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const menuItems = [
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'campaigns', label: 'Campaigns', icon: Mail },
    { id: 'leads', label: 'Leads & CRM', icon: Users },
    { id: 'avatar', label: 'Avatar Studio', icon: Sparkles },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'voicekit', label: 'Voice AI', icon: Mic },
  ];

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div>
        {/* Toggle Button */}
        <button className={styles.toggleBtn} onClick={() => setCollapsed(prev => !prev)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className={styles.toggleIcon} /> : <PanelLeftClose className={styles.toggleIcon} />}
        </button>

        {/* Brand Header */}
        <div className={styles.brand}>
          <img
            src="/ca-logo.svg"
            alt="Capital Acquisition"
            width={32}
            height={32}
            className={styles.brandLogo}
            style={{ borderRadius: '6px', objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove(styles.hidden); }}
          />
          <span className={`${styles.brandFallback} ${styles.hidden}`}>CA</span>
          {!collapsed && (
            <div className={styles.brandTextCol}>
              <span className={styles.brandText}>Capital Acquisition</span>
              <span className={styles.brandSubtext}>Outreach Suite</span>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className={styles.nav}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={isActive ? styles.navItemActive : styles.navItem}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={styles.navIcon} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Branding, Theme Toggle & Powered By */}
      <div className={styles.footer}>
        <div className={styles.userRow}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>G</div>
            {!collapsed && (
              <div>
                <h4 className={styles.userName}>Ghost</h4>
                <p className={styles.userLabel}>Personal Workspace</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggleTheme}
              title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode`}
              className={styles.themeToggle}
            >
              {isDarkMode ? <Sun className={styles.themeIcon} /> : <Moon className={styles.themeIcon} />}
            </button>
          )}
        </div>
        <button
          onClick={() => setActiveTab('settings')}
          className={activeTab === 'settings' ? styles.settingsBtnActive : styles.settingsBtn}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className={styles.navIcon} />
          {!collapsed && <span>Settings</span>}
        </button>
        <button
          onClick={() => {
            document.cookie = 'os_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.thecapitalacquisition.com';
            document.cookie = 'os_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
            window.location.href = '/login';
          }}
          className={styles.logoutBtn}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className={styles.navIcon} />
          {!collapsed && <span>Sign Out</span>}
        </button>
        {!collapsed && <p className={styles.poweredBy}>Powered by Capital Acquisition</p>}
      </div>
    </aside>
  );
}
