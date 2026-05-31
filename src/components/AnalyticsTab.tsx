import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart2, Mail, Eye, MousePointerClick, MessageSquare, RefreshCw, Users, AlertTriangle, Target, Filter, ChevronDown, CheckCircle2, Activity, Inbox, Clock, Shield } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';

// Silicon Valley premium styling tokens
const COLORS = {
  primary: '#6366f1', // indigo-500
  success: '#10b981', // emerald-500
  warning: '#f59e0b', // amber-500
  danger: '#f43f5e',  // rose-500
  info: '#0ea5e9',    // sky-500
  purple: '#8b5cf6',  // violet-500
  pink: '#ec4899',    // pink-500
  slate: '#64748b'    // slate-500
};

export default function AnalyticsTab() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'all'>('30d');
  const [loading, setLoading] = useState(true);
  
  // States
  const [leadsData, setLeadsData] = useState<any[]>([]);
  const [campaignsStats, setCampaignsStats] = useState({ draft: 0, running: 0, completed: 0, total: 0 });
  const [leadsStats, setLeadsStats] = useState({ total: 0, enriched: 0, bounced: 0 });
  const [engagementStats, setEngagementStats] = useState({ sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 });
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [inboxesHealth, setInboxesHealth] = useState<any[]>([]);
  
  // Custom Tooltip component for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-panel p-4 rounded-xl border border-slate-700 shadow-2xl backdrop-blur-xl bg-slate-900/90 z-50">
          <p className="text-slate-300 font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm mt-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="text-slate-400 capitalize">{entry.name}:</span>
              <span className="text-heading font-bold">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeframe]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate = new Date(0); // all time
      
      if (timeframe === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeframe === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // --- 1. Fetch Campaigns ---
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, status, created_at');
        
      let draft = 0, running = 0, completed = 0;
      if (campaigns) {
        campaigns.forEach((c: any) => {
          if (c.status === 'draft') draft++;
          else if (c.status === 'running') running++;
          else completed++;
        });
      }
      setCampaignsStats({ draft, running, completed, total: campaigns?.length || 0 });

      // --- 2. Fetch Leads ---
      const { data: leads } = await supabase
        .from('leads')
        .select('id, created_at, custom_fields');
      
      let enriched = 0, bounced = 0;
      const leadsByDate: Record<string, number> = {};

      if (leads) {
        leads.forEach((l: any) => {
          // Count Enrichment
          const status = l.custom_fields?.enrichment_status?.toLowerCase() || '';
          if (status === 'good' || status === 'verified') enriched++;
          else if (status.includes('bad') || status.includes('bounce') || status.includes('risky')) bounced++;

          // Group by Date for timeline
          const created = new Date(l.created_at);
          if (created >= startDate) {
            const dateStr = created.toISOString().split('T')[0];
            leadsByDate[dateStr] = (leadsByDate[dateStr] || 0) + 1;
          }
        });
      }
      setLeadsStats({ total: leads?.length || 0, enriched, bounced });
      
      const leadsTimelineArr = Object.keys(leadsByDate).sort().map(date => ({
        date,
        leads: leadsByDate[date]
      }));
      setLeadsData(leadsTimelineArr);

      // --- 3. Fetch Engagement (sent_emails) ---
      const { data: sentEmails } = await supabase
        .from('sent_emails')
        .select('id, sent_at, opened_at, clicked_at, replied_at, bounced_at')
        .gte('sent_at', startDate.toISOString());

      let sCount = 0, oCount = 0, cCount = 0, rCount = 0, bCount = 0;
      const timelineMap: Record<string, any> = {};

      if (sentEmails) {
        sentEmails.forEach((e: any) => {
          sCount++;
          if (e.opened_at) oCount++;
          if (e.clicked_at) cCount++;
          if (e.replied_at) rCount++;
          if (e.bounced_at) bCount++;

          const dateStr = new Date(e.sent_at).toISOString().split('T')[0];
          if (!timelineMap[dateStr]) {
            timelineMap[dateStr] = { date: dateStr, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
          }
          timelineMap[dateStr].sent++;
          if (e.opened_at) timelineMap[dateStr].opened++;
          if (e.clicked_at) timelineMap[dateStr].clicked++;
          if (e.replied_at) timelineMap[dateStr].replied++;
          if (e.bounced_at) timelineMap[dateStr].bounced++;
        });
      }

      setEngagementStats({ sent: sCount, opened: oCount, clicked: cCount, replied: rCount, bounced: bCount });
      
      const engagementTimelineArr = Object.values(timelineMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
      setTimelineData(engagementTimelineArr);

      // --- 4. Fetch Inbox Health (PlusVibe-style) ---
      const { data: inboxes } = await supabase
        .from('inboxes')
        .select('*');
      if (inboxes) {
        setInboxesHealth(inboxes);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPercentage = (num: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((num / total) * 100);
  };

  // Pie chart data for Lead Enrichment
  const leadPieData = [
    { name: 'Enriched & Verified', value: leadsStats.enriched, color: COLORS.success },
    { name: 'Risky / Bounced', value: leadsStats.bounced, color: COLORS.warning },
    { name: 'Unverified / Unknown', value: Math.max(0, leadsStats.total - leadsStats.enriched - leadsStats.bounced), color: COLORS.slate },
  ];

  // Funnel data
  const funnelData = [
    { name: 'Sent', value: engagementStats.sent, fill: COLORS.slate },
    { name: 'Opened', value: engagementStats.opened, fill: COLORS.info },
    { name: 'Clicked', value: engagementStats.clicked, fill: COLORS.purple },
    { name: 'Replied', value: engagementStats.replied, fill: COLORS.success },
  ];

  return (
    <div className="space-y-8 p-1 pb-20 animate-fadeIn">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <BarChart2 className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
              Command Center
            </h2>
          </div>
          <p className="text-slate-400 text-sm font-medium">
            Silicon Valley grade telemetry across your campaigns, leads, and outreach vectors.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Timeframe Selector */}
          <div className="relative">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="appearance-none pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/50 rounded-xl text-sm font-bold text-slate-200 focus:ring-2 focus:ring-indigo-500/50 cursor-pointer transition-all hover:bg-slate-800"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          </div>

          <button
            onClick={fetchAnalytics}
            className="flex items-center justify-center p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Aggregating telemetry...</p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* --- TOP ROW KPI CARDS --- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {/* Campaigns Card */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 hover:border-indigo-500/30 transition-all group overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Campaigns</p>
                  <h3 className="text-3xl font-black text-heading mt-1">{campaignsStats.total}</h3>
                </div>
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <Target className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {campaignsStats.running} Active</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> {campaignsStats.draft} Draft</span>
              </div>
            </div>

            {/* Total Leads Card */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 hover:border-sky-500/30 transition-all group overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Database</p>
                  <h3 className="text-3xl font-black text-heading mt-1">{leadsStats.total}</h3>
                </div>
                <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-400">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> {getPercentage(leadsStats.enriched, leadsStats.total)}% Enriched
                </span>
              </div>
            </div>

            {/* Outbound Volume */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 hover:border-purple-500/30 transition-all group overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Emails Sent</p>
                  <h3 className="text-3xl font-black text-heading mt-1">{engagementStats.sent}</h3>
                </div>
                <div className="p-2.5 bg-purple-500/10 rounded-xl text-purple-400">
                  <Mail className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1 text-rose-400">
                  <AlertTriangle className="w-3 h-3" /> {getPercentage(engagementStats.bounced, engagementStats.sent)}% Bounce Rate
                </span>
              </div>
            </div>

            {/* Conversion Rate */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 hover:border-emerald-500/30 transition-all group overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Meeting Reply Rate</p>
                  <h3 className="text-3xl font-black text-heading mt-1">{getPercentage(engagementStats.replied, engagementStats.sent)}%</h3>
                </div>
                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1 text-sky-400">
                  <Eye className="w-3 h-3" /> {getPercentage(engagementStats.opened, engagementStats.sent)}% Open Rate
                </span>
              </div>
            </div>
          </div>

          {/* --- INBOX HEALTH (PlusVibe-style deliverability dashboard) --- */}
          {inboxesHealth.length > 0 && (
            <div className="glass-panel rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-heading">Inbox Health & Deliverability</h3>
                </div>
                <span className="text-[10px] text-slate-500">{inboxesHealth.length} inboxes</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inboxesHealth.map((ib: any) => {
                  const pct = ib.daily_limit > 0 ? Math.round((ib.sent_today / ib.daily_limit) * 100) : 0;
                  const isHealthy = pct < 60;
                  const isWarning = pct >= 60 && pct < 85;
                  const isCritical = pct >= 85;
                  return (
                    <div key={ib.id} className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-heading truncate max-w-[160px]">{ib.email}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ib.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                          ib.status === 'warmup' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                          'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}>
                          {ib.status || 'active'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1"><Inbox className="w-3 h-3" /> {ib.sent_today}/{ib.daily_limit}</span>
                        {ib.last_sent_at && (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ib.last_sent_at).toLocaleDateString()}</span>
                        )}
                      </div>
                      {/* Capacity bar */}
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className={isCritical ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'}>
                          {isCritical ? 'At limit — rotate needed' : isWarning ? 'Approaching limit' : 'Healthy'}
                        </span>
                        <span className="text-slate-500">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- MAIN CHARTS ROW --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Outreach Trajectory Area Chart */}
            <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-700/50 flex flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-heading">Outreach Velocity & Engagement</h3>
                <p className="text-xs text-slate-400 mt-1">Timeline of sent emails, opens, and link clicks.</p>
              </div>
              <div className="flex-1 w-full h-[300px]">
                {timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.slate} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={COLORS.slate} stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.5}/>
                          <stop offset="95%" stopColor={COLORS.info} stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorClicked" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.6}/>
                          <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickMargin={10} minTickGap={20} />
                      <YAxis stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '3 3' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                      <Area type="monotone" dataKey="sent" name="Sent" stroke={COLORS.slate} strokeWidth={2} fillOpacity={1} fill="url(#colorSent)" />
                      <Area type="monotone" dataKey="opened" name="Opened" stroke={COLORS.info} strokeWidth={2} fillOpacity={1} fill="url(#colorOpened)" />
                      <Area type="monotone" dataKey="clicked" name="Clicked Link" stroke={COLORS.purple} strokeWidth={2} fillOpacity={1} fill="url(#colorClicked)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-sm">No engagement data in this timeframe.</div>
                )}
              </div>
            </div>

            {/* Funnel / Conversion Bar Chart */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 flex flex-col">
              <div className="mb-2">
                <h3 className="text-lg font-bold text-heading">Conversion Funnel</h3>
                <p className="text-xs text-slate-400 mt-1">Overall outreach pipeline attrition.</p>
              </div>
              <div className="flex-1 w-full h-[250px] relative flex flex-col items-center justify-center mt-6">
                {engagementStats.sent > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid horizontal={false} vertical={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} stroke="#cbd5e1" fontSize={12} width={60} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={35}>
                        {funnelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-sm">No data to build funnel.</div>
                )}
              </div>
            </div>

          </div>

          {/* --- SECONDARY CHARTS ROW --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Leads Growth Bar Chart */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 h-[320px] flex flex-col">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-heading">CRM Growth</h3>
                <p className="text-xs text-slate-400 mt-1">Leads uploaded over time.</p>
              </div>
              <div className="flex-1 w-full">
                {leadsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadsData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickMargin={10} minTickGap={30} />
                      <YAxis stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="leads" name="Leads Uploaded" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-sm">No leads added in this timeframe.</div>
                )}
              </div>
            </div>

            {/* Enrichment Quality Pie Chart */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 h-[320px] flex flex-col">
              <div className="mb-0">
                <h3 className="text-lg font-bold text-heading">Database Health</h3>
                <p className="text-xs text-slate-400 mt-1">Lead verification and enrichment status.</p>
              </div>
              <div className="flex-1 w-full relative">
                {leadsStats.total > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={leadPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {leadPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1', paddingTop: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-sm">No leads to analyze.</div>
                )}
                {/* Center text in donut */}
                {leadsStats.total > 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-20px]">
                    <span className="text-2xl font-black text-heading">{leadsStats.total}</span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total</span>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
