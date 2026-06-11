'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Settings, 
  Clock, 
  Activity, 
  AlertTriangle, 
  Sun, 
  RefreshCw,
  Shield
} from 'lucide-react'

export default function AdvancedTab() {
  const [defaultLimit, setDefaultLimit] = useState(50)
  const [savingLimit, setSavingLimit] = useState(false)
  const [systemStatus, setSystemStatus] = useState({
    apiHealth: 'checking...',
    lastCron: 'Unknown',
    environment: 'production',
    inboxCount: 0,
    activeInboxCount: 0,
    totalSentToday: 0
  })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadSystemStatus()
    loadDefaultLimit()
  }, [])

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const loadSystemStatus = async () => {
    try {
      // Check API health
      const healthRes = await fetch('/api/inboxes')
      const apiHealthy = healthRes.ok

      // Get inbox stats
      const { data: inboxes } = await supabase
        .from('inboxes')
        .select('id, status, sent_today')

      const total = inboxes?.length || 0
      const active = inboxes?.filter(i => i.status === 'active').length || 0
      const sentToday = inboxes?.reduce((sum, i) => sum + (i.sent_today || 0), 0) || 0

      setSystemStatus({
        apiHealth: apiHealthy ? 'healthy' : 'unhealthy',
        lastCron: 'Check cron logs for details',
        environment: process.env.NODE_ENV || 'production',
        inboxCount: total,
        activeInboxCount: active,
        totalSentToday: sentToday
      })
    } catch (err) {
      setSystemStatus(prev => ({ ...prev, apiHealth: 'unreachable' }))
    }
  }

  const loadDefaultLimit = async () => {
    // Read the first inbox's daily_limit as a reference default
    const { data } = await supabase
      .from('inboxes')
      .select('daily_limit')
      .limit(1)
      .single()
    
    if (data?.daily_limit) {
      setDefaultLimit(data.daily_limit)
    }
  }

  const handleSaveLimit = async () => {
    setSavingLimit(true)
    setError(null)
    
    try {
      // Update all inboxes to the new default limit
      const { error: updateError } = await supabase
        .from('inboxes')
        .update({ daily_limit: defaultLimit })
        .neq('id', '00000000-0000-0000-0000-000000000000') // update all

      if (updateError) throw updateError

      showSuccess(`All inboxes updated to ${defaultLimit} daily limit`)
      loadSystemStatus()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingLimit(false)
    }
  }

  const handleClearCounters = async () => {
    if (!confirm('Are you sure you want to reset all sent_today counters to 0?')) return
    
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('inboxes')
        .update({ sent_today: 0 })
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (updateError) throw updateError

      showSuccess('All sent_today counters cleared')
      loadSystemStatus()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleResetLimits = async () => {
    if (!confirm('Are you sure you want to reset all inbox daily limits to default (50)?')) return
    
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('inboxes')
        .update({ daily_limit: 50 })
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (updateError) throw updateError

      setDefaultLimit(50)
      showSuccess('All inbox limits reset to 50')
      loadSystemStatus()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-heading">Advanced Settings</h2>
        <p className="text-sm text-muted mt-1">
          Global configuration and system management
        </p>
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

      {/* Daily Sending Limit */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="text-blue-400" size={20} />
          <div>
            <h3 className="text-lg font-bold text-heading">Default Daily Sending Limit</h3>
            <p className="text-xs text-muted mt-0.5">
              Applies to all inboxes. Each inbox will stop sending once it hits this daily limit.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            min="1"
            max="500"
            className="glass-input w-32 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-heading focus:outline-none focus:border-emerald-500/60 text-center"
            value={defaultLimit}
            onChange={e => setDefaultLimit(parseInt(e.target.value) || 0)}
          />
          <button 
            onClick={handleSaveLimit}
            disabled={savingLimit}
            className="glass-panel px-4 py-2 text-sm font-medium text-heading hover:bg-white/10 transition-colors rounded-xl border border-slate-800/60 disabled:opacity-50"
          >
            {savingLimit ? 'Saving...' : 'Apply to All'}
          </button>
        </div>
      </div>

      {/* Business Hours */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sun className="text-yellow-400" size={20} />
          <div>
            <h3 className="text-lg font-bold text-heading">Business Hours</h3>
            <p className="text-xs text-muted mt-0.5">
              Emails will only be sent during business hours (read-only for now)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-heading">
          <Clock size={16} className="text-muted" />
          <span className="font-medium">Mon-Fri, 9:00 AM — 5:00 PM</span>
          <span className="text-xs text-muted ml-2">(local time)</span>
        </div>
      </div>

      {/* System Status */}
      <div className="glass-panel rounded-2xl border border-slate-800/60 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="text-emerald-400" size={20} />
          <div>
            <h3 className="text-lg font-bold text-heading">System Status</h3>
            <p className="text-xs text-muted mt-0.5">
              Overview of the system health and statistics
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-body">API Health</span>
              <span className={`font-medium flex items-center gap-1.5 ${
                systemStatus.apiHealth === 'healthy' ? 'text-emerald-400' : 'text-red-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  systemStatus.apiHealth === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
                }`}></span>
                {systemStatus.apiHealth}
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-body">Environment</span>
              <span className="font-medium text-heading">{systemStatus.environment}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-body">Last Cron Run</span>
              <span className="font-medium text-heading">{systemStatus.lastCron}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-body">Total Inboxes</span>
              <span className="font-medium text-heading">{systemStatus.inboxCount}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-body">Active Inboxes</span>
              <span className="font-medium text-heading">{systemStatus.activeInboxCount}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-body">Total Sent Today</span>
              <span className="font-medium text-heading">{systemStatus.totalSentToday}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={loadSystemStatus}
          className="mt-4 flex items-center gap-2 text-sm text-muted hover:text-body transition-colors"
        >
          <RefreshCw size={14} />
          Refresh status
        </button>
      </div>

      {/* Danger Zone */}
      <div className="glass-panel rounded-2xl border border-red-500/30 p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-red-400" size={20} />
          <div>
            <h3 className="text-lg font-bold text-heading">Danger Zone</h3>
            <p className="text-xs text-muted mt-0.5">
              Destructive actions that affect all inboxes. Proceed with caution.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 rounded-xl bg-red-500/5 border border-red-500/10">
            <div>
              <div className="font-medium text-body">Clear sent_today counters</div>
              <div className="text-sm text-muted mt-0.5">
                Reset daily sending counters to 0 for ALL inboxes
              </div>
            </div>
            <button 
              onClick={handleClearCounters}
              className="glass-panel px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors rounded-xl border border-red-500/30 shrink-0 ml-4"
            >
              Clear Counters
            </button>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-red-500/5 border border-red-500/10">
            <div>
              <div className="font-medium text-body">Reset all inbox daily limits</div>
              <div className="text-sm text-muted mt-0.5">
                Set all inboxes back to 50 sends/day default
              </div>
            </div>
            <button 
              onClick={handleResetLimits}
              className="glass-panel px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors rounded-xl border border-red-500/30 shrink-0 ml-4"
            >
              Reset Limits
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
