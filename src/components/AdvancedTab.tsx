'use client'

import { useState, useEffect } from 'react'
import { Sliders, Clock, Activity, Sun, Settings, CheckCircle, AlertCircle } from 'lucide-react'
import s from './AdvancedTab.module.css'

export default function AdvancedTab() {
  const [dailyLimit, setDailyLimit] = useState(50)
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00')
  const [businessHoursEnd, setBusinessHoursEnd] = useState('17:00')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [systemStatus, setSystemStatus] = useState({ apiHealth: 'healthy', environment: 'production', lastCron: 'Never', inboxCount: 0 })

  useEffect(() => { fetchStatus() }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/auth/check')
      if (res.ok) setSystemStatus(prev => ({ ...prev, apiHealth: 'healthy' }))
    } catch { setSystemStatus(prev => ({ ...prev, apiHealth: 'error' })) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      localStorage.setItem('os_advanced', JSON.stringify({ dailyLimit, businessHoursStart, businessHoursEnd }))
      setMessage('Settings saved!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.container}>
      <h3 className={s.title}><Sliders className={s.icon} /> Advanced Settings</h3>

      <div className={s.card}>
        <div className={s.cardHeader}><Settings className={s.iconSm} /><h4 className={s.cardTitle}>Default Daily Sending Limit</h4></div>
        <p className={s.cardDesc}>Maximum emails to send per inbox per day.</p>
        <div className={s.limitRow}>
          <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(parseInt(e.target.value) || 50)} className={s.limitInput} min="1" max="500" />
          <span className={s.limitLabel}>emails/day</span>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardHeader}><Sun className={s.iconSm} /><h4 className={s.cardTitle}>Business Hours</h4></div>
        <p className={s.cardDesc}>Only send emails during these hours.</p>
        <div className={s.hoursRow}>
          <div><label className={s.label}>Start</label><input type="time" value={businessHoursStart} onChange={(e) => setBusinessHoursStart(e.target.value)} className={s.timeInput} /></div>
          <div><label className={s.label}>End</label><input type="time" value={businessHoursEnd} onChange={(e) => setBusinessHoursEnd(e.target.value)} className={s.timeInput} /></div>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardHeader}><Activity className={s.iconSm} /><h4 className={s.cardTitle}>System Status</h4></div>
        <div className={s.statusGrid}>
          <div className={s.statusItem}><span className={s.statusLabel}>API Health</span><span className={`${s.statusValue} ${systemStatus.apiHealth === 'healthy' ? s.statusOk : s.statusErr}`}>{systemStatus.apiHealth === 'healthy' ? <CheckCircle className={s.iconXs} /> : <AlertCircle className={s.iconXs} />} {systemStatus.apiHealth}</span></div>
          <div className={s.statusItem}><span className={s.statusLabel}>Environment</span><span className={s.statusValue}>{systemStatus.environment}</span></div>
          <div className={s.statusItem}><span className={s.statusLabel}>Last Cron Run</span><span className={s.statusValue}>{systemStatus.lastCron}</span></div>
          <div className={s.statusItem}><span className={s.statusLabel}>Total Inboxes</span><span className={s.statusValue}>{systemStatus.inboxCount}</span></div>
        </div>
      </div>

      <div className={s.actions}>
        {message && <span className={s.message}>{message}</span>}
        <button onClick={handleSave} disabled={saving} className={s.saveBtn}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </div>
  )
}
