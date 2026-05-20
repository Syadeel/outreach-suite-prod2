import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Inbox, Send, RefreshCw, CheckSquare, MessageSquare } from 'lucide-react';

export default function InboxTab() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetchRepliedLeads();
  }, []);

  const fetchRepliedLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('stage', 'replied')
        .order('updated_at', { ascending: false });
      
      if (!error && data) {
        setThreads(data);
        if (data.length > 0 && !selectedLead) {
          selectLeadThread(data[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectLeadThread = async (lead: any) => {
    setSelectedLead(lead);
    try {
      // Get all emails associated with this lead, sorted chronologically
      const { data, error } = await supabase
        .from('sent_emails')
        .select('*')
        .eq('lead_id', lead.id)
        .order('sent_at', { ascending: true });
      
      if (!error && data) {
        setMessages(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger reply check API
  const handlePollReplies = async () => {
    setPolling(true);
    try {
      await fetch('/api/poll-replies');
      await fetchRepliedLeads();
      if (selectedLead) {
        await selectLeadThread(selectedLead);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPolling(false);
    }
  };

  // Mark lead stage to closed/converted or interested
  const handleUpdateStage = async (stage: string) => {
    if (!selectedLead) return;
    await supabase.from('leads').update({ stage }).eq('id', selectedLead.id);
    fetchRepliedLeads();
    setSelectedLead((prev: any) => prev ? { ...prev, stage } : null);
  };

  // Send reply from the inbox
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedLead || messages.length === 0) return;
    setSending(true);

    try {
      // We will reply using the same inbox that sent the last message, or fall back to an active inbox
      const lastSentMsg = [...messages].reverse().find(m => m.inbox_id && m.status === 'sent');
      const inboxId = lastSentMsg?.inbox_id;

      if (!inboxId) {
        alert('Could not identify the originating sending inbox for this lead thread.');
        setSending(false);
        return;
      }

      // Call our direct SMTP reply API endpoint
      const res = await fetch('/api/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.id,
          inboxId,
          subject: `Re: ${lastSentMsg.subject}`,
          body: replyText,
          parentMessageId: lastSentMsg.message_id
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        setReplyText('');
        selectLeadThread(selectedLead); // Refresh messages list
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
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Inbox className="w-7 h-7 text-indigo-400" />
            Unified Inbox
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Monitor and manually respond to replies detected from your rotated Gmail accounts.
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

      {/* Grid Layout: Left sidebar (threads) & Right pane (thread chat) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[70vh]">
        
        {/* Thread List (Span 4) */}
        <div className="lg:col-span-4 glass-panel rounded-2xl border border-slate-800/60 flex flex-col overflow-hidden h-full">
          <div className="p-4 border-b border-slate-800 bg-slate-900/25 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Replied Leads ({threads.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2 space-y-1">
            {loading ? (
              <div className="p-6 text-center text-slate-500 text-sm">Loading threads...</div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No lead replies found. Keep sending!</div>
            ) : (
              threads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;
                return (
                  <button
                    key={lead.id}
                    onClick={() => selectLeadThread(lead)}
                    className={`w-full text-left p-4 rounded-xl transition-all ${
                      isSelected 
                        ? 'bg-indigo-600/10 border border-indigo-500/30' 
                        : 'hover:bg-slate-900/30 border border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-semibold text-white text-sm">{lead.first_name} {lead.last_name || ''}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold uppercase">
                        {lead.stage}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-1">{lead.company || 'No Company'}</div>
                    <div className="text-[10px] text-slate-500 mt-2">{lead.email}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation Pane (Span 8) */}
        <div className="lg:col-span-8 glass-panel rounded-2xl border border-slate-800/60 flex flex-col justify-between overflow-hidden h-full">
          {selectedLead ? (
            <>
              {/* Top Banner */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/25 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h3 className="font-bold text-white text-md">{selectedLead.first_name} {selectedLead.last_name || ''}</h3>
                  <p className="text-xs text-slate-400">{selectedLead.email} • {selectedLead.company || 'No Company'}</p>
                </div>
                
                {/* Pipeline Actions */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleUpdateStage('interested')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      selectedLead.stage === 'interested'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Interested
                  </button>
                  <button
                    onClick={() => handleUpdateStage('unsubscribed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      selectedLead.stage === 'unsubscribed'
                        ? 'bg-slate-500/20 border-slate-600 text-slate-400'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Unsubscribe
                  </button>
                </div>
              </div>

              {/* Chat Thread Timelines */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 text-sm">Retrieving conversation thread...</div>
                ) : (
                  messages.map((msg) => {
                    const isReply = msg.status === 'replied';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] ${isReply ? 'mr-auto' : 'ml-auto'}`}
                      >
                        <div className={`text-[10px] text-slate-500 mb-1 ${isReply ? 'text-left' : 'text-right'}`}>
                          {isReply ? 'Lead Reply' : 'Sent by Rotator'} • {new Date(msg.sent_at).toLocaleString()}
                        </div>
                        <div className={`p-4 rounded-2xl text-sm ${
                          isReply 
                            ? 'bg-slate-900 border border-slate-800 text-slate-200' 
                            : 'bg-indigo-600/25 border border-indigo-500/25 text-white'
                        }`}>
                          <div className="font-semibold text-xs border-b border-slate-800/80 pb-1.5 mb-2 opacity-80">
                            Subject: {msg.subject}
                          </div>
                          {/* Use simple block presentation for bodies */}
                          <div 
                            className="whitespace-pre-wrap leading-relaxed text-xs break-words overflow-hidden" 
                            dangerouslySetInnerHTML={{ __html: msg.body }} 
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Input Bar */}
              <form onSubmit={handleSendReply} className="p-4 border-t border-slate-800/80 bg-slate-950/20 flex gap-2 items-center">
                <input
                  type="text"
                  placeholder={`Manual reply to ${selectedLead.first_name}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl glass-input text-xs"
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
