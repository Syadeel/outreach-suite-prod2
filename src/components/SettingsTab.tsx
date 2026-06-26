'use client'

import { useState, useEffect } from 'react'
import { Settings, Mail, Globe, Palette, Bell } from 'lucide-react'
import s from './SettingsTab.module.css'

export default function SettingsTab() {
  const [appName, setAppName] = useState('Outreach Suite')
  const [appUrl, setAppUrl] = useState('')
  const [brandColor, setBrandColor] = useState('#10b981')
  const [notifications, setNotifications] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setAppUrl(process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      localStorage.setItem('os_settings', JSON.stringify({ appName, appUrl, brandColor, notifications }))
      setMessage('Settings saved!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.container}>
      <h3 className={s.title}><Settings className={s.icon} /> General Settings</h3>
      
      <div className={s.card}>
        <div className={s.field}>
          <label className={s.label}>App Name</label>
          <input type="text" value={appName} onChange={(e) => setAppName(e.target.value)} className={s.input} />
        </div>
        <div className={s.field}>
          <label className={s.label}>App URL</label>
          <input type="url" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} className={s.input} />
        </div>
        <div className={s.field}>
          <label className={s.label}>Brand Color</label>
          <div className={s.colorRow}>
            <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className={s.colorInput} />
            <input type="text" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className={s.input} />
          </div>
        </div>
        <div className={s.field}>
          <label className={s.checkboxLabel}>
            <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} className={s.checkbox} />
            <span>Enable email notifications</span>
          </label>
        </div>
        <div className={s.actions}>
          {message && <span className={s.message}>{message}</span>}
          <button onClick={handleSave} disabled={saving} className={s.saveBtn}>{saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
      </div>
    </div>
  )
}
