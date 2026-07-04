'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Inbox, Plus, Loader, RefreshCw, Mail, CheckCircle, AlertCircle, Trash2, Settings, X, LayoutGrid, List } from 'lucide-react'
import s from './InboxTab.module.css'
import { useToast } from '../components/Toast'

export default function InboxTab() {
  const { toast } = useToast()
  const [inboxes, setInboxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newSmtpHost, setNewSmtpHost] = useState('')
  const [newSmtpPort, setNewSmtpPort] = useState('587')
  const [newSmtpUser, setNewSmtpUser] = useState('')
  const [newSmtpPass, setNewSmtpPass] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') { const v = localStorage.getItem('inbox-view-mode'); if (v === 'grid' || v === 'list') return v }
    return 'grid'
  })

  useEffect(() => { fetchInboxes() }, [])
  useEffect(() => { localStorage.setItem('inbox-view-mode', viewMode) }, [viewMode])

  const fetchInboxes = async () => {
    try {
      const { data } = await supabase.from('inboxes').select('*').order('created_at', { ascending: false })
      if (data) setInboxes(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleAddInbox = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('inboxes').insert({ email: newEmail, smtp_host: newSmtpHost, smtp_port: parseInt(newSmtpPort), smtp_user: newSmtpUser, smtp_pass: newSmtpPass, status: 'active', daily_limit: 50, sent_today: 0 })
      if (error) { toast.error(error.message) } else { setShowAddModal(false); setNewEmail(''); setNewSmtpHost(''); setNewSmtpPort('587'); setNewSmtpUser(''); setNewSmtpPass(''); fetchInboxes() }
    } catch (err) { console.error(err) }
  }

  const handleDeleteInbox = async (id: string) => {
    if (!confirm('Delete this inbox?')) return
    await supabase.from('inboxes').delete().eq('id', id)
    fetchInboxes()
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    await supabase.from('inboxes').update({ status: currentStatus === 'active' ? 'paused' : 'active' }).eq('id', id)
    fetchInboxes()
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}><Inbox className={s.titleIcon} /> Inbox Management</h2>
          <p className={s.subtitle}>Connect and manage your email sending inboxes.</p>
        </div>
        <div className={s.headerActions}>
          <div className={s.viewToggle}>
            <button className={`${s.toggleBtn} ${viewMode === 'grid' ? s.toggleActive : ''}`} onClick={() => setViewMode('grid')} title="Grid view"><LayoutGrid className={s.iconSm} /></button>
            <button className={`${s.toggleBtn} ${viewMode === 'list' ? s.toggleActive : ''}`} onClick={() => setViewMode('list')} title="List view"><List className={s.iconSm} /></button>
          </div>
          <button onClick={() => setShowAddModal(true)} className={s.addBtn}><Plus className={s.iconSm} /> Add Inbox</button>
        </div>
      </div>

      {loading ? (
        <div className={s.loadingState}>
          <Loader className={s.loadingSpinner} />
          <span>Loading inboxes...</span>
        </div>
      ) : inboxes.length === 0 ? (
        <div className={s.emptyCard}>
          <Mail className={s.emptyIcon} />
          <h3 className={s.emptyTitle}>No Inboxes Connected</h3>
          <p className={s.emptyText}>Connect your first email inbox to start sending outreach campaigns.</p>
          <button onClick={() => setShowAddModal(true)} className={s.emptyBtn}>Connect Inbox</button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className={s.grid}>
          {inboxes.map((inbox) => (
            <div key={inbox.id} className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.cardInfo}>
                  <h3 className={s.cardEmail}>{inbox.email}</h3>
                  <span className={`${s.badge} ${inbox.status === 'active' ? s.badgeEmerald : inbox.status === 'warmup' ? s.badgeAmber : s.badgeRose}`}>{inbox.status || 'active'}</span>
                </div>
                <div className={s.cardActions}>
                  <button onClick={() => handleToggleStatus(inbox.id, inbox.status)} className={s.actionBtn}>{inbox.status === 'active' ? 'Pause' : 'Activate'}</button>
                  <button onClick={() => handleDeleteInbox(inbox.id)} className={s.deleteBtn}><Trash2 className={s.iconXs} /></button>
                </div>
              </div>
              <div className={s.cardStats}>
                <div className={s.statRow}><span>Sent Today</span><span className={s.statValue}>{inbox.sent_today || 0} / {inbox.daily_limit || 50}</span></div>
                <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${inbox.daily_limit ? Math.min(100, (inbox.sent_today / inbox.daily_limit) * 100) : 0}%` }} /></div>
              </div>
              <div className={s.cardFooter}>
                <div className={s.footerItem}>
                  <div className={`${s.statusDot} ${inbox.smtp_host ? s.statusDotEmerald : s.statusDotRose}`} />
                  <span>SMTP {inbox.smtp_host ? 'Connected' : 'Not configured'}</span>
                </div>
                <div className={s.footerItem}>
                  <div className={`${s.statusDot} ${inbox.oauth_access_token ? s.statusDotEmerald : s.statusDotRose}`} />
                  <span>Gmail OAuth {inbox.oauth_access_token ? 'Connected' : 'Not connected'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.list}>
          {inboxes.map((inbox) => (
            <div key={inbox.id} className={s.listRow}>
              <div className={s.listLeft}>
                <h3 className={s.cardEmail}>{inbox.email}</h3>
                <span className={`${s.badge} ${inbox.status === 'active' ? s.badgeEmerald : inbox.status === 'warmup' ? s.badgeAmber : s.badgeRose}`}>{inbox.status || 'active'}</span>
              </div>
              <div className={s.listMiddle}>
                <span className={s.statValue}>{inbox.sent_today || 0} / {inbox.daily_limit || 50}</span>
                <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${inbox.daily_limit ? Math.min(100, (inbox.sent_today / inbox.daily_limit) * 100) : 0}%` }} /></div>
              </div>
              <div className={s.listRight}>
                <div className={s.footerItem}>
                  <div className={`${s.statusDot} ${inbox.smtp_host ? s.statusDotEmerald : s.statusDotRose}`} />
                  <span>SMTP</span>
                </div>
                <div className={s.footerItem}>
                  <div className={`${s.statusDot} ${inbox.oauth_access_token ? s.statusDotEmerald : s.statusDotRose}`} />
                  <span>OAuth</span>
                </div>
              </div>
              <div className={s.listActions}>
                <button onClick={() => handleToggleStatus(inbox.id, inbox.status)} className={s.actionBtn}>{inbox.status === 'active' ? 'Pause' : 'Activate'}</button>
                <button onClick={() => handleDeleteInbox(inbox.id)} className={s.deleteBtn}><Trash2 className={s.iconXs} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className={s.modal}>
          <div className={s.modalContent}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Connect New Email</h3>
              <button onClick={() => setShowAddModal(false)} className={s.closeBtn}><X className={s.iconLg} /></button>
            </div>
            <form onSubmit={handleAddInbox} className={s.form}>
              <p className={s.formDesc}>Enter your SMTP credentials to connect a new sending inbox.</p>
              <div><label className={s.label}>Email Address *</label><input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={s.input} required /></div>
              <div className={s.formRow}>
                <div><label className={s.label}>SMTP Host *</label><input type="text" value={newSmtpHost} onChange={(e) => setNewSmtpHost(e.target.value)} className={s.input} required /></div>
                <div><label className={s.label}>Port</label><input type="number" value={newSmtpPort} onChange={(e) => setNewSmtpPort(e.target.value)} className={s.input} /></div>
              </div>
              <div><label className={s.label}>SMTP Username *</label><input type="text" value={newSmtpUser} onChange={(e) => setNewSmtpUser(e.target.value)} className={s.input} required /></div>
              <div><label className={s.label}>SMTP Password *</label><input type="password" value={newSmtpPass} onChange={(e) => setNewSmtpPass(e.target.value)} className={s.input} required /></div>
              <div className={s.formActions}>
                <button type="button" onClick={() => setShowAddModal(false)} className={s.cancelBtn}>Cancel</button>
                <button type="submit" className={s.saveBtn}>Connect Inbox</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
