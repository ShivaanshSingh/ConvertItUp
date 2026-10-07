# ConvertFlow: Universal Multi-Format Conversion SaaS

An enterprise-grade, high-performance file conversion and media extraction SaaS platform built with **Next.js 14+ (App Router)** and **Firebase / Google Cloud**.

---

## 🚀 Key Features

- **📄 Document Processing**: PDF to DOCX, DOCX to PDF, OCR PDF, TXT, EPUB.
- **🖼️ Image Optimization & Transformation**: JPG, PNG, WEBP, AVIF, SVG, GIF with resizing, compression, and format swapping.
- **🎵 Audio Conversion Engine**: WAV to MP3, AAC, FLAC, OGG, M4A with bitrate and sample rate customization.
- **📺 YouTube Media Extractor**: YouTube video URL to MP3/WAV audio stream with metadata tagging (powered by isolated worker queue).
- **⚡ Real-Time Job Tracking**: Firebase Cloud Firestore real-time snapshots with conversion progress indicator.
- **💳 SaaS Monetization & Tiering**: Stripe Subscriptions + Pay-as-you-go Credit system, metered by file size & duration.
- **🔒 Privacy & Security**: Auto-expiring signed Cloud Storage URLs (TTL 1–24 hrs), client-side SHA256 deduplication, zero persistent retention.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 14 (App Router), React, TypeScript | SSR/SSG Landing pages, interactive conversion workspace, dashboard |
| **Styling & UI** | Tailwind CSS / Modern CSS, Lucide Icons, Framer Motion | Modern dark/light glassmorphic UI, fluid animations |
| **Authentication** | Firebase Authentication | Google OAuth, GitHub, Email/Password Magic Links |
| **Database** | Firebase Cloud Firestore | User profiles, subscription status, conversion job history & logs |
| **File Storage** | Firebase Cloud Storage (Google Cloud Storage) | Secure bucket for raw uploads and processed output files |
| **Async Worker Engine** | Google Cloud Run / Containerized microservices (FFmpeg, yt-dlp, LibreOffice, Sharp) | Heavy compute file transformations & extraction |
| **Task Queue** | Google Cloud Tasks / Redis BullMQ | Rate-limiting, concurrency control, and retry logic |
| **Billing & Payments** | Stripe + Firebase Extensions / Stripe Webhooks | Subscription tiers (Free, Pro, Enterprise) and credit packs |

---

## 📁 Repository Documentation Map

```text
├── docs/
│   ├── ARCHITECTURE.md          # End-to-end architecture & Mermaid diagrams
│   ├── DATABASE_SCHEMA.md       # Firestore schema & security rules
│   ├── CONVERSION_PIPELINE.md   # FFmpeg, Sharp, LibreOffice, yt-dlp specs
│   ├── API_SPECIFICATION.md     # Next.js route handlers & API endpoints
│   └── SAAS_PRICING_AND_AUTH.md # Tier limits, credits, and Stripe integration
└── README.md                    # Project overview & quickstart
```

---

## 🚦 Getting Started (Local Development)

### 1. Prerequisites
- Node.js 18.x or 20.x
- Docker (for local FFmpeg/LibreOffice worker emulation)
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud SDK (`gcloud`)

### 2. Environment Variables Setup
Create a `.env.local` file with the following keys:

```env
# Next.js Public
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin (Server-side)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Cloud Run Worker URL & Secret
CONVERTER_WORKER_URL=https://converter-worker-xyz-uc.a.run.app
WORKER_AUTH_TOKEN=your_internal_shared_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```
