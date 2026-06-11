'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Copy, Star, ChevronDown, ChevronRight, Save, Eye, X } from 'lucide-react'

interface LandingPageTemplate {
  id: string
  name: string
  is_default: boolean
  brand_title: string | null
  brand_logo_url: string | null
  brand_color: string | null
  badge_text: string | null
  hero_heading: string | null
  hero_subheading: string | null
  hero_body: string | null
  cta_text: string | null
  cta_url: string | null
  cta_description: string | null
  calendar_embed_code: string | null
  calendar_heading: string | null
  social_proof_heading: string | null
  social_proof_logos: string[] | null
  why_matters_heading: string | null
  why_matters_subheading: string | null
  why_matters_body: string | null
  footer_text: string | null
  footer_powered_by: string | null
  custom_css: string | null
  created_at: string
  updated_at: string
}

const DEFAULT_TEMPLATE: Partial<LandingPageTemplate> = {
  name: 'New Template',
  brand_title: 'Capital Acquisition',
  brand_color: '#4F46E5',
  badge_text: 'Personalized Video Walkthrough',
  hero_heading: 'Hey {{first_name}} 👋',
  hero_subheading: 'Tailored for {{company}}',
  hero_body: 'I put together this personalized video for you and the team at {{company}}.',
  cta_text: 'Book a 15-Min Call',
  cta_description: 'Schedule a quick discovery call below:',
  calendar_heading: 'Schedule a time to chat',
  social_proof_heading: 'Trusted by growth teams everywhere',
  social_proof_logos: ['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX'],
  why_matters_heading: "This isn't a generic pitch, {{first_name}}.",
  why_matters_subheading: "It was built specifically for what you're building at {{company}}.",
  why_matters_body: 'We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.',
  footer_text: '© {{year}} {{brand_title}}. All rights reserved.',
  footer_powered_by: 'Powered by {{brand_title}}',
  is_default: false,
}

function applyVars(text: string | null, firstName = 'John', company = 'Acme Corp', brandTitle = 'Capital Acquisition'): string {
  if (!text) return ''
  const year = String(new Date().getFullYear())
  return text
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{company\}\}/g, company)
    .replace(/\{\{brand_title\}\}/g, brandTitle)
    .replace(/\{\{year\}\}/g, year)
}

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<LandingPageTemplate[]>([])
  const [selected, setSelected] = useState<LandingPageTemplate | null>(null)
  const [editing, setEditing] = useState<LandingPageTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    branding: true, hero: false, cta: false, calendar: false, social: false, why: false, footer: false, css: false,
  })
  const [previewFirstName, setPreviewFirstName] = useState('John')
  const [previewCompany, setPreviewCompany] = useState('Acme Corp')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => { fetchTemplates() }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
        if (data.length > 0 && !selected) {
          setSelected(data[0])
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const showMsg = (type: 'ok' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const createTemplate = async () => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_TEMPLATE),
      })
      if (res.ok) {
        const t = await res.json()
        setTemplates(prev => [t, ...prev])
        setSelected(t)
        setEditing(t)
        showMsg('ok', 'Template created')
      }
    } catch {
      showMsg('error', 'Failed to create template')
    }
  }

  const saveTemplate = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/templates/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (res.ok) {
        const updated = await res.json()
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
        setSelected(updated)
        setEditing(updated)
        showMsg('ok', 'Template saved')
      }
    } catch {
      showMsg('error', 'Failed to save template')
    }
    setSaving(false)
  }

  const duplicateTemplate = async (t: LandingPageTemplate) => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...t, id: undefined, name: `${t.name} (Copy)`, is_default: false }),
      })
      if (res.ok) {
        const dup = await res.json()
        setTemplates(prev => [dup, ...prev])
        showMsg('ok', 'Template duplicated')
      }
    } catch {
      showMsg('error', 'Failed to duplicate')
    }
  }

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
        if (selected?.id === id) {
          setSelected(templates.length > 1 ? templates.find(t => t.id !== id)! : null)
          setEditing(null)
        }
        showMsg('ok', 'Template deleted')
      }
    } catch {
      showMsg('error', 'Failed to delete')
    }
  }

  const setDefault = async (id: string) => {
    try {
      // Unset all first
      for (const t of templates) {
        if (t.is_default) {
          await fetch(`/api/templates/${t.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_default: false }),
          })
        }
      }
      // Set new default
      const res = await fetch(`/api/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === updated.id })))
        if (selected?.id === id) setSelected(updated)
        if (editing?.id === id) setEditing(prev => prev ? { ...prev, is_default: true } : null)
        showMsg('ok', 'Default template updated')
      }
    } catch {
      showMsg('error', 'Failed to set default')
    }
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const updateField = (field: keyof LandingPageTemplate, value: any) => {
    if (!editing) return
    setEditing(prev => prev ? { ...prev, [field]: value } : null)
  }

  const updateLogoArray = (value: string) => {
    updateField('social_proof_logos', value.split(',').map(s => s.trim()).filter(Boolean))
  }

  const previewSection = (field: keyof LandingPageTemplate) => {
    if (!editing) return ''
    const val = editing[field]
    if (Array.isArray(val)) return val.join(', ')
    return applyVars(val as string | null, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')
  }

  const Section = ({ title, field, type, rows, children }: {
    title: string
    field?: keyof LandingPageTemplate
    type?: 'text' | 'textarea' | 'color' | 'custom'
    rows?: number
    children?: React.ReactNode
  }) => {
    if (type === 'custom') {
      return (
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">{title}</label>
          {children}
        </div>
      )
    }
    return (
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">{title}</label>
        {type === 'color' ? (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(editing && field ? (editing[field] as string) : '#4F46E5') || '#4F46E5'}
              onChange={(e) => field && updateField(field, e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer bg-slate-800 border border-slate-700"
            />
            <input
              type="text"
              value={(editing && field ? (editing[field] as string) : '#4F46E5') || '#4F46E5'}
              onChange={(e) => field && updateField(field, e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200"
            />
          </div>
        ) : type === 'textarea' ? (
          <textarea
            value={editing && field ? (editing[field] as string || '') : ''}
            onChange={(e) => field && updateField(field, e.target.value)}
            rows={rows || 3}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200 resize-y"
          />
        ) : (
          <input
            type="text"
            value={editing && field ? (editing[field] as string || '') : ''}
            onChange={(e) => field && updateField(field, e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200"
          />
        )}
        {field && editing && (
          <p className="text-xs text-slate-500 mt-1 italic">
            Preview: {previewSection(field)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-heading flex items-center gap-2">
            <Eye className="w-7 h-7 text-indigo-400" />
            Landing Page Templates
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Edit sections of your landing pages. Changes affect all pages using this template.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
              message.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {message.text}
            </span>
          )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              showPreview ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400' : 'border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button onClick={createTemplate} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-500/30 transition-all">
            <Plus className="w-3.5 h-3.5" />
            New Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Template List */}
        <div className="xl:col-span-4 glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
          <div className="p-3 border-b border-slate-800/60 bg-slate-900/25">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Templates ({templates.length})
            </span>
          </div>
          <div className="divide-y divide-slate-800/40 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
            ) : templates.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No templates yet. Click &ldquo;New Template&rdquo; to start.</div>
            ) : templates.map(t => {
              const isSelected = selected?.id === t.id
              return (
                <div
                  key={t.id}
                  onClick={() => { setSelected(t); setEditing(t) }}
                  className={`p-4 cursor-pointer transition-all ${
                    isSelected ? 'bg-indigo-600/10 border-l-4 border-indigo-500' : 'hover:bg-slate-900/30 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-heading text-sm flex items-center gap-2">
                      {t.name}
                      {t.is_default && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                    </h4>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateTemplate(t) }}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-all"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!t.is_default && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDefault(t.id) }}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-yellow-500 transition-all"
                          title="Set as default"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete this template?')) deleteTemplate(t.id) }}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">
                    {t.hero_heading || 'No hero heading'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="xl:col-span-8 space-y-4">
          {!editing ? (
            <div className="glass-panel rounded-2xl border border-slate-800/60 p-12 text-center">
              <Eye className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Select a template to edit, or create a new one.</p>
            </div>
          ) : (
            <>
              {/* Name + Save bar */}
              <div className="glass-panel rounded-2xl border border-slate-800/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="bg-transparent text-heading font-bold text-lg border-b border-transparent hover:border-slate-600 focus:border-indigo-500 outline-none px-1"
                  />
                  {editing.is_default && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold uppercase">
                      Default
                    </span>
                  )}
                </div>
                <button
                  onClick={saveTemplate}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-xs font-bold rounded-xl border border-indigo-500/30 transition-all disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {/* Editable sections */}
              <div className="space-y-3">
                {/* Branding */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('branding')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">Branding</h4>
                    {expandedSections.branding ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.branding && (
                    <div className="p-4 space-y-3 border-t border-slate-800/40">
                      <Section title="Brand Title" field="brand_title" />
                      <Section title="Logo URL" field="brand_logo_url" />
                      <Section title="Brand Color" field="brand_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Badge + Hero */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('hero')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">Badge &amp; Hero</h4>
                    {expandedSections.hero ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.hero && (
                    <div className="p-4 space-y-3 border-t border-slate-800/40">
                      <Section title="Badge Text" field="badge_text" />
                      <Section title="Hero Heading" field="hero_heading" />
                      <Section title="Hero Subheading" field="hero_subheading" />
                      <Section title="Hero Body" field="hero_body" type="textarea" rows={4} />
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('cta')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">CTA</h4>
                    {expandedSections.cta ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.cta && (
                    <div className="p-4 space-y-3 border-t border-slate-800/40">
                      <Section title="CTA Text" field="cta_text" />
                      <Section title="CTA URL" field="cta_url" />
                      <Section title="CTA Description" field="cta_description" type="textarea" rows={2} />
                      <Section title="Calendar Heading" field="calendar_heading" />
                      <Section title="Calendar Embed Code" field="calendar_embed_code" type="textarea" rows={4} />
                    </div>
                  )}
                </div>

                {/* Social Proof */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('social')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">Social Proof</h4>
                    {expandedSections.social ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.social && (
                    <div className="p-4 space-y-3 border-t border-slate-800/40">
                      <Section title="Heading" field="social_proof_heading" />
                      <Section title="Logo Names (comma separated)" field="social_proof_logos" type="custom">
                        <textarea
                          value={(editing.social_proof_logos || []).join(', ')}
                          onChange={(e) => updateLogoArray(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200 resize-y"
                        />
                        <p className="text-xs text-slate-500 mt-1">Enter company names or logo URLs separated by commas</p>
                      </Section>
                    </div>
                  )}
                </div>

                {/* Why Matters */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('why')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">Why This Matters</h4>
                    {expandedSections.why ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.why && (
                    <div className="p-4 space-y-3 border-t border-slate-800/40">
                      <Section title="Heading" field="why_matters_heading" />
                      <Section title="Subheading" field="why_matters_subheading" />
                      <Section title="Body" field="why_matters_body" type="textarea" rows={4} />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('footer')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">Footer</h4>
                    {expandedSections.footer ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.footer && (
                    <div className="p-4 space-y-3 border-t border-slate-800/40">
                      <Section title="Footer Text" field="footer_text" />
                      <Section title="Powered By" field="footer_powered_by" />
                    </div>
                  )}
                </div>

                {/* Custom CSS */}
                <div className="glass-panel rounded-2xl border border-slate-800/60 overflow-hidden">
                  <button onClick={() => toggleSection('css')} className="w-full flex items-center justify-between p-4 bg-slate-900/25 text-left">
                    <h4 className="text-sm font-bold text-heading">Custom CSS</h4>
                    {expandedSections.css ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedSections.css && (
                    <div className="p-4 border-t border-slate-800/40">
                      <Section title="CSS" field="custom_css" type="custom">
                        <textarea
                          value={editing.custom_css || ''}
                          onChange={(e) => updateField('custom_css', e.target.value)}
                          rows={6}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-slate-200 font-mono resize-y"
                          placeholder=".hero { background: ... }"
                        />
                      </Section>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPreview(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-heading">Live Preview</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span>Name:</span>
                  <input
                    type="text"
                    value={previewFirstName}
                    onChange={(e) => setPreviewFirstName(e.target.value)}
                    className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200"
                  />
                  <span>Company:</span>
                  <input
                    type="text"
                    value={previewCompany}
                    onChange={(e) => setPreviewCompany(e.target.value)}
                    className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200"
                  />
                </div>
                <button onClick={() => setShowPreview(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">Badge</div>
                <div className="text-slate-200">{applyVars(editing.badge_text, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">Hero Section</div>
                <div className="text-lg font-bold" style={{ color: editing.brand_color || '#4F46E5' }}>
                  {applyVars(editing.hero_heading, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
                <div className="text-slate-300 font-medium mt-1">
                  {applyVars(editing.hero_subheading, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
                <div className="text-slate-400 mt-2">
                  {applyVars(editing.hero_body, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">CTA</div>
                <div className="flex items-center gap-2">
                  <span className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: editing.brand_color || '#4F46E5', color: '#fff' }}>
                    {applyVars(editing.cta_text, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                  </span>
                </div>
                <div className="text-slate-400 mt-2 text-xs">
                  {applyVars(editing.cta_description, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">Why Matters</div>
                <div className="text-slate-200 font-medium">
                  {applyVars(editing.why_matters_heading, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
                <div className="text-slate-300 text-xs mt-1">
                  {applyVars(editing.why_matters_subheading, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
                <div className="text-slate-400 text-xs mt-2">
                  {applyVars(editing.why_matters_body, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">Footer</div>
                <div className="text-slate-500 text-xs">
                  {applyVars(editing.footer_text, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
                <div className="text-slate-600 text-[10px] mt-1">
                  {applyVars(editing.footer_powered_by, previewFirstName, previewCompany, editing.brand_title || 'Capital Acquisition')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
