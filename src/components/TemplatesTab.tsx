'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Copy, Star, ChevronDown, ChevronRight, Save, Eye, X, Upload, Check } from 'lucide-react'
import s from './TemplatesTab.module.css'

interface LandingPageTemplate {
  id: string; name: string; is_default: boolean; hidden_sections: string[] | null;
  brand_title: string | null; brand_logo_url: string | null; brand_color: string | null;
  hero_heading: string | null; hero_subheading: string | null; hero_body: string | null;
  hero_bg_color: string | null;
  cta_text: string | null; cta_url: string | null;
  calendar_embed_code: string | null; calendar_heading: string | null;
  social_proof_heading: string | null; social_proof_logos: string[] | null;
  social_proof_bg_color: string | null;
  why_matters_heading: string | null; why_matters_subheading: string | null; why_matters_body: string | null;
  why_matters_bg_color: string | null;
  footer_text: string | null; footer_powered_by: string | null; footer_bg_color: string | null; footer_text_color: string | null;
  nav_bg_color: string | null; nav_text_color: string | null;
  custom_css: string | null; created_at: string; updated_at: string
}

const DEFAULT_TEMPLATE: Partial<LandingPageTemplate> = {
  name: 'New Template', hidden_sections: [],
  brand_title: 'Capital Acquisition', brand_logo_url: '/ca-logo.svg', brand_color: '#4F46E5',
  hero_heading: 'Hey {{first_name}}, I recorded a personalized video for you',
  hero_subheading: 'Tailored for {{company}}',
  hero_body: 'I put together this personalized video for you and the team at {{company}}. I think you will find the first 30 seconds especially relevant.',
  hero_bg_color: '',
  cta_text: 'Book a 15-Min Call', cta_url: '',
  calendar_heading: 'Schedule a time to chat', calendar_embed_code: '',
  social_proof_heading: 'Trusted by growth teams everywhere', social_proof_logos: ['Partner Co.', 'ScaleUp', 'GrowFast', 'NextLevel', 'VentureX'],
  social_proof_bg_color: '',
  why_matters_heading: "This isn't a generic pitch, {{first_name}}.",
  why_matters_subheading: "It was built specifically for what you're building at {{company}}.",
  why_matters_body: 'We researched your company, identified the key opportunity, and recorded this video so you can see the fit in under 60 seconds.',
  why_matters_bg_color: '',
  footer_text: '© {{year}} {{brand_title}}. All rights reserved.',
  footer_powered_by: 'Powered by {{brand_title}}',
  footer_bg_color: '',
  footer_text_color: '',
  nav_bg_color: '',
  nav_text_color: '',
  is_default: false
}

function applyVars(text: string | null, firstName = 'John', company = 'Acme Corp', brandTitle = 'Capital Acquisition'): string {
  if (!text) return ''
  return text.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{company\}\}/g, company).replace(/\{\{brand_title\}\}/g, brandTitle).replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
}

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<LandingPageTemplate[]>([])
  const [selected, setSelected] = useState<LandingPageTemplate | null>(null)
  const [editing, setEditing] = useState<LandingPageTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ branding: true, nav: false, hero: false, cta: false, calendar: false, social: false, why: false, footer: false })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [previewMode, setPreviewMode] = useState<'off' | 'desktop' | 'mobile'>('off')
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)

  useEffect(() => { fetchTemplates() }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
        if (data.length > 0 && !selected) { setSelected(data[0]); setEditing(data[0]) }
      }
    } catch {}
    setLoading(false)
  }

  const showMsg = (type: 'ok' | 'error', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000) }

  const createTemplate = async () => {
    try {
      const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEFAULT_TEMPLATE) })
      if (res.ok) { const t = await res.json(); setTemplates(prev => [t, ...prev]); setSelected(t); setEditing(t); showMsg('ok', 'Template created') }
    } catch { showMsg('error', 'Failed') }
  }

  const saveTemplate = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/templates/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
      if (res.ok) {
        const updated = await res.json()
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
        setSelected(updated); setEditing(updated); showMsg('ok', 'Saved')
      }
    } catch { showMsg('error', 'Failed') }
    setSaving(false)
  }

  const duplicateTemplate = async (t: LandingPageTemplate) => {
    try {
      const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, id: undefined, name: `${t.name} (Copy)`, is_default: false }) })
      if (res.ok) { const dup = await res.json(); setTemplates(prev => [dup, ...prev]); showMsg('ok', 'Duplicated') }
    } catch { showMsg('error', 'Failed') }
  }

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (res.ok) { setTemplates(prev => prev.filter(t => t.id !== id)); if (selected?.id === id) { setSelected(templates.find(t => t.id !== id) || null); setEditing(null) }; showMsg('ok', 'Deleted') }
    } catch { showMsg('error', 'Failed') }
  }

  const setDefault = async (id: string) => {
    try {
      for (const t of templates) { if (t.is_default) await fetch(`/api/templates/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: false }) }) }
      const res = await fetch(`/api/templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: true }) })
      if (res.ok) { const updated = await res.json(); setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === updated.id }))); if (editing?.id === id) setEditing(updated); showMsg('ok', 'Default updated') }
    } catch { showMsg('error', 'Failed') }
  }

  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  const updateField = (field: string, value: any) => { if (editing) setEditing(prev => prev ? { ...prev, [field]: value } : null) }
  const updateLogoArray = (value: string) => updateField('social_proof_logos', value.split(',').map(s => s.trim()).filter(Boolean))

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', 'images')
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await uploadRes.json()
      if (data.url) { updateField('brand_logo_url', data.url); showMsg('ok', 'Logo uploaded') }
      else { showMsg('error', data.error || 'Upload failed') }
    } catch (err: any) { showMsg('error', err.message || 'Failed to upload logo') }
    setUploadingLogo(false)
  }

  const handleTogglePreview = async () => {
    if (previewMode !== 'off') {
      setPreviewMode('off')
      return
    }
    if (!previewVideoId) {
      try {
        const res = await fetch('/api/video-recordings')
        const videos = await res.json()
        if (videos && videos.length > 0) {
          setPreviewVideoId(videos[0].id)
        } else {
          alert('No video recordings found. Upload a video in the Video tab first.')
          return
        }
      } catch {
        alert('Could not load videos. Upload a video in the Video tab first.')
        return
      }
    }
    setPreviewMode('desktop')
  }

  const Section = ({ title, field, type, rows, children }: { title: string; field?: string; type?: 'text' | 'textarea' | 'color' | 'custom'; rows?: number; children?: React.ReactNode }) => {
    if (type === 'custom') return <div><label className={s.sectionLabel}>{title}</label>{children}</div>
    const val = editing && field ? (editing as any)[field] : undefined
    return (
      <div>
        <label className={s.sectionLabel}>{title}</label>
        {type === 'color' ? (
          <div className={s.colorRow}>
            <input type="color" value={val || '#4F46E5'} onChange={(e) => field && updateField(field, e.target.value)} className={s.colorInput} />
            <input type="text" value={val || '#4F46E5'} onChange={(e) => field && updateField(field, e.target.value)} className={s.colorText} />
          </div>
        ) : type === 'textarea' ? (
          <textarea defaultValue={val || ''} onChange={(e) => field && updateField(field, e.target.value)} rows={rows || 3} className={s.textarea} />
        ) : (
          <input type="text" defaultValue={val || ''} onChange={(e) => field && updateField(field, e.target.value)} className={s.input} />
        )}
      </div>
    )
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}><Eye className={s.titleIcon} /> Landing Page Templates</h2>
          <p className={s.subtitle}>Customize sections and style for your landing pages.</p>
        </div>
        <div className={s.headerActions}>
          {message && <span className={`${s.message} ${message.type === 'ok' ? s.messageOk : s.messageErr}`}>{message.text}</span>}
          <button onClick={handleTogglePreview} className={s.previewBtn}><Eye className={s.iconSm} /> {previewMode !== 'off' ? 'Close Preview' : 'Preview'}</button>
          <button onClick={createTemplate} className={s.newBtn}><Plus className={s.iconSm} /> New</button>
        </div>
      </div>

      <div className={s.grid}>
        {/* Template List */}
        <div className={s.sidebar}>
          <div className={s.sidebarHeader}><span className={s.sidebarTitle}>Templates ({templates.length})</span></div>
          <div className={s.templateList}>
            {loading ? <div className={s.empty}>Loading...</div> : templates.length === 0 ? <div className={s.empty}>No templates yet.</div> : templates.map(t => (
              <div key={t.id} onClick={() => { setSelected(t); setEditing(t) }} className={`${s.templateItem} ${selected?.id === t.id ? s.templateItemActive : ''}`}>
                <div className={s.templateHeader}>
                  <h4 className={s.templateName}>{t.name} {t.is_default && <Star className={s.starIcon} />}</h4>
                  <div className={s.templateActions}>
                    <button onClick={(e) => { e.stopPropagation(); duplicateTemplate(t) }} className={s.templateActionBtn} title="Duplicate"><Copy className={s.iconXs} /></button>
                    {!t.is_default && <button onClick={(e) => { e.stopPropagation(); setDefault(t.id) }} className={s.templateActionBtn} title="Set default"><Star className={s.iconXs} /></button>}
                    <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteTemplate(t.id) }} className={s.templateActionBtn} title="Delete"><Trash2 className={s.iconXs} /></button>
                    <button onClick={async (e) => { e.stopPropagation(); try { const res = await fetch('/api/video-recordings'); const vids = await res.json(); if (vids && vids.length > 0) { window.open(`${window.location.origin}/landing/${vids[0].id}?leadId=61eb4c23-572f-421f-9466-f3f66b177415&templateId=${t.id}&preview=true`, '_blank') } else { alert('No video recordings found. Upload a video first.') } } catch { alert('Could not load videos.') } }} className={s.templateActionBtn} title="Open in new tab"><Eye className={s.iconXs} /></button>
                  </div>
                </div>
                <p className={s.templatePreview}>{t.hero_heading || 'No heading'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className={s.editor}>
          {!editing ? (
            <div className={s.empty}><Eye className={s.emptyIcon} /><p>Select a template to edit, or create a new one.</p></div>
          ) : (
            <>
              <div className={s.editorHeader}>
                <div className={s.editorTitleRow}>
                  <input type="text" defaultValue={editing.name} onBlur={(e) => updateField('name', e.target.value)} className={s.nameInput} placeholder="Template name" />
                  {editing.is_default && <span className={s.defaultBadge}>Default</span>}
                </div>
                <button onClick={saveTemplate} disabled={saving} className={s.saveBtn}><Save className={s.iconSm} /> {saving ? 'Saving...' : 'Save'}</button>
              </div>

              <div className={s.sections}>
                {/* Section Visibility */}
                <div className={s.sectionCard}>
                  <div className={s.sectionToggle}><h4 className={s.sectionTitle}>Section Visibility</h4></div>
                  <div className={s.sectionContent}>
                    <div className={s.toggleGrid}>
                      {['hero', 'cta', 'social_proof', 'why_matters', 'calendar', 'footer'].map(section => {
                        const hidden = Array.isArray(editing.hidden_sections) ? editing.hidden_sections : []
                        return (
                          <label key={section} className={s.toggleLabel}>
                            <input type="checkbox" checked={!hidden.includes(section)} onChange={(e) => {
                              const newHidden = e.target.checked ? hidden.filter((s: string) => s !== section) : [...hidden, section]
                              updateField('hidden_sections', newHidden)
                            }} className={s.checkbox} />
                            <span>{section.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Branding */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('branding')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Branding</h4>{expandedSections.branding ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.branding && (
                    <div className={s.sectionContent}>
                      <Section title="Brand Title" field="brand_title" />
                      <div>
                        <label className={s.sectionLabel}>Logo</label>
                        <div className={s.logoUpload} onClick={() => logoInputRef.current?.click()}>
                          <input ref={logoInputRef} type="file" accept="image/*" className={s.hidden} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = '' }} />
                          {uploadingLogo ? <div className={s.uploading}><div className={s.spinner} /> Uploading...</div>
                            : editing.brand_logo_url ? <div className={s.logoPreview}><img src={editing.brand_logo_url} alt="Logo" className={s.logoImg} /><span className={s.logoChange}>Change</span></div>
                            : <div className={s.uploadPlaceholder}><Upload className={s.uploadIcon} /><span>Click to upload logo</span><span className={s.uploadHint}>PNG, JPG, SVG</span></div>
                          }
                        </div>
                      </div>
                      <Section title="Brand Color" field="brand_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('nav')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Navigation</h4>{expandedSections.nav ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.nav && (
                    <div className={s.sectionContent}>
                      <Section title="Background Color" field="nav_bg_color" type="color" />
                      <Section title="Text Color" field="nav_text_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Hero */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('hero')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Hero</h4>{expandedSections.hero ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.hero && (
                    <div className={s.sectionContent}>
                      <Section title="Heading" field="hero_heading" />
                      <Section title="Subheading" field="hero_subheading" />
                      <Section title="Body" field="hero_body" type="textarea" rows={3} />
                      <Section title="Text Color" field="hero_text_color" type="color" />
                      <Section title="Background Color" field="hero_bg_color" type="color" />
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('cta')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Call to Action</h4>{expandedSections.cta ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.cta && (
                    <div className={s.sectionContent}>
                      <Section title="Button Text" field="cta_text" />
                      <Section title="Button Link (Calendly URL or any URL)" field="cta_url" />
                      <Section title="Calendly Embed Code (optional)" field="calendar_embed_code" type="textarea" rows={4} />
                      <p className={s.hint}>Paste Calendly embed code here, or put a direct Calendly link in the Button Link field above.</p>
                      <Section title="Background Color" field="cta_bg_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Social Proof */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('social')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Social Proof</h4>{expandedSections.social ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.social && (
                    <div className={s.sectionContent}>
                      <Section title="Heading" field="social_proof_heading" />
                      <Section title="Company Names (comma separated)" field="social_proof_logos" type="custom">
                        <textarea defaultValue={(editing.social_proof_logos || []).join(', ')} onChange={(e) => updateLogoArray(e.target.value)} rows={2} className={s.textarea} placeholder="Partner Co., ScaleUp, GrowFast" />
                      </Section>
                      <Section title="Text Color" field="social_proof_text_color" type="color" />
                      <Section title="Background Color" field="social_proof_bg_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Why This Matters */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('why')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Why This Matters</h4>{expandedSections.why ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.why && (
                    <div className={s.sectionContent}>
                      <Section title="Heading" field="why_matters_heading" />
                      <Section title="Subheading" field="why_matters_subheading" />
                      <Section title="Body" field="why_matters_body" type="textarea" rows={3} />
                      <Section title="Text Color" field="why_matters_text_color" type="color" />
                      <Section title="Background Color" field="why_matters_bg_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className={s.sectionCard}>
                  <button onClick={() => toggleSection('footer')} className={s.sectionToggle}><h4 className={s.sectionTitle}>Footer</h4>{expandedSections.footer ? <ChevronDown className={s.iconSm} /> : <ChevronRight className={s.iconSm} />}</button>
                  {expandedSections.footer && (
                    <div className={s.sectionContent}>
                      <Section title="Footer Text" field="footer_text" />
                      <Section title="Powered By" field="footer_powered_by" />
                      <Section title="Text Color" field="footer_text_color" type="color" />
                      <Section title="Background Color" field="footer_bg_color" type="color" />
                    </div>
                  )}
                </div>

                {/* Preview Panel */}
                {previewMode !== 'off' && previewVideoId && (
                  <div className={s.previewPanel}>
                    <div className={s.previewControls}>
                      <span className={s.previewLabel}>Landing Page Preview</span>
                      <div className={s.previewToggle}>
                        <button className={`${s.previewToggleBtn} ${previewMode === 'desktop' ? s.previewToggleActive : ''}`} onClick={() => setPreviewMode('desktop')}>Desktop</button>
                        <button className={`${s.previewToggleBtn} ${previewMode === 'mobile' ? s.previewToggleActive : ''}`} onClick={() => setPreviewMode('mobile')}>Mobile</button>
                      </div>
                      <button className={s.closePreviewBtn} onClick={() => setPreviewMode('off')}>✕</button>
                    </div>
                    {previewMode === 'mobile' ? (
                      <div className={s.mobilePreview}>
                        <div className={s.phoneFrame}>
                          <div className={s.phoneNotch}><div className={s.phoneNotchDot} /></div>
                          <iframe src={`/landing/${previewVideoId}?leadId=61eb4c23-572f-421f-9466-f3f66b177415&templateId=${editing?.id || ''}&preview=true`} title="Mobile Preview" className={s.phoneIframe} />
                        </div>
                      </div>
                    ) : (
                      <div className={s.desktopPreview}>
                        <iframe src={`/landing/${previewVideoId}?leadId=61eb4c23-572f-421f-9466-f3f66b177415&templateId=${editing?.id || ''}&preview=true`} title="Desktop Preview" className={s.desktopIframe} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
