'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Plus, 
  Mail, 
  Globe, 
  Shield, 
  Edit3, 
  Check, 
  X, 
  Trash2, 
  Power, 
  PowerOff,
  ExternalLink
} from 'lucide-react'

interface Inbox {
  id: string
  email: string
  provider: string
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_pass: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  sent_today: number
  daily_limit: number
  status: 'active' | 'inactive'
  created_at: string
}

export default function AccountTab() {
  const [inboxes, setInboxes] = useState<Inbox[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_pass: ''
  })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchInboxes()
  }, [])

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const fetchInboxes = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('inboxes')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setInboxes(data || [])
    }
    setLoading(false)
  }

  const handleConnectEmail = async () => {
    if (!newEmail.trim()) return
    
    setError(null)
    try {
      const response = await fetch(`/api/auth/google/url?email=${encodeURIComponent(newEmail.trim())}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get OAuth URL')
      }
      
      if (data.url) {
        // Store email so callback knows which inbox to update
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('pending_oauth_email', newEmail.trim())
        }
        window.location.href = data.url
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleEditClick = (inbox: Inbox) => {
    setEditingId(inbox.id)
    setEditForm({
      smtp_host: inbox.smtp_host || '',
      smtp_port: inbox.smtp_port?.toString() || '',
      smtp_user: inbox.smtp_user || '',
      smtp_pass: inbox.smtp_pass || ''
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleSaveSMTP = async (id: string) => {
    setSavingId(id)
    setError(null)
    
    const payload: Record<string, any> = {}
    if (editForm.smtp_host) payload.smtp_host = editForm.smtp_host
    if (editForm.smtp_port) payload.smtp_port = parseInt(editForm.smtp_port)
    if (editForm.smtp_user) payload.smtp_user = editForm.smtp_user
    if (editForm.smtp_pass) payload.smtp_pass = editForm.smtp_pass

    if (Object.keys(payload).length === 0) {
      setSavingId(null)
      return
    }

    try {
      const response = await fetch(`/api/inboxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to save SMTP settings')
      }

      setEditingId(null)
      showSuccess('SMTP settings updated')
      fetchInboxes()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const handleStatusToggle = async (id: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setError(null)
    
    try {
      const response = await fetch(`/api/inboxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to toggle status')
      }

      showSuccess(`Inbox ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
      fetchInboxes()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Are you sure you want to remove this inbox? This cannot be undone.')) return
    
    setError(null)
    try {
      const response = await fetch(`/api/inboxes/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to remove inbox')
      }

      showSuccess('Inbox removed')
      fetchInboxes()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-heading">Account Settings</h2>
          <p className="text-sm text-muted mt-1">
            Manage your connected business email inboxes
          </p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="glass-panel flex items-center gap-2 px-4 py-2 text-sm font-medium text-heading hover:bg-white/10 transition-colors rounded-xl border border-slate-800/60"
        >
          <Plus size={16} />
          Connect New Email
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <div className="glass-panel border border-red-500/40 rounded-xl p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="glass-panel border border-emerald-500/40 rounded-xl p-3 text-sm text-emerald-400">
          {successMessage}
        </div>
      )}

      {/* Inboxes Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mb-2"></div>
          <p className="text-muted text-sm">Loading inboxes...</p>
        </div>
      ) : inboxes.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-slate-800/60 p-12 text-center">
          <Mail size={48} className="mx-auto text-muted mb-4" />
          <h3 className="text-lg font-bold text-heading mb-2">No Inboxes Connected</h3>
          <p className="text-sm text-muted mb-4">
            Connect your first business email to start sending campaigns.
          </p>
          <button 
            onClick={() => setShowModal(true)}
            className="glass-panel inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-heading hover:bg-white/10 transition-colors rounded-xl border border-slate-800/60"
          >
            <Plus size={16} />
            Connect New Email
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inboxes.map(inbox => (
            <div key={inbox.id} className="glass-panel rounded-2xl border border-slate-800/60 p-4 space-y-3">
              {/* Header row */}
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-heading truncate">{inbox.email}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400 capitalize">
                      {inbox.provider || 'smtp'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                      inbox.status === 'active' 
                        ? 'bg-emerald-500/15 text-emerald-400' 
                        : 'bg-slate-500/15 text-slate-400'
                    }`}>
                      {inbox.status}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => handleStatusToggle(inbox.id, inbox.status)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    inbox.status === 'active' 
                      ? 'text-emerald-400 hover:bg-emerald-500/10' 
                      : 'text-slate-500 hover:bg-slate-500/10'
                  }`}
                  title={inbox.status === 'active' ? 'Deactivate' : 'Activate'}
                >
                  {inbox.status === 'active' ? <Power size={16} /> : <PowerOff size={16} />}
                </button>
              </div>

              {/* SMTP Status */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${inbox.smtp_host ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm text-body">SMTP</span>
                  {editingId === inbox.id ? (
                    <div className="ml-auto flex gap-1">
                      <button 
                        onClick={() => handleSaveSMTP(inbox.id)}
                        disabled={savingId === inbox.id}
                        className="p-1 text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        onClick={handleCancelEdit}
                        className="p-1 text-slate-400 hover:text-slate-300"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleEditClick(inbox)}
                      className="ml-auto p-1 text-muted hover:text-body transition-colors"
                      title="Edit SMTP settings"
                    >
                      <Edit3 size={14} />
                    </button>
                  )}
                </div>

                {editingId === inbox.id ? (
                  <div className="space-y-1.5 pl-4">
                    <input
                      className="glass-input w-full text-sm px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-heading placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                      placeholder="SMTP Host (e.g. smtp.zeptomail.com)"
                      value={editForm.smtp_host}
                      onChange={e => setEditForm({...editForm, smtp_host: e.target.value})}
                    />
                    <input
                      className="glass-input w-full text-sm px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-heading placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                      placeholder="SMTP Port (e.g. 587)"
                      value={editForm.smtp_port}
                      onChange={e => setEditForm({...editForm, smtp_port: e.target.value})}
                    />
                    <input
                      className="glass-input w-full text-sm px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-heading placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                      placeholder="SMTP Username"
                      value={editForm.smtp_user}
                      onChange={e => setEditForm({...editForm, smtp_user: e.target.value})}
                    />
                    <input
                      className="glass-input w-full text-sm px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-heading placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                      placeholder="SMTP Password"
                      type="password"
                      value={editForm.smtp_pass}
                      onChange={e => setEditForm({...editForm, smtp_pass: e.target.value})}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-muted pl-4">
                    {inbox.smtp_host ? (
                      <>
                        <div><span className="text-slate-500">Server:</span> {inbox.smtp_host}:{inbox.smtp_port || '587'}</div>
                        <div><span className="text-slate-500">User:</span> {inbox.smtp_user || '—'}</div>
                      </>
                    ) : (
                      <span className="text-slate-500 italic">Not configured — click edit to add SMTP</span>
                    )}
                  </div>
                )}
              </div>

              {/* OAuth Status */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${inbox.oauth_access_token ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-body">Gmail OAuth</span>
                <span className="text-xs text-muted ml-1">
                  {inbox.oauth_access_token ? 'Connected' : 'Not connected'}
                </span>
              </div>

              {/* Daily Usage */}
              <div className="pt-2 border-t border-slate-700/40">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-body">Sent today</span>
                  <span className="font-medium text-heading">
                    {inbox.sent_today} / {inbox.daily_limit}
                  </span>
                </div>
                <div className="mt-1.5 w-full h-1.5 bg-slate-700/40 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      (inbox.sent_today / inbox.daily_limit) > 0.9 
                        ? 'bg-red-500' 
                        : (inbox.sent_today / inbox.daily_limit) > 0.7 
                          ? 'bg-amber-500' 
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (inbox.sent_today / inbox.daily_limit) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Remove */}
              <button 
                onClick={() => handleRemove(inbox.id)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={12} />
                Remove inbox
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Connect Email Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="glass-panel rounded-2xl border border-slate-800/60 p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-heading">Connect New Email</h3>
              <button 
                onClick={() => { setShowModal(false); setError(null); }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-muted mb-4">
              Enter your business email address. You&apos;ll be redirected to Google to authorize OAuth access for reading replies.
            </p>

            <div className="space-y-4">
              <input
                className="glass-input w-full px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-heading placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
                placeholder="you@yourcompany.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnectEmail()}
              />

              {error && (
                <div className="text-sm text-red-400">{error}</div>
              )}

              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => { setShowModal(false); setError(null); }}
                  className="px-4 py-2 text-sm text-muted hover:text-body transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConnectEmail}
                  disabled={!newEmail.trim()}
                  className="glass-panel px-4 py-2 text-sm font-medium text-heading hover:bg-white/10 transition-colors rounded-xl border border-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Connect with Google
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
