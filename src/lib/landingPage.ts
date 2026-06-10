export function generateLandingPage(
  firstName: string,
  lastName: string,
  company: string,
  companyWebsite: string,
  videoUrl: string,
  gifUrl: string,
  calendarUrl: string = '#'
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${company} - Personal Offer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f1f5f9; min-height: 100vh; display: flex; flex-direction: column; }
    .container { max-width: 800px; margin: 0 auto; padding: 48px 16px; }
    .logo-box { width: 64px; height: 64px; margin: 0 auto 24px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .logo-box i { color: #34d399; font-size: 24px; }
    h1 { font-size: 32px; font-weight: 700; text-align: center; margin-bottom: 16px; }
    @media (min-width: 640px) { h1 { font-size: 40px; } }
    .highlight { color: #34d399; }
    .subtitle { color: #94a3b8; text-align: center; font-size: 18px; margin-bottom: 64px; line-height: 1.6; }
    .video-wrap { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; margin-bottom: 64px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    .video-wrap video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 12px; }
    .cta-wrap { text-align: center; margin-bottom: 80px; }
    .cta-btn { display: inline-block; background: #34d399; color: #0f172a; font-weight: 700; padding: 16px 48px; border-radius: 999px; font-size: 18px; text-decoration: none; transition: all 0.3s; box-shadow: 0 4px 12px rgba(52,211,153,0.3); }
    .cta-btn:hover { transform: translateY(-2px); background: #10b981; box-shadow: 0 8px 24px rgba(52,211,153,0.4); }
    .cta-sub { color: #64748b; margin-top: 12px; font-size: 14px; }
    .trusted { text-align: center; margin-bottom: 64px; }
    .trusted p { color: #64748b; margin-bottom: 16px; }
    .logos { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; }
    .logos span { background: #1e293b; border: 1px solid #334155; padding: 12px 24px; border-radius: 8px; font-weight: 600; color: #e2e8f0; }
    .logos .dim { color: #64748b; }
    .testimonials { margin-bottom: 64px; }
    .testimonials h2 { text-align: center; font-size: 24px; margin-bottom: 48px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 768px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    .test-card { background: linear-gradient(145deg, #1e293b, #0f172a); border: 1px solid rgba(148,163,184,0.1); padding: 24px; border-radius: 12px; }
    .test-card .avatar { width: 48px; height: 48px; border-radius: 12px; background: #334155; margin-bottom: 12px; }
    .test-card h3 { font-weight: 600; font-size: 14px; }
    .test-card .role { color: #64748b; font-size: 12px; margin-bottom: 12px; }
    .test-card q { color: #cbd5e1; font-style: italic; font-size: 13px; line-height: 1.5; }
    .footer { margin-top: auto; text-align: center; padding: 32px; color: #475569; font-size: 13px; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-box"><i class="fas fa-rocket"></i></div>
    <h1>Hey ${firstName}, I built something for <span class="highlight">${company}</span></h1>
    <p class="subtitle">A personalized solution to help ${company} grow faster with automated AI video outreach</p>
    
    <div class="video-wrap">
      <video src="${videoUrl}" autoplay muted playsinline controls poster="${gifUrl}">Your browser does not support video.</video>
    </div>

    <div class="cta-wrap">
      <a href="${calendarUrl}" target="_blank" rel="noopener" class="cta-btn"><i class="fas fa-calendar-check"></i> Book a Call</a>
      <p class="cta-sub">30-minute consultation &middot; No obligation</p>
    </div>

    <div class="trusted">
      <p>Trusted by teams at:</p>
      <div class="logos">
        <span>${company}</span>
        <span class="dim">Fortune 500</span>
        <span class="dim">YC Startups</span>
      </div>
    </div>

    <div class="testimonials">
      <h2>Trusted by Revenue Leaders</h2>
      <div class="grid">
        <div class="test-card">
          <div class="avatar"></div>
          <h3>Sarah Johnson</h3>
          <p class="role">Head of Sales, TechCorp</p>
          <q>Increased meetings booked by 40% in the first month.</q>
        </div>
        <div class="test-card">
          <div class="avatar"></div>
          <h3>Michael Chen</h3>
          <p class="role">Sales Director, GrowthCo</p>
          <q>Saved our team 10+ hours per week on outreach.</q>
        </div>
        <div class="test-card">
          <div class="avatar"></div>
          <h3>Alex Rivera</h3>
          <p class="role">CMO, InnovateX</p>
          <q>Finally an outreach tool that actually delivers results.</q>
        </div>
      </div>
    </div>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} Outreach Solutions. All rights reserved.</div>
</body>
</html>`;
}
