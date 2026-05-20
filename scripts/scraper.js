const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// A simple but effective web scraper for finding B2B leads from target domains
// Usage: node scripts/scraper.js "example.com" "another.com"
// Output: Will generate scraped_leads.csv

const domains = process.argv.slice(2);

if (domains.length === 0) {
  console.log("❌ Please provide at least one domain to scrape.");
  console.log("Usage: node scripts/scraper.js getsendspark.com example.com");
  process.exit(1);
}

const outputFile = path.join(__dirname, '..', 'scraped_leads.csv');

// Initialize CSV with headers that our Smart CRM Parser perfectly understands
if (!fs.existsSync(outputFile)) {
  fs.writeFileSync(outputFile, "Company,Company Domain,Email,Outreach Source\n");
}

const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

async function scrapeDomain(domain) {
  try {
    const targetUrl = `https://${domain}`;
    console.log(`\n🔍 Scraping ${targetUrl}...`);

    // Use native fetch with a Chrome user agent to avoid basic bot blocks
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    const foundEmails = new Set();

    // 1. Extract raw emails from the HTML body text
    const rawMatches = html.match(emailRegex) || [];
    rawMatches.forEach(email => foundEmails.add(email.toLowerCase()));

    // 2. Extract specific mailto: links which are highly accurate
    $('a[href^="mailto:"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (email && email.includes('@')) foundEmails.add(email);
      }
    });

    // Clean up unwanted assets that look like emails (e.g. image@2x.png)
    const validEmails = Array.from(foundEmails).filter(e => {
      return !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.jpeg') && 
             !e.endsWith('.gif') && !e.endsWith('.svg') && !e.endsWith('.webp') &&
             !e.startsWith('sentry') && !e.startsWith('noreply');
    });

    const companyName = $('title').text().split('|')[0].split('-')[0].trim() || domain.split('.')[0];

    if (validEmails.length > 0) {
      console.log(`✅ Found ${validEmails.length} emails for ${companyName}!`);
      
      validEmails.forEach(email => {
        // Append to our CSV which can be seamlessly imported to the Leads CRM Tab!
        const csvLine = `"${companyName}","${domain}","${email}","Web Scraper"\n`;
        fs.appendFileSync(outputFile, csvLine);
        console.log(`   -> Added: ${email}`);
      });
    } else {
      console.log(`⚠️ No emails found on homepage. Try checking their /contact or /about page manually.`);
    }

  } catch (error) {
    console.error(`❌ Failed to scrape ${domain}:`, error.message);
  }
}

async function run() {
  console.log("🚀 Starting Lead Web Scraper...");
  for (const domain of domains) {
    await scrapeDomain(domain);
    // Be polite to servers
    await new Promise(r => setTimeout(r, 1500)); 
  }
  console.log(`\n🎉 Scraping complete! Leads saved to ${outputFile}`);
  console.log(`👉 You can now go to the Leads Tab in Outreach Suite and upload 'scraped_leads.csv'!`);
}

run();
