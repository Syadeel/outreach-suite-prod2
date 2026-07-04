'use client'

import { useState, useEffect } from 'react'
import { Shield, Key, Lock, Eye, EyeOff, User, CheckCircle, AlertCircle } from 'lucide-react'
import s from './SecurityTab.module.css'

export default function SecurityTab() {
  // Username state
  const [username, setUsername] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [usernamePassword, setUsernamePassword] = useState('')
  const [showUsernamePassword, setShowUsernamePassword] = useState(false)
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameMessage, setUsernameMessage] = useState('')
  const [usernameError, setUsernameError] = useState(false)

  // Password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [pwdError, setPwdError] = useState(false)

  // Load current username
  useEffect(() => {
    fetch('/api/settings/username')
      .then(r => r.json())
      .then(data => {
        setUsername(data.username || 'admin')
        setNewUsername(data.username || 'admin')
      })
      .catch(() => {})
  }, [])

  const handleChangeUsername = async () => {
    if (!newUsername.trim()) { setUsernameMessage('Username is required'); setUsernameError(true); return }
    if (newUsername.length < 3) { setUsernameMessage('Username must be at least 3 characters'); setUsernameError(true); return }
    if (!usernamePassword) { setUsernameMessage('Password is required to change username'); setUsernameError(true); return }
    
    setUsernameSaving(true)
    setUsernameError(false)
    try {
      const res = await fetch('/api/settings/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: usernamePassword, newUsername: newUsername.toLowerCase().trim() })
      })
      if (res.ok) {
        const data = await res.json()
        setUsername(data.username)
        setUsernameMessage('Username changed successfully!')
        setUsernameError(false)
        setUsernamePassword('')
      } else {
        const data = await res.json()
        setUsernameMessage(data.error || 'Failed to change username')
        setUsernameError(true)
      }
    } catch {
      setUsernameMessage('Failed to change username')
      setUsernameError(true)
    } finally {
      setUsernameSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setMessage('Passwords do not match'); setPwdError(true); return }
    if (newPassword.length < 6) { setMessage('Password must be at least 6 characters'); setPwdError(true); return }
    setSaving(true)
    setPwdError(false)
    try {
      const res = await fetch('/api/settings/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      if (res.ok) {
        setMessage('Password changed successfully!')
        setPwdError(false)
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      } else {
        const data = await res.json()
        setMessage(data.error || 'Failed to change password')
        setPwdError(true)
      }
    } catch {
      setMessage('Failed to change password')
      setPwdError(true)
    } finally { setSaving(false) }
  }

  return (
    <div className={s.container}>
      <h3 className={s.title}><Shield className={s.icon} /> Security Settings</h3>

      {/* Username Section */}
      <div className={s.card}>
        <h4 className={s.cardTitle}><User className={s.iconSm} /> Change Username</h4>
        <div className={s.field}>
          <label className={s.label}>Current Username</label>
          <input type="text" value={username} disabled className={s.input} style={{ opacity: 0.6 }} />
        </div>
        <div className={s.field}>
          <label className={s.label}>New Username</label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Enter new username"
            className={s.input}
          />
        </div>
        <div className={s.field}>
          <label className={s.label}>Confirm with Password</label>
          <div className={s.passwordRow}>
            <input
              type={showUsernamePassword ? 'text' : 'password'}
              value={usernamePassword}
              onChange={(e) => setUsernamePassword(e.target.value)}
              placeholder="Enter current password"
              className={s.input}
            />
            <button onClick={() => setShowUsernamePassword(!showUsernamePassword)} className={s.eyeBtn}>
              {showUsernamePassword ? <EyeOff className={s.iconSm} /> : <Eye className={s.iconSm} />}
            </button>
          </div>
        </div>
        <div className={s.actions}>
          {usernameMessage && (
            <span className={usernameError ? s.messageError : s.messageSuccess}>
              {usernameError ? <AlertCircle className={s.iconXs} /> : <CheckCircle className={s.iconXs} />}
              {usernameMessage}
            </span>
          )}
          <button onClick={handleChangeUsername} disabled={usernameSaving} className={s.saveBtn}>
            {usernameSaving ? 'Saving...' : 'Change Username'}
          </button>
        </div>
      </div>

      {/* Password Section */}
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
          {message && (
            <span className={pwdError ? s.messageError : s.messageSuccess}>
              {pwdError ? <AlertCircle className={s.iconXs} /> : <CheckCircle className={s.iconXs} />}
              {message}
            </span>
          )}
          <button onClick={handleChangePassword} disabled={saving} className={s.saveBtn}>{saving ? 'Changing...' : 'Change Password'}</button>
        </div>
      </div>
    </div>
  )
}
