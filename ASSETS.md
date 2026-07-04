# === ASSETS — All API Keys, Endpoints & Credentials ===
# Central reference for OS pipeline. NEVER commit to git.

## DashScope (Alibaba — Beijing Region)
DASH_SCOPE_API_KEY=sk-sp-49fc62af099c4b3ca241e8437d320550
- CosyVoice TTS: ¥0.004/sec
- wan2.2-s2v lip-sync: ¥0.072/sec (480P), ¥0.129/sec (720P)

## Supabase (OS — Outreach Suite)
SUPABASE_URL=https://wxxjiehgcjrmkbatkvsu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODQ2MTYsImV4cCI6MjA5NDg2MDYxNn0.ZyeF1A0ff_OmxK41Ue--KZJFQ9TsJehho8HESIGpvsE
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U
- Storage buckets: uploads, videos, images (all public)

## Modal (A10G GPU — $30/mo free credits)
MODAL_USERNAME=adelshah020
MODAL_VOICE_CLONE_ENDPOINT=https://adelshah020--voice-clone-generate.modal.run
MODAL_LATENTSYNC_ENDPOINT_URL=https://adelshah020--latentsync-v5-latentsyncinference-generate.modal.run
MODAL_MUSETALK_ENDPOINT_URL=https://adelshah020--musetalk-v7-musetalkinference-generate.modal.run
MODAL_QWEN3_TTS_ENDPOINT=https://adelshah020--qwen3-tts-generate.modal.run
MODAL_LATENTSYNC_APP=latentsync-v16-original
- LatentSync: best quality lip-sync, FREE on credits
- MuseTalk: fallback, ~$0.001/video
- Qwen3-TTS: voice cloning

## Cloudinary (legacy — still used for some uploads)
CLOUDINARY_CLOUD_NAME=dacq1vyxp
CLOUDINARY_API_KEY=367855372487586
CLOUDINARY_API_SECRET=nS_VVDTaYF4lMM_j7ZqdS-d-lzw

## VoiceKit (local dev)
NEXT_PUBLIC_VK_API_URL=http://localhost:5000

## Vercel
VERCEL_PROJECT=os-outreach-suit
VERCEL_ORG=adeel-s-projects00
- Deploy: npx vercel --yes --prod

## GitHub
GITHUB_REPO=Syadeel/outreach-suite-prod2
GITHUB_TOKEN=<redacted — see .env.local GITHUB_PAT>

## Calendly
CALENDLY_URL=https://calendly.com/thecapitalacquisition-info/30min

## Default Lead (for preview/testing)
DEFAULT_LEAD_ID=61eb4c23-572f-421f-9466-f3f66b177415

## Reference Media
VOICE_REF_URL=https://res.cloudinary.com/dacq1vyxp/video/upload/v1781112795/v2_voice_ref/voice_ref_optimized_30s.wav
DEFAULT_FACE_VIDEO_URL=https://res.cloudinary.com/dacq1vyxp/video/upload/v1781118782/v2_face/video_1781118774.mp4

## Cost Model
# SendR-style: ~₨181 base video + ~₨13/lead (short clips + FFmpeg splice)
# Full regen: ~₨181/lead (too expensive at scale)
# Exchange rate: 1 USD ≈ 278 PKR, 1 CNY ≈ 41 PKR
