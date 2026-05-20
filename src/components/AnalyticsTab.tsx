import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart2, Mail, Eye, MousePointerClick, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';

export default function AnalyticsTab() {
  const [stats, setStats] = useState({
    sent: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
  });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // 1. Fetch total sent count
      const { count: sentCount } = await supabase
        .from('sent_emails')
        .select('*', { count: 'exact', head: true });

      // 2. Fetch total opened
      const { count: openedCount } = await supabase
        .from('sent_emails')
        .select('*', { count: 'exact', head: true })
        .not('opened_at', 'is', null);

      // 3. Fetch total clicked
      const { count: clickedCount } = await supabase
        .from('sent_emails')
        .select('*', { count: 'exact', head: true })
        .not('clicked_at', 'is', null);

      // 4. Fetch total replied
      const { count: repliedCount } = await supabase
        .from('sent_emails')
        .select('*', { count: 'exact', head: true })
        .not('replied_at', 'is', null);

      setStats({
        sent: sentCount || 0,
        opened: openedCount || 0,
        clicked: clickedCount || 0,
        replied: repliedCount || 0,
      });

      // 5. Fetch recent events (open, click, replies logs)
      const { data: logs } = await supabase
        .from('sent_emails')
        .select(`
          id,
          subject,
          sent_at,
          opened_at,
          clicked_at,
          replied_at,
          lead:leads(first_name, last_name, company, email)
        `)
        .order('sent_at', { ascending: false })
        .limit(10);

      // Compile chronological event lists
      const events: any[] = [];
      if (logs) {
        logs.forEach(log => {
          const leadData = Array.isArray(log.lead) ? log.lead[0] : (log.lead as any);
          const leadName = `${leadData?.first_name || ''} ${leadData?.last_name || ''}`.trim() || leadData?.email || 'Prospect';
          
          if (log.replied_at) {
            events.push({
              id: `${log.id}-reply`,
              type: 'reply',
              title: `Replied: ${leadName}`,
              desc: `Responded to your pitch for ${leadData?.company || 'their company'}`,
              time: new Date(log.replied_at).getTime(),
              dateStr: new Date(log.replied_at).toLocaleString()
            });
          }
          if (log.clicked_at) {
            events.push({
              id: `${log.id}-click`,
              type: 'click',
              title: `Clicked Link: ${leadName}`,
              desc: `Clicked personalization video landing page for "${log.subject}"`,
              time: new Date(log.clicked_at).getTime(),
              dateStr: new Date(log.clicked_at).toLocaleString()
            });
          }
          if (log.opened_at) {
            events.push({
              id: `${log.id}-open`,
              type: 'open',
              title: `Opened Email: ${leadName}`,
              desc: `Opened outreach email: "${log.subject}"`,
              time: new Date(log.opened_at).getTime(),
              dateStr: new Date(log.opened_at).toLocaleString()
            });
          }
        });
      }

      // Sort compiled events by time descending
      events.sort((a, b) => b.time - a.time);
      setRecentEvents(events.slice(0, 10));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPercentage = (num: number, total: number) => {
    if (total === 0) return '0%';
    return `${Math.round((num / total) * 100)}%`;
  };

  return (
    <div className="space-y-8 p-1">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart2 className="w-7 h-7 text-indigo-400" />
            Campaign Analytics
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Real-time open rates, video landing page click-through metrics, and conversion percentages.
          </p>
        </div>

        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700/80 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700/50 transition-all"
        >
          <RefreshCw className="w-4 h-4 text-indigo-400" />
          Refresh Stats
        </button>
      </div>

      {loading ? (
        <div className="glass-panel p-12 text-center text-slate-400">Loading campaign statistics...</div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Sent */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800/60 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Outreach Sent</p>
                  <h3 className="text-3xl font-extrabold text-white mt-2">{stats.sent}</h3>
                </div>
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                  <Mail className="w-5 h-5" />
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-4">Lifetime rotated email volume</div>
            </div>

            {/* Opened */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800/60 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-medium">Open Rate</p>
                  <h3 className="text-3xl font-extrabold text-white mt-2">{getPercentage(stats.opened, stats.sent)}</h3>
                </div>
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl">
                  <Eye className="w-5 h-5" />
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-4">{stats.opened} total opens tracked</div>
            </div>

            {/* Clicked */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800/60 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-medium">Video CTR</p>
                  <h3 className="text-3xl font-extrabold text-white mt-2">{getPercentage(stats.clicked, stats.sent)}</h3>
                </div>
                <div className="p-3 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded-xl">
                  <MousePointerClick className="w-5 h-5" />
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-4">{stats.clicked} landing page clicks</div>
            </div>

            {/* Replied */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800/60 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-medium">Reply Rate</p>
                  <h3 className="text-3xl font-extrabold text-white mt-2">{getPercentage(stats.replied, stats.sent)}</h3>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-4">{stats.replied} campaign conversions logged</div>
            </div>

          </div>

          {/* Activity Feeds */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/60">
            <h3 className="text-md font-bold text-white mb-4">Recent Prospect Activity</h3>
            
            {recentEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No prospect activity recorded yet. Activity will appear once prospects open or click links.</div>
            ) : (
              <div className="space-y-4">
                {recentEvents.map((evt) => (
                  <div key={evt.id} className="flex justify-between items-center gap-4 bg-slate-950/20 p-4 rounded-xl border border-slate-900/60 hover:border-slate-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg border ${
                        evt.type === 'reply' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        evt.type === 'click' ? 'bg-pink-500/10 border-pink-500/20 text-pink-400' :
                        'bg-sky-500/10 border-sky-500/20 text-sky-400'
                      }`}>
                        {evt.type === 'reply' ? <MessageSquare className="w-4 h-4" /> :
                         evt.type === 'click' ? <MousePointerClick className="w-4 h-4" /> :
                         <Eye className="w-4 h-4" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{evt.title}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{evt.desc}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">{evt.dateStr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
