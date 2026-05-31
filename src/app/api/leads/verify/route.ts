import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import dns from 'dns';

// Common disposable email providers list
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com',
  '10minutemail.com', 'temp-mail.org', 'dispostable.com', 'getairmail.com', 'burners.com',
  'burnermail.io', 'trashmail.com', 'tempmailaddress.com', 'fakeinbox.com', 'maildrop.cc',
  'tempmail.net', 'disposable.com', 'guerrillamailblock.com', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.biz', 'spam4.me', 'grr.la', 'pokemail.net',
  'boun.cr', 'jetable.org', 'fakeinbox.info', 'mytemp.email', 'tempinbox.com'
]);

// Helper to resolve MX records with a promise timeout
const resolveMxWithTimeout = (domain: string, timeoutMs = 3000): Promise<dns.MxRecord[]> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout resolving MX'));
    }, timeoutMs);

    dns.resolveMx(domain, (err, addresses) => {
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(addresses || []);
      }
    });
  });
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadIds } = body;

    let leadsToVerify: any[] = [];

    // 1. Fetch leads from database
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('*')
        .in('id', leadIds);
      if (error) throw error;
      leadsToVerify = data || [];
    } else {
      // Verify up to 100 new or unverified leads at once
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('*')
        .neq('stage', 'bounce')
        .neq('stage', 'unsubscribed')
        .or('custom_fields->>enrichment_status.is.null,custom_fields->>enrichment_status.neq.verified')
        .limit(100);
      if (error) throw error;
      leadsToVerify = data || [];
    }

    if (leadsToVerify.length === 0) {
      return NextResponse.json({ message: 'No leads found requiring verification.' });
    }

    const results = [];

    // 2. Perform validations sequentially or in parallel batches
    // Sequential processing is safer for serverless execution timeouts (limit of 100 max)
    for (const lead of leadsToVerify) {
      const email = (lead.email || '').trim().toLowerCase();
      const customFields = lead.custom_fields || {};
      
      let outreachStatus = customFields.outreach_status || 'good';
      let outreachNotes = customFields.outreach_notes || '';
      let enrichmentStatus = 'Good';
      let stage = lead.stage;

      const emailParts = email.split('@');
      if (emailParts.length !== 2) {
        outreachStatus = 'invalid: syntax';
        enrichmentStatus = 'Bad';
        outreachNotes = 'Invalid email address syntax (missing @ or domain).';
        stage = 'bounce';
      } else {
        const domain = emailParts[1];
        
        // Check disposable email domain list
        if (DISPOSABLE_DOMAINS.has(domain)) {
          outreachStatus = 'invalid: disposable';
          enrichmentStatus = 'Bad';
          outreachNotes = 'Disposable/temporary email domain detected.';
          stage = 'bounce';
        } else {
          // Perform active DNS MX lookup
          try {
            const mxRecords = await resolveMxWithTimeout(domain);
            if (!mxRecords || mxRecords.length === 0) {
              outreachStatus = 'invalid: no_mx';
              enrichmentStatus = 'Bad';
              outreachNotes = `No mail servers (MX records) configured for domain '${domain}'.`;
              stage = 'bounce';
            } else {
              // Domain is valid, check if personal or generic email was already flagged
              const genericProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'zoho.com', 'proton.me', 'protonmail.com'];
              const isPersonal = genericProviders.includes(domain);
              const isGeneric = /^(info|sales|support|admin|contact|jobs|billing|team|hello|marketing)@/i.test(email);

              if (isPersonal) {
                outreachStatus = 'good';
                enrichmentStatus = 'Good';
                outreachNotes = 'Verified active personal email.';
              } else if (isGeneric) {
                outreachStatus = 'warning: generic email';
                enrichmentStatus = 'Risky';
                outreachNotes = 'Verified generic business email (e.g. info@, sales@). Lower reply rate expected.';
              } else {
                outreachStatus = 'good';
                enrichmentStatus = 'Good';
                outreachNotes = 'Verified active B2B corporate domain.';
              }
            }
          } catch (dnsErr: any) {
            console.error(`DNS MX resolution error for domain ${domain}:`, dnsErr.message);
            outreachStatus = 'invalid: no_mx';
            enrichmentStatus = 'Bad';
            outreachNotes = `Failed DNS MX records lookup for '${domain}' (Error: ${dnsErr.message}).`;
            stage = 'bounce';
          }
        }
      }

      // Merge updated fields back into custom_fields JSONB object
      const updatedCustomFields = {
        ...customFields,
        outreach_status: outreachStatus,
        outreach_notes: outreachNotes,
        enrichment_status: enrichmentStatus,
        enriched_at: new Date().toISOString()
      };

      // Update lead in Supabase
      const { error: updateErr } = await supabaseAdmin
        .from('leads')
        .update({
          custom_fields: updatedCustomFields,
          stage: stage
        })
        .eq('id', lead.id);

      results.push({
        id: lead.id,
        email,
        status: outreachStatus,
        stage: stage,
        error: updateErr ? updateErr.message : null
      });
    }

    return NextResponse.json({
      message: `Enrichment completed for ${leadsToVerify.length} leads.`,
      verifiedCount: results.filter(r => r.stage !== 'bounce').length,
      invalidCount: results.filter(r => r.stage === 'bounce').length,
      details: results
    });
  } catch (err: any) {
    console.error('Lead verification route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
