'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart2, Mail, Eye, MousePointerClick, MessageSquare, RefreshCw, Users, AlertTriangle, Target, Filter, ChevronDown, CheckCircle2, Activity, Inbox, Clock, Shield } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts'
import s from './AnalyticsTab.module.css'

const COLORS = {
  primary: '#6366f1',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#f43f5e',
  info: '#0ea5e9',
  purple: '#8b5cf6',
  slate: '#64748b'
}

export default function AnalyticsTab() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'all'>('30d')
  const [loading, setLoading] = useState(true)
  const [campaignsStats, setCampaignsStats] = useState({ draft: 0, running: 0, completed: 0, total: 0 })
  const [leadsStats, setLeadsStats] = useState({ total: 0, enriched: 0, bounced: 0 })
  const [engagementStats, setEngagementStats] = useState({ sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 })
  const [timelineData, setTimelineData] = useState<any[]>([])
  const [inboxesHealth, setInboxesHealth] = useState<any[]>([])
  const [leadsData, setLeadsData] = useState<any[]>([])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className={s.tooltip}>
        <p className={s.tooltipLabel}>{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className={s.tooltipRow}>
            <div className={s.tooltipDot} style={{ backgroundColor: entry.color || entry.fill }} />
            <span className={s.tooltipName}>{entry.name}:</span>
            <span className={s.tooltipValue}>{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  useEffect(() => { fetchAnalytics() }, [timeframe]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const now = new Date()
      let startDate = new Date(0)
      if (timeframe === '7d') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      else if (timeframe === '30d') startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const { data: campaigns } = await supabase.from('campaigns').select('id, status, created_at')
      let draft = 0, running = 0, completed = 0
      campaigns?.forEach((c: any) => {
        if (c.status === 'draft') draft++
        else if (c.status === 'running') running++
        else completed++
      })
      setCampaignsStats({ draft, running, completed, total: campaigns?.length || 0 })

      const { data: leads } = await supabase.from('leads').select('id, created_at, custom_fields')
      let enriched = 0, bounced = 0
      const leadsByDate: Record<string, number> = {}
      leads?.forEach((l: any) => {
        const status = l.custom_fields?.enrichment_status?.toLowerCase() || ''
        if (status === 'good' || status === 'verified') enriched++
        else if (status.includes('bad') || status.includes('bounce') || status.includes('risky')) bounced++
        const created = new Date(l.created_at)
        if (created >= startDate) {
          const dateStr = created.toISOString().split('T')[0]
          leadsByDate[dateStr] = (leadsByDate[dateStr] || 0) + 1
        }
      })
      setLeadsStats({ total: leads?.length || 0, enriched, bounced })
      setLeadsData(Object.keys(leadsByDate).sort().map(date => ({ date, leads: leadsByDate[date] })))

      const { data: sentEmails } = await supabase.from('sent_emails').select('id, sent_at, opened_at, clicked_at, replied_at, bounced_at').gte('sent_at', startDate.toISOString())
      let sCount = 0, oCount = 0, cCount = 0, rCount = 0, bCount = 0
      const timelineMap: Record<string, any> = {}
      sentEmails?.forEach((e: any) => {
        sCount++
        if (e.opened_at) oCount++
        if (e.clicked_at) cCount++
        if (e.replied_at) rCount++
        if (e.bounced_at) bCount++
        const dateStr = new Date(e.sent_at).toISOString().split('T')[0]
        if (!timelineMap[dateStr]) timelineMap[dateStr] = { date: dateStr, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 }
        timelineMap[dateStr].sent++
        if (e.opened_at) timelineMap[dateStr].opened++
        if (e.clicked_at) timelineMap[dateStr].clicked++
        if (e.replied_at) timelineMap[dateStr].replied++
        if (e.bounced_at) timelineMap[dateStr].bounced++
      })
      setEngagementStats({ sent: sCount, opened: oCount, clicked: cCount, replied: rCount, bounced: bCount })
      setTimelineData(Object.values(timelineMap).sort((a: any, b: any) => a.date.localeCompare(b.date)))

      const { data: inboxes } = await supabase.from('inboxes').select('*')
      if (inboxes) setInboxesHealth(inboxes)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const getPercentage = (num: number, total: number) => total === 0 ? 0 : Math.round((num / total) * 100)

  const leadPieData = [
    { name: 'Enriched & Verified', value: leadsStats.enriched, color: COLORS.success },
    { name: 'Risky / Bounced', value: leadsStats.bounced, color: COLORS.warning },
    { name: 'Unverified', value: Math.max(0, leadsStats.total - leadsStats.enriched - leadsStats.bounced), color: COLORS.slate },
  ]

  const funnelData = [
    { name: 'Sent', value: engagementStats.sent, fill: COLORS.slate },
    { name: 'Opened', value: engagementStats.opened, fill: COLORS.info },
    { name: 'Clicked', value: engagementStats.clicked, fill: COLORS.purple },
    { name: 'Replied', value: engagementStats.replied, fill: COLORS.success },
  ]

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerIcon}><BarChart2 className={s.iconLg} /></div>
          <div>
            <h2 className={s.title}>Command Center</h2>
            <p className={s.subtitle}>Silicon Valley grade telemetry across your campaigns, leads, and outreach vectors.</p>
          </div>
        </div>
        <div className={s.headerRight}>
          <div className={s.selectWrapper}>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as any)} className={s.select}>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
            <Filter className={s.selectIcon} />
            <ChevronDown className={s.selectIconRight} />
          </div>
          <button onClick={fetchAnalytics} className={s.refreshBtn} title="Refresh">
            <RefreshCw className={`${s.iconMd} ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>
          <div className={s.loadingSpinner} />
          <p className={s.loadingText}>Aggregating telemetry...</p>
        </div>
      ) : (
        <div className={s.content}>
          {/* KPI Cards */}
          <div className={s.kpiGrid}>
            <div className={s.kpiCard}>
              <div className={s.kpiGlow} />
              <div className={s.kpiHeader}>
                <div>
                  <p className={s.kpiLabel}>Campaigns</p>
                  <h3 className={s.kpiValue}>{campaignsStats.total}</h3>
                </div>
                <div className={s.kpiIcon}><Target className={s.iconMd} /></div>
              </div>
              <div className={s.kpiFooter}>
                <span className={s.kpiStat}><span className={`${s.statusDot} ${s.statusDotEmerald}`} /> {campaignsStats.running} Active</span>
                <span className={s.kpiStat}><span className={`${s.statusDot} ${s.statusDotSlate}`} /> {campaignsStats.draft} Draft</span>
              </div>
            </div>

            <div className={s.kpiCard}>
              <div className={s.kpiGlow} />
              <div className={s.kpiHeader}>
                <div>
                  <p className={s.kpiLabel}>Database</p>
                  <h3 className={s.kpiValue}>{leadsStats.total}</h3>
                </div>
                <div className={`${s.kpiIcon} ${s.kpiIconSky}`}><Users className={s.iconMd} /></div>
              </div>
              <div className={s.kpiFooter}>
                <span className={s.kpiStatEmerald}><CheckCircle2 className={s.iconSm} /> {getPercentage(leadsStats.enriched, leadsStats.total)}% Enriched</span>
              </div>
            </div>

            <div className={s.kpiCard}>
              <div className={s.kpiGlow} />
              <div className={s.kpiHeader}>
                <div>
                  <p className={s.kpiLabel}>Emails Sent</p>
                  <h3 className={s.kpiValue}>{engagementStats.sent}</h3>
                </div>
                <div className={`${s.kpiIcon} ${s.kpiIconPurple}`}><Mail className={s.iconMd} /></div>
              </div>
              <div className={s.kpiFooter}>
                <span className={s.kpiStatRose}><AlertTriangle className={s.iconSm} /> {getPercentage(engagementStats.bounced, engagementStats.sent)}% Bounce Rate</span>
              </div>
            </div>

            <div className={s.kpiCard}>
              <div className={s.kpiGlow} />
              <div className={s.kpiHeader}>
                <div>
                  <p className={s.kpiLabel}>Meeting Reply Rate</p>
                  <h3 className={s.kpiValue}>{getPercentage(engagementStats.replied, engagementStats.sent)}%</h3>
                </div>
                <div className={`${s.kpiIcon} ${s.kpiIconEmerald}`}><MessageSquare className={s.iconMd} /></div>
              </div>
              <div className={s.kpiFooter}>
                <span className={s.kpiStatSky}><Eye className={s.iconSm} /> {getPercentage(engagementStats.opened, engagementStats.sent)}% Open Rate</span>
              </div>
            </div>
          </div>

          {/* Inbox Health */}
          {inboxesHealth.length > 0 && (
            <div className={s.section}>
              <div className={s.sectionHeader}>
                <div className={s.sectionTitle}><Shield className={s.iconSm} /> Inbox Health & Deliverability</div>
                <span className={s.sectionBadge}>{inboxesHealth.length} inboxes</span>
              </div>
              <div className={s.inboxGrid}>
                {inboxesHealth.map((ib: any) => {
                  const pct = ib.daily_limit > 0 ? Math.round((ib.sent_today / ib.daily_limit) * 100) : 0
                  const isCritical = pct >= 85
                  const isWarning = pct >= 60 && pct < 85
                  return (
                    <div key={ib.id} className={s.inboxCard}>
                      <div className={s.inboxHeader}>
                        <span className={s.inboxEmail}>{ib.email}</span>
                        <span className={`${s.badge} ${ib.status === 'active' ? s.badgeEmerald : ib.status === 'warmup' ? s.badgeAmber : s.badgeRose}`}>{ib.status || 'active'}</span>
                      </div>
                      <div className={s.inboxStats}>
                        <span><Inbox className={s.iconXs} /> {ib.sent_today}/{ib.daily_limit}</span>
                        {ib.last_sent_at && <span><Clock className={s.iconXs} /> {new Date(ib.last_sent_at).toLocaleDateString()}</span>}
                      </div>
                      <div className={s.progress}><div className={s.progressBar} style={{ width: `${pct}%`, background: isCritical ? '#f43f5e' : isWarning ? '#f59e0b' : '#10b981' }} /></div>
                      <div className={s.inboxFooter}>
                        <span className={isCritical ? s.textRose : isWarning ? s.textAmber : s.textEmerald}>{isCritical ? 'At limit' : isWarning ? 'Approaching limit' : 'Healthy'}</span>
                        <span className={s.textMuted}>{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Charts */}
          <div className={s.chartsGrid}>
            <div className={`${s.section} ${s.chartLarge}`}>
              <div className={s.chartHeader}>
                <h3 className={s.chartTitle}>Outreach Velocity & Engagement</h3>
                <p className={s.chartDesc}>Timeline of sent emails, opens, and link clicks.</p>
              </div>
              <div className={s.chartContainer}>
                {timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.slate} stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.slate} stopOpacity={0}/></linearGradient>
                        <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.info} stopOpacity={0.5}/><stop offset="95%" stopColor={COLORS.info} stopOpacity={0}/></linearGradient>
                        <linearGradient id="colorClicked" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.6}/><stop offset="95%" stopColor={COLORS.purple} stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickMargin={10} minTickGap={20} />
                      <YAxis stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '3 3' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                      <Area type="monotone" dataKey="sent" name="Sent" stroke={COLORS.slate} strokeWidth={2} fillOpacity={1} fill="url(#colorSent)" />
                      <Area type="monotone" dataKey="opened" name="Opened" stroke={COLORS.info} strokeWidth={2} fillOpacity={1} fill="url(#colorOpened)" />
                      <Area type="monotone" dataKey="clicked" name="Clicked" stroke={COLORS.purple} strokeWidth={2} fillOpacity={1} fill="url(#colorClicked)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className={s.emptyChart}>No engagement data in this timeframe.</div>}
              </div>
            </div>

            <div className={s.section}>
              <div className={s.chartHeader}>
                <h3 className={s.chartTitle}>Conversion Funnel</h3>
                <p className={s.chartDesc}>Overall outreach pipeline attrition.</p>
              </div>
              <div className={s.chartContainer}>
                {engagementStats.sent > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid horizontal={false} vertical={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} stroke="#cbd5e1" fontSize={12} width={60} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={35}>
                        {funnelData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className={s.emptyChart}>No data to build funnel.</div>}
              </div>
            </div>
          </div>

          <div className={s.chartsGrid}>
            <div className={s.section}>
              <div className={s.chartHeader}>
                <h3 className={s.chartTitle}>CRM Growth</h3>
                <p className={s.chartDesc}>Leads uploaded over time.</p>
              </div>
              <div className={s.chartContainer}>
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
                ) : <div className={s.emptyChart}>No leads added in this timeframe.</div>}
              </div>
            </div>

            <div className={s.section}>
              <div className={s.chartHeader}>
                <h3 className={s.chartTitle}>Database Health</h3>
                <p className={s.chartDesc}>Lead verification and enrichment status.</p>
              </div>
              <div className={s.pieContainer}>
                {leadsStats.total > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={leadPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                        {leadPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1', paddingTop: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className={s.emptyChart}>No leads to analyze.</div>}
                {leadsStats.total > 0 && (
                  <div className={s.pieCenter}>
                    <span className={s.pieCenterValue}>{leadsStats.total}</span>
                    <span className={s.pieCenterLabel}>Total</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
