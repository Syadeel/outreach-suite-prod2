'use client'

import { useState } from 'react'
import { User, Mail, Key, Save, CheckCircle } from 'lucide-react'
import s from './AccountTab.module.css'

export default function AccountTab() {
  const [email, setEmail] = useState('ghost@capitalacquisition.com')
  const [name, setName] = useState('Ghost')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      localStorage.setItem('os_account', JSON.stringify({ email, name }))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.container}>
      <h3 className={s.title}><User className={s.icon} /> Account Settings</h3>
      <div className={s.card}>
        <div className={s.avatarSection}>
          <div className={s.avatar}>{name.charAt(0).toUpperCase()}</div>
          <div>
            <h4 className={s.avatarName}>{name}</h4>
            <p className={s.avatarEmail}>{email}</p>
          </div>
        </div>
        <div className={s.field}>
          <label className={s.label}>Display Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={s.input} />
        </div>
        <div className={s.field}>
          <label className={s.label}>Email Address</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={s.input} />
        </div>
        <div className={s.actions}>
          {saved && <span className={s.savedMsg}><CheckCircle className={s.iconXs} /> Saved!</span>}
          <button onClick={handleSave} disabled={saving} className={s.saveBtn}><Save className={s.iconSm} /> {saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
