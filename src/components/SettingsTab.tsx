import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Plus, AlertCircle, CheckCircle, RefreshCw, Activity, Clock, Shield } from 'lucide-react';

export default function SettingsTab() {
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState('zeptomail'); // 'zeptomail' or 'smtp2go'
  const [smtpPass, setSmtpPass] = useState('');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempLimit, setTempLimit] = useState<number>(50);

  useEffect(() => {
    fetchInboxes();
  }, []);

  const fetchInboxes = async () => {
    try {
      const { data, error } = await supabase
        .from('inboxes')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setInboxes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !smtpPass) return;
    setSaving(true);

    // Default configuration details based on SMTP provider choice
    const config = {
      email,
      provider,
      smtp_user: email, // typical SMTP login is the email itself
      smtp_pass: smtpPass,
      daily_limit: dailyLimit,
      smtp_host: provider === 'zeptomail' ? 'smtp.zeptomail.com' : 'smtp.smtp2go.com',
      smtp_port: provider === 'zeptomail' ? 587 : 587, // default secure TLS port
      status: 'active',
    };

    try {
      const { error } = await supabase.from('inboxes').insert(config);
      if (!error) {
        setEmail('');
        setSmtpPass('');
        fetchInboxes();
      } else {
        alert(error.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectOAuth = async (inboxEmail: string) => {
    try {
      const res = await fetch(`/api/auth/google/url?email=${encodeURIComponent(inboxEmail)}`);
      const data = await res.json();
      if (data.url) {
        // Redirect user to sign in with Google
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('OAuth initiation failed', err);
    }
  };

  const handleDeleteInbox = async (id: string) => {
    if (!confirm('Are you sure you want to remove this inbox?')) return;
    await supabase.from('inboxes').delete().eq('id', id);
    fetchInboxes();
  };

  const handleUpdateLimit = async (id: string, newLimit: number) => {
    setEditingId(null);
    try {
      const { error } = await supabase
        .from('inboxes')
        .update({ daily_limit: newLimit })
        .eq('id', id);
      if (!error) {
        fetchInboxes();
      } else {
        alert(error.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 p-1">
      {/* Tab Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-heading">Settings & Inboxes</h2>
        <p className="text-slate-400 text-sm mt-1">
          Manage your sending inboxes. Connect SMTP details for sending and sign in via Google OAuth to monitor replies.
        </p>
      </div>

      {/* Grid: Add Inbox & Active Inboxes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-1 glass-panel p-6 rounded-2xl border border-slate-800/60 h-fit">
          <h3 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            Add Sending Inbox
          </h3>

          <form onSubmit={handleAddInbox} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Gmail Account Email
              </label>
              <input
                type="email"
                placeholder="name@thecapitalacquisition.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                SMTP Provider Configuration
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider('zeptomail')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    provider === 'zeptomail'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  ZeptoMail (SMTP)
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('smtp2go')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    provider === 'smtp2go'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  SMTP2GO
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                SMTP App Password
              </label>
              <input
                type="password"
                placeholder="Paste SMTP authentication password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Enter your ZeptoMail Send Mail Token or SMTP2GO password.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Daily Sending Limit
              </label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseInt(e.target.value))}
                min="1"
                max="500"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-all shadow-md shadow-indigo-600/10 active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Connect Sending Inbox'}
            </button>
          </form>
        </div>

        {/* Right Column: List of Connected Inboxes */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            Connected Accounts ({inboxes.length})
          </h3>

          {loading ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              Loading connected accounts...
            </div>
          ) : inboxes.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-slate-400 border border-dashed border-slate-800">
              No sending accounts connected yet. Add one to get started!
            </div>
          ) : (
            <div className="space-y-4">
              {inboxes.map((inbox) => (
                <div
                  key={inbox.id}
                  className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-700/80 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-heading">{inbox.email}</span>
                      {/* Warmup/Status badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border ${
                        inbox.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        inbox.status === 'warmup' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                        inbox.status === 'paused' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {inbox.status || 'unknown'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {inbox.provider}
                      </span>
                      {inbox.oauth_refresh_token ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Reply Polling Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> OAuth Disconnected
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>Limit: {inbox.sent_today} /</span>
                      {editingId === inbox.id ? (
                        <input
                          type="number"
                          className="w-16 px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-heading text-xs font-semibold focus:outline-none focus:border-indigo-500"
                          value={tempLimit}
                          onChange={(e) => setTempLimit(parseInt(e.target.value) || 1)}
                          onBlur={() => handleUpdateLimit(inbox.id, tempLimit)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateLimit(inbox.id, tempLimit);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span 
                          className="underline decoration-dashed cursor-pointer text-indigo-400 hover:text-indigo-300 font-semibold"
                          title="Click to edit daily limit"
                          onClick={() => {
                            setEditingId(inbox.id);
                            setTempLimit(inbox.daily_limit);
                          }}
                        >
                          {inbox.daily_limit}
                        </span>
                      )}
                      <span>sent today</span>
                      <span className="text-slate-600">•</span>
                      <span>SMTP: {inbox.smtp_host}:{inbox.smtp_port}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* Warmup / Status toggle */}
                    <div className="flex border border-slate-700/60 rounded-lg overflow-hidden text-[10px]">
                      <button
                        onClick={async () => {
                          await supabase.from('inboxes').update({ status: 'active' }).eq('id', inbox.id);
                          fetchInboxes();
                        }}
                        className={`px-2.5 py-2 font-semibold transition-all ${inbox.status === 'active' ? 'bg-emerald-600/30 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        Active
                      </button>
                      <button
                        onClick={async () => {
                          await supabase.from('inboxes').update({ status: 'warmup' }).eq('id', inbox.id);
                          fetchInboxes();
                        }}
                        className={`px-2.5 py-2 font-semibold transition-all border-x border-slate-700/60 ${inbox.status === 'warmup' ? 'bg-amber-600/30 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        Warmup
                      </button>
                      <button
                        onClick={async () => {
                          await supabase.from('inboxes').update({ status: 'paused' }).eq('id', inbox.id);
                          fetchInboxes();
                        }}
                        className={`px-2.5 py-2 font-semibold transition-all ${inbox.status === 'paused' ? 'bg-rose-600/30 text-rose-400' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        Paused
                      </button>
                    </div>
                    {!inbox.oauth_refresh_token && (
                      <button
                        onClick={() => handleConnectOAuth(inbox.email)}
                        className="flex-1 md:flex-initial px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-all"
                      >
                        Authorize Gmail OAuth
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteInbox(inbox.id)}
                      className="px-3 py-2 border border-rose-500/30 hover:border-rose-500 text-rose-400 text-xs font-semibold rounded-lg transition-all hover:bg-rose-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
