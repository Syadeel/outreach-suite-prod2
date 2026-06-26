'use client'

import { useState } from 'react'
import { Settings, User, Shield, Sliders } from 'lucide-react'
import SettingsTab from './SettingsTab'
import AccountTab from './AccountTab'
import SecurityTab from './SecurityTab'
import AdvancedTab from './AdvancedTab'
import s from './SettingsShell.module.css'

export default function SettingsShell() {
  const [activeSection, setActiveSection] = useState('general')

  const sections = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'account', label: 'Account', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'advanced', label: 'Advanced', icon: Sliders },
  ]

  const renderSection = () => {
    switch (activeSection) {
      case 'general': return <SettingsTab />
      case 'account': return <AccountTab />
      case 'security': return <SecurityTab />
      case 'advanced': return <AdvancedTab />
      default: return <SettingsTab />
    }
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <h2 className={s.title}><Settings className={s.titleIcon} /> Settings</h2>
        <p className={s.subtitle}>Manage your workspace settings and preferences.</p>
      </div>
      <div className={s.layout}>
        <nav className={s.sidebar}>
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button key={section.id} onClick={() => setActiveSection(section.id)} className={`${s.navItem} ${activeSection === section.id ? s.navItemActive : ''}`}>
                <Icon className={s.navIcon} />
                {section.label}
              </button>
            )
          })}
        </nav>
        <div className={s.content}>{renderSection()}</div>
      </div>
    </div>
  )
}
