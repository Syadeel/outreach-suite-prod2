'use client'

import { useState } from 'react'
import { Shield, Key, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react'
import s from './SecurityTab.module.css'

export default function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setMessage('Passwords do not match'); return }
    if (newPassword.length < 8) { setMessage('Password must be at least 8 characters'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      if (res.ok) { setMessage('Password changed successfully!'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }
      else { const data = await res.json(); setMessage(data.error || 'Failed to change password') }
    } catch (err) { setMessage('Failed to change password') }
    finally { setSaving(false) }
  }

  return (
    <div className={s.container}>
      <h3 className={s.title}><Shield className={s.icon} /> Security Settings</h3>
      <div className={s.card}>
        <h4 className={s.cardTitle}><Key className={s.iconSm} /> Change Password</h4>
        <div className={s.field}>
          <label className={s.label}>Current Password</label>
          <div className={s.passwordRow}>
            <input type={showPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={s.input} />
            <button onClick={() => setShowPassword(!showPassword)} className={s.eyeBtn}>{showPassword ? <EyeOff className={s.iconSm} /> : <Eye className={s.iconSm} />}</button>
          </div>
        </div>
        <div className={s.field}>
          <label className={s.label}>New Password</label>
          <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={s.input} />
        </div>
        <div className={s.field}>
          <label className={s.label}>Confirm New Password</label>
          <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={s.input} />
        </div>
        <div className={s.actions}>
          {message && <span className={s.message}>{message}</span>}
          <button onClick={handleChangePassword} disabled={saving} className={s.saveBtn}>{saving ? 'Changing...' : 'Change Password'}</button>
        </div>
      </div>
    </div>
  )
}
