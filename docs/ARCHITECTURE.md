# System Architecture & Flow

This document details the high-level architecture, component breakdown, and end-to-end data lifecycle for **ConvertFlow**.

---

## 1. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer (Next.js 14 Web App)"]
        UI["User Interface (Dropzone / Converter / Dashboard)"]
        ClientAuth["Firebase Auth Client SDK"]
        ClientStorage["Firebase Storage Client Direct Upload"]
    end

    subgraph FirebaseLayer ["Firebase & GCP Managed Services"]
        FBAuth["Firebase Authentication (OAuth, JWT)"]
        Firestore[("Cloud Firestore (Jobs, Users, Credits)")]
        GCS[("Cloud Storage (Raw Inbound & Processed Outbound)")]
        GCTasks["Cloud Tasks / PubSub Queue"]
    end

    subgraph ComputeLayer ["Compute & Worker Services"]
        NextAPI["Next.js Route Handlers (Edge / Node.js Server)"]
        WorkerEngine["Cloud Run Converter Microservice (FFmpeg, LibreOffice, yt-dlp, Sharp)"]
    end

    subgraph ExternalServices ["External Providers"]
        Stripe["Stripe Billing & Webhooks"]
        YT["YouTube CDN"]
    end

    %% Client Interactions
    UI -->|1. Authenticate| ClientAuth --> FBAuth
    UI -->|2. Upload Raw File Directly| ClientStorage --> GCS
    UI -->|3. Dispatch Job with File Metadata| NextAPI
    UI -->|4. Realtime Progress Listening| Firestore

    %% API & Queue Flow
    NextAPI -->|Verify Auth & Check Credits| Firestore
    NextAPI -->|Enqueue Task| GCTasks
    GCTasks -->|Trigger Worker Execution| WorkerEngine

    %% Worker Execution
    WorkerEngine -->|Fetch YouTube Stream| YT
    WorkerEngine -->|Download Raw File| GCS
    WorkerEngine -->|Transform & Convert| WorkerEngine
    WorkerEngine -->|Upload Output File| GCS
    WorkerEngine -->|Update Job Status: Completed/Failed| Firestore

    %% Billing Flow
    UI -->|Subscription Checkout| NextAPI --> Stripe
    Stripe -->|Webhook: payment_success| NextAPI -->|Credit Top-up| Firestore
```

---

## 2. Core Architectural Pillars

### Pillar A: Direct-to-Storage Upload Pattern
- Standard server uploads struggle with large 100MB+ audio/video/document files due to Vercel/Next.js body size limits (typically 4.5MB on serverless).
- **ConvertFlow Solution**: The client requests a signed upload URL from Firebase or uses the Firebase Client SDK with storage rules to upload directly to `gs://convertflow-uploads/{userId}/{jobId}/input.*`.
- This ensures zero server memory bottleneck and maximum network throughput.

### Pillar B: Decoupled Heavy Conversion Engine (Cloud Run)
- Heavy operations (FFmpeg audio transcoding, LibreOffice PDF conversion, `yt-dlp` stream extraction) cannot run within serverless Next.js functions due to CPU timeouts (10–60s) and binary dependency sizes.
- **ConvertFlow Solution**: Deploy a dedicated Docker container onto **Google Cloud Run** with autoscaling (0 to N instances).
- The container includes:
  - `ffmpeg` (with libmp3lame, libopus, aac)
  - `yt-dlp` (kept auto-updated via build pipelines)
  - `libreoffice-headless` + `poppler-utils` + `pandoc`
  - `sharp` / `imagemagick` for high-throughput raster & vector images.

### Pillar C: Event-Driven State & Real-Time UX
- Instead of periodic client HTTP polling, the frontend subscribes to `onSnapshot(doc(db, "jobs", jobId))`.
- The worker reports granular progression:
  - `0%`: Job queued
  - `20%`: Input fetched & validated
  - `60%`: Transcoding / processing in progress
  - `90%`: Uploading converted artifact
  - `100%`: Completed + signed download link generated.

### Pillar D: Transient Storage & Privacy-First Data Retention
- To maintain strict privacy and minimize GCP storage costs, files are saved with a TTL.
- A Cloud Storage **Lifecycle Rule** automatically deletes objects in `gs://convertflow-uploads/*` and `gs://convertflow-outputs/*` after 24 hours.
- Download URLs are generated as time-bound Signed URLs (1 hour validity).

---

## 3. YouTube Extraction Architecture & Policy Safeguards

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant NextJS as Next.js API / App
    participant Firestore as Cloud Firestore
    participant CloudTask as Cloud Tasks Queue
    participant Worker as Cloud Run Worker (yt-dlp + FFmpeg)
    participant GCS as Cloud Storage

    User->>NextJS: Submit YouTube URL & Target Format (e.g. MP3 320kbps)
    NextJS->>NextJS: Validate URL format & check User credit balance
    NextJS->>Firestore: Create Job (status: 'queued')
    NextJS->>CloudTask: Enqueue job payload with JobID & URL
    NextJS-->>User: Return Job ID (Client starts Firestore realtime listener)

    CloudTask->>Worker: POST /process-youtube (Signed Payload)
    Worker->>Firestore: Update status: 'extracting_audio'
    Worker->>Worker: yt-dlp streams best audio -> pipes to FFmpeg transcode
    Worker->>GCS: Upload resulting output.mp3
    Worker->>Firestore: Update status: 'completed', outputUrl, duration, size
    Firestore-->>User: Real-time update fired -> UI reveals Download button
```

### Safety & Reliability Mitigations:
1. **Proxy Rotation / IP Protection**: High-volume `yt-dlp` invocations can face YouTube rate limits. Cloud Run workers should utilize residential/datacenter proxy middleware if scaling commercially.
2. **Duration Caps**: Free users restricted to $\le 10$ minutes video length; Pro users up to 120 minutes.
3. **Format Filter**: Disallow full video remuxing if only audio extraction is requested, drastically saving bandwidth and memory.
