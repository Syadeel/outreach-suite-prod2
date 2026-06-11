'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Inbox, Send, RefreshCw, CheckSquare, MessageSquare, Search, X } from 'lucide-react';

interface SentEmail {
  id: string;
  lead_id: string;
  inbox_id?: string | null;
  subject: string;
  body: string;
  status: string;
  sent_at: string;
  message_id?: string | null;
}

interface Thread {
  lead: any;
  lastMessage?: SentEmail | null;
}

// Safe HTML renderer — strips tags, prevents XSS
function safeText(html: string): string {
  if (!html) return '';
  // Replace common block tags with spaces
  let text = html.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Decode common entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return text.trim();
}

function formatDate(d: string | null | undefined) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const STAGES = ['All', 'replied', 'interested', 'closed', 'unsubscribed'] as const;

export default function InboxTab() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filteredThreads, setFilteredThreads] = useState<Thread[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [messages, setMessages] = useState<SentEmail[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [polling, setPolling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [autoPolling, setAutoPolling] = useState(false);

  const syncDisabledUntil = useRef<number>(0);
  const replyEndRef = useRef<HTMLDivElement>(null);

  // ─── Initial fetch ───
  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-poll every 30 seconds ───
  useEffect(() => {
    const interval = setInterval(async () => {
      setAutoPolling(true);
      try {
        await fetch('/api/poll-replies');
        await fetchThreads();
      } catch { /* silent */ }
      setAutoPolling(false);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ─── Supabase Realtime subscription ───
  useEffect(() => {
    const channel = supabase
      .channel('inbox-replied-leads')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: 'stage=eq.replied' },
        () => { fetchThreads() }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel) }
  }, []);

  // ─── Keyboard shortcut: Escape deselects ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedLead(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Filter threads when search or stage changes ───
  useEffect(() => {
    let result = [...threads];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        (t.lead.first_name?.toLowerCase() || '').includes(q) ||
        (t.lead.last_name?.toLowerCase() || '').includes(q) ||
        t.lead.email?.toLowerCase().includes(q) ||
        (t.lead.company?.toLowerCase() || '').includes(q)
      );
    }
    if (stageFilter !== 'All') {
      result = result.filter(t => t.lead.stage === stageFilter);
    }
    setFilteredThreads(result);
  }, [threads, searchQuery, stageFilter]);

  // ─── Scroll to bottom when messages change ───
  useEffect(() => {
    replyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Fetch replied leads + their last message ───
  const fetchThreads = async () => {
    try {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .in('stage', ['replied', 'interested', 'closed', 'unsubscribed'])
        .order('updated_at', { ascending: false });

      if (error || !leads) {
        setLoading(false);
        return;
      }

      // Fetch last sent email per lead for preview snippets
      const leadIds = leads.map(l => l.id);
      const { data: sentEmails } = await supabase
        .from('sent_emails')
        .select('id, lead_id, subject, body, status, sent_at')
        .in('lead_id', leadIds)
        .order('sent_at', { ascending: false });

      const emailMap = new Map<string, SentEmail>();
      (sentEmails || []).forEach(email => {
        if (!emailMap.has(email.lead_id)) emailMap.set(email.lead_id, email);
      });

      const threadData: Thread[] = leads.map(lead => ({
        lead,
        lastMessage: emailMap.get(lead.id) || null,
      }));

      setThreads(threadData);

      // Mark all as unread on first load
      if (threads.length === 0) {
        setUnreadIds(new Set(leadIds));
      }

      // Auto-select first if none selected
      if (threadData.length > 0 && !selectedLead) {
        selectLead(threadData[0].lead);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectLead = async (lead: any) => {
    setSelectedLead(lead);
    setUnreadIds(prev => { const n = new Set(prev); n.delete(lead.id); return n; });
    try {
      const { data, error } = await supabase
        .from('sent_emails')
        .select('*')
        .eq('lead_id', lead.id)
        .order('sent_at', { ascending: true });

      if (!error && data) setMessages(data);
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Sync Gmail Replies (debounced) ───
  const handlePollReplies = async () => {
    const now = Date.now();
    if (now < syncDisabledUntil.current) return;
    syncDisabledUntil.current = now + 5000; // 5s debounce

    setPolling(true);
    try {
      await fetch('/api/poll-replies');
      await fetchThreads();
      if (selectedLead) {
        const { data } = await supabase
          .from('sent_emails')
          .select('*')
          .eq('lead_id', selectedLead.id)
          .order('sent_at', { ascending: true });
        if (data) setMessages(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPolling(false);
    }
  };

  // ─── Mark lead stage ───
  const handleUpdateStage = async (stage: string) => {
    if (!selectedLead) return;
    await supabase.from('leads').update({ stage }).eq('id', selectedLead.id);
    fetchThreads();
    setSelectedLead((prev: any) => prev ? { ...prev, stage } : null);
  };

  // ─── Send reply ───
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedLead || messages.length === 0) return;
    setSending(true);

    try {
      const lastSentMsg = [...messages].reverse().find(m => m.inbox_id && m.status === 'sent');
      const inboxId = lastSentMsg?.inbox_id;

      if (!inboxId) {
        alert('Could not identify the originating sending inbox for this lead thread.');
        setSending(false);
        return;
      }

      const res = await fetch('/api/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.id,
          inboxId,
          subject: `Re: ${lastSentMsg.subject}`,
          body: replyText,
          parentMessageId: lastSentMsg.message_id,
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        setReplyText('');
        selectLead(selectedLead);
      } else {
        alert(data.error || 'Failed to dispatch reply.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-heading flex items-center gap-2">
            <Inbox className="w-7 h-7 text-indigo-400" />
            Unified Inbox
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Monitor and respond to replies detected from your rotated Gmail accounts.
            {autoPolling && <span className="ml-2 text-indigo-400 text-xs">Auto-polling...</span>}
          </p>
        </div>
        <button
          onClick={handlePollReplies}
          disabled={polling}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700/80 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700/50 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${polling ? 'animate-spin' : ''}`} />
          {polling ? 'Syncing...' : 'Sync Gmail Replies'}
        </button>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email, company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl glass-input text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {STAGES.map(stage => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                stageFilter === stage
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                  : 'border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {stage === 'All' ? 'All' : stage.charAt(0).toUpperCase() + stage.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[65vh]">
        {/* Thread List */}
        <div className="lg:col-span-4 glass-panel rounded-2xl border border-slate-800/60 flex flex-col overflow-hidden h-full">
          <div className="p-3 border-b border-slate-800 bg-slate-900/25 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Threads ({filteredThreads.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {loading ? (
              // Loading skeleton
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse space-y-2">
                  <div className="flex justify-between">
                    <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                    <div className="h-3 bg-slate-800 rounded w-10"></div>
                  </div>
                  <div className="h-3 bg-slate-800 rounded w-2/3"></div>
                  <div className="h-3 bg-slate-800 rounded w-full"></div>
                </div>
              ))
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                {searchQuery || stageFilter !== 'All'
                  ? 'No threads match your filters.'
                  : 'No lead replies found. Keep sending!'}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = selectedLead?.id === thread.lead.id;
                const isUnread = unreadIds.has(thread.lead.id);
                return (
                  <button
                    key={thread.lead.id}
                    onClick={() => selectLead(thread.lead)}
                    className={`w-full text-left p-4 transition-all ${
                      isSelected
                        ? 'bg-indigo-600/10 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-900/30 border-l-4 border-transparent'
                    } ${isUnread ? 'bg-slate-800/30' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className={`font-semibold text-sm ${isUnread ? 'text-heading' : 'text-slate-300'} ${isUnread ? '' : ''}`}>
                        {isUnread && <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1.5"></span>}
                        {thread.lead.first_name} {thread.lead.last_name || ''}
                      </h4>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {formatDate(thread.lead.updated_at)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">{thread.lead.email}</div>
                    {thread.lastMessage && (
                      <div className="text-[11px] text-slate-500 truncate mt-1 leading-relaxed">
                        {safeText(thread.lastMessage.body).substring(0, 80)}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {thread.lead.company && (
                        <span className="text-[10px] text-slate-600">{thread.lead.company}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        thread.lead.stage === 'interested'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : thread.lead.stage === 'closed'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : thread.lead.stage === 'unsubscribed'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}>
                        {thread.lead.stage}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation Pane */}
        <div className="lg:col-span-8 glass-panel rounded-2xl border border-slate-800/60 flex flex-col justify-between overflow-hidden h-full">
          {selectedLead ? (
            <>
              {/* Banner */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/25 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h3 className="font-bold text-heading text-md">{selectedLead.first_name} {selectedLead.last_name || ''}</h3>
                  <p className="text-xs text-slate-400">{selectedLead.email} • {selectedLead.company || 'No Company'}</p>
                </div>
                <div className="flex gap-1.5">
                  {['interested', 'closed', 'unsubscribed'].map(stage => (
                    <button
                      key={stage}
                      onClick={() => handleUpdateStage(stage)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        selectedLead.stage === stage
                          ? stage === 'interested'
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                            : stage === 'closed'
                            ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                            : 'bg-red-500/10 border-red-500 text-red-400'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">Retrieving conversation thread...</div>
                ) : (
                  messages.map((msg) => {
                    const isReply = msg.status === 'replied';
                    return (
                      <div key={msg.id} className={`flex flex-col max-w-[85%] ${isReply ? 'mr-auto' : 'ml-auto'}`}>
                        <div className={`text-[10px] text-slate-500 mb-1 ${isReply ? 'text-left' : 'text-right'}`}>
                          {isReply ? 'Lead Reply' : 'Sent by Rotator'} • {formatDate(msg.sent_at)}
                        </div>
                        <div className={`p-3.5 rounded-2xl text-sm ${
                          isReply
                            ? 'bg-slate-900 border border-slate-800 text-slate-200'
                            : 'bg-indigo-600/25 border border-indigo-500/25 text-white'
                        }`}>
                          <div className="font-semibold text-xs border-b border-slate-800/80 pb-1.5 mb-2 opacity-80">
                            Subject: {msg.subject}
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed text-xs break-words">
                            {safeText(msg.body)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={replyEndRef} />
              </div>

              {/* Reply Input */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-slate-800/80 bg-slate-950/20 flex gap-2 items-center">
                <input
                  type="text"
                  placeholder={`Reply to ${selectedLead.first_name}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl glass-input text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2 p-6">
              <MessageSquare className="w-12 h-12 text-slate-700" />
              <p className="text-sm">Select a thread from the sidebar to read details and reply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
