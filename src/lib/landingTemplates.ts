/**
 * Landing page template system.
 *
 * Each section of the landing page is editable via the landing_page_templates table.
 * Templates support variable substitution: {{first_name}}, {{company}}, {{brand_title}}, {{year}}
 */

export interface LandingTemplate {
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
}

export interface LeadData {
  first_name: string | null
  last_name: string | null
  company: string | null
  email?: string | null
}

/**
 * Apply template variables to a string.
 * Replaces {{first_name}}, {{company}}, {{brand_title}}, {{year}}
 */
export function applyTemplateVars(
  text: string | null | undefined,
  lead: LeadData | null,
  brandTitle?: string | null
): string {
  if (!text) return ''

  const vars: Record<string, string> = {
    first_name: lead?.first_name || 'there',
    last_name: lead?.last_name || '',
    company: lead?.company || 'your company',
    brand_title: brandTitle || 'Capital Acquisition',
    year: String(new Date().getFullYear()),
  }

  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] || match)
}

/**
 * Merge template fields with lead data.
 * Returns an object with all template fields with variables resolved.
 */
export function resolveTemplate(
  template: LandingTemplate | null,
  lead: LeadData | null
): Record<string, string> {
  if (!template) return {}

  const result: Record<string, string> = {}

  const fields: (keyof LandingTemplate)[] = [
    'brand_title',
    'badge_text',
    'hero_heading',
    'hero_subheading',
    'hero_body',
    'cta_text',
    'cta_description',
    'calendar_heading',
    'social_proof_heading',
    'why_matters_heading',
    'why_matters_subheading',
    'why_matters_body',
    'footer_text',
    'footer_powered_by',
    'custom_css',
  ]

  for (const field of fields) {
    const val = template[field]
    result[field] = applyTemplateVars(val as string | null, lead, template.brand_title)
  }

  // Logo URLs and embed codes don't need variable substitution
  result['brand_logo_url'] = template.brand_logo_url || ''
  result['brand_color'] = template.brand_color || '#4F46E5'
  result['cta_url'] = template.cta_url || ''
  result['calendar_embed_code'] = template.calendar_embed_code || ''
  result['social_proof_logos'] = template.social_proof_logos?.join(',') || ''

  return result
}
