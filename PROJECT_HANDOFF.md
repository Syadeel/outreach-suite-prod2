# Outreach Suite - Project Handoff

**To the AI Agent reading this:** 
The user has transitioned to a new conversation to conserve API context quota. Please read this document to instantly understand the state of the project and proceed with the deployment phase.

## 🏗️ Project Overview
This is a comprehensive B2B Cold Email Outreach and Personalized Video platform (a Sendr.ai / Sendspark clone) built for high-volume, spam-safe cold outreach.
- **Location:** `F:\outreach-suite`
- **Tech Stack:** Next.js 14 (App Router), React, TailwindCSS, Supabase (Postgres), Gmail API (OAuth).
- **Styling:** Premium Glassmorphism (Dark mode by default, with a `.light` theme toggle override built into `globals.css`).

## ✅ What Has Been Completed (Local Env)
1. **Supabase & Database:** Schema is fully initialized with tables for `campaigns`, `inboxes`, `leads`, `campaign_leads` (junction), `email_tracking`, and `email_templates`.
2. **Gmail OAuth:** Fully functional OAuth flow (`/api/auth/google/url` and `/callback`) storing access/refresh tokens in the `inboxes` table.
3. **Leads CRM & Enrichment:** 
   - `LeadsTab.tsx` features an advanced CSV parser with dynamic synonym matching (first name, company, domain, etc.).
   - It validates emails, flags personal vs. business domains, and evaluates "Outreach Quality" for CAN-SPAM compliance.
   - It flags decision makers based on job titles.
4. **Smart Scheduler:** 
   - Campaign dispatching in `CampaignsTab.tsx` and follow-up queuing in `api/send/route.ts` are powered by an elite spam-avoiding algorithm. 
   - It staggers sending at 2.5-minute intervals load-balanced across active inboxes, applies random +/- 15s jitter, and strictly restricts sending to **Business Hours (Mon-Fri, 9AM-5PM)**.
5. **Video & Landing Pages:** WebRTC video recording (`VideoTab.tsx`) uploads to Supabase Storage. Dynamic personalized landing pages (`/landing/[id]`) display the video inside a beautiful mock browser window with the prospect's company website automatically scrolling in the background via an `iframe`.
6. **Lead Scraper Tool:** A custom Node.js web crawler is located at `scripts/scraper.js` to scrape business domains for emails via Cheerio.

## 🚀 Immediate Next Step: Server Deployment
The user wants to deploy this local suite to a **24/7 VPS Server** and attach **n8n** for background automation.

**Your Tasks:**
1. Guide the user through provisioning a VPS (e.g., DigitalOcean, Hetzner, AWS).
2. Set up a Docker environment with Caddy/Nginx for reverse proxy and SSL.
3. Deploy the Next.js production build (`npm run build` && `npm start`) via PM2 or Docker.
4. Set up the CRON jobs (via Linux crontab or n8n) to ping the `/api/cron/dispatch` endpoint every 1-2 minutes to trigger the Smart Scheduler queue automatically 24/7.
5. Deploy a self-hosted n8n instance on the server (or connect their existing one) to handle advanced background workflows if requested.

*Please confirm with the user if they have a VPS ready, or if they need you to guide them through purchasing and SSHing into one.*
