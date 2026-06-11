'use client'

import { useState, useEffect } from 'react'
import { Shield, Lock, Key, Eye, EyeOff, CheckCircle, AlertTriangle, RotateCcw } from 'lucide-react'

export default function SecurityTab() {
  const [status, setStatus] = useState<{ hasCustomPassword: boolean; lastUpdated: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showCon, setShowCon] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => { fetchStatus() }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/settings/password')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }

  const showMsg = (type: 'ok' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const getStrength = (pw: string): { label: string; color: string; pct: number } => {
    if (!pw) return { label: '', color: 'bg-slate-700', pct: 0 }
    if (pw.length < 6) return { label: 'Weak', color: 'bg-red-500', pct: 25 }
    if (pw.length < 10) return { label: 'Medium', color: 'bg-yellow-500', pct: 50 }
    if (/[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) return { label: 'Strong', color: 'bg-emerald-500', pct: 100 }
    if (pw.length >= 10) return { label: 'Good', color: 'bg-emerald-400', pct: 75 }
    return { label: 'Medium', color: 'bg-yellow-500', pct: 50 }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { showMsg('error', 'New passwords do not match'); return }
    if (newPw.length < 6) { showMsg('error', 'Password must be at least 6 characters'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (res.ok) {
        showMsg('ok', 'Password updated successfully')
        setCurrentPw(''); setNewPw(''); setConfirmPw('')
        fetchStatus()
      } else {
        showMsg('error', data.error || 'Failed to update password')
      }
    } catch { showMsg('error', 'Network error') }
    setSaving(false)
  }

  const handleReset = async () => {
    if (!confirm('Reset to default password? This clears the custom password.')) return
    try {
      const res = await fetch('/api/settings/password', { method: 'DELETE' })
      if (res.ok) {
        showMsg('ok', 'Reset to default password')
        fetchStatus()
      }
    } catch { showMsg('error', 'Failed to reset') }
  }

  const strength = getStrength(newPw)

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-7 h-7 text-emerald-400" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-heading">Security</h2>
          <p className="text-sm text-muted">Manage your dashboard password and security settings</p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
          message.type === 'ok'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="glass-panel rounded-2xl border border-slate-800/60 p-8 text-center text-slate-500 text-sm">Loading...</div>
      ) : (
        <>
          {/* Status card */}
          <div className="glass-panel rounded-2xl border border-slate-800/60 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${status?.hasCustomPassword ? 'bg-emerald-500/10' : 'bg-yellow-500/10'}`}>
                  <Lock className={`w-5 h-5 ${status?.hasCustomPassword ? 'text-emerald-400' : 'text-yellow-400'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-heading">Dashboard Password</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Last updated: {status?.lastUpdated && status.lastUpdated !== 'never'
                      ? new Date(status.lastUpdated).toLocaleDateString()
                      : 'Never (using env default)'}
                  </p>
                </div>
              </div>
              <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold border ${
                status?.hasCustomPassword
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {status?.hasCustomPassword
                  ? <><CheckCircle className="w-3 h-3" /> Custom</>
                  : <><AlertTriangle className="w-3 h-3" /> Default</>
                }
              </span>
            </div>
          </div>

          {/* Change password form */}
          <form onSubmit={handleSubmit} className="glass-panel rounded-2xl border border-slate-800/60 p-5 space-y-4">
            <h3 className="text-sm font-bold text-heading flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              Change Password
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Current Password</label>
              <div className="relative">
                <input
                  type={showCur ? 'text' : 'password'}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200 focus:border-indigo-500/50 outline-none"
                  placeholder="Enter current password"
                />
                <button type="button" onClick={() => setShowCur(!showCur)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200 focus:border-indigo-500/50 outline-none"
                  placeholder="Enter new password"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPw && (
                <div className="mt-2">
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: `${strength.pct}%` }} />
                  </div>
                  <p className={`text-xs mt-1 ${
                    strength.label === 'Strong' ? 'text-emerald-400' :
                    strength.label === 'Good' ? 'text-emerald-400' :
                    strength.label === 'Medium' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    Strength: {strength.label}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showCon ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200 focus:border-indigo-500/50 outline-none"
                  placeholder="Confirm new password"
                />
                <button type="button" onClick={() => setShowCon(!showCon)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showCon ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPw && newPw !== confirmPw && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2"
              >
                <Key className="w-4 h-4" />
                {saving ? 'Updating...' : 'Update Password'}
              </button>
              {status?.hasCustomPassword && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-bold rounded-xl border border-red-500/30 transition-all flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to Default
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  )
}
