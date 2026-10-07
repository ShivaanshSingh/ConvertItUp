# API & Server Action Specifications

This document outlines the REST API endpoints and Server Actions implemented in the **Next.js 14** application.

---

## 1. Authentication & Headers

All authenticated routes require a Firebase Auth Bearer token in the `Authorization` header:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json
```

Guest/Anonymous users can initiate conversions without a token, subject to stricter IP-based rate limiting (3 conversions/hour).

---

## 2. API Endpoints

### `POST /api/jobs/create`
Initiates a new conversion job, reserves credits, and returns job metadata.

#### Request Body
```json
{
  "category": "document",
  "sourceFormat": "pdf",
  "targetFormat": "docx",
  "fileName": "annual_report.pdf",
  "fileSizeBytes": 5242880,
  "options": {
    "ocrLanguage": "en"
  }
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "jobId": "job_9f4c3a2e-8b1c-4d5e",
  "status": "queued",
  "uploadSignedUrl": "https://storage.googleapis.com/convertflow-uploads/uploads/uid_123/job_9f4c3a2e/annual_report.pdf?X-Goog-Algorithm=...",
  "storageDestination": "uploads/uid_123/job_9f4c3a2e/annual_report.pdf",
  "creditsDeducted": 1,
  "creditsRemaining": 49
}
```

---

### `POST /api/jobs/youtube`
Validates a YouTube URL, fetches video duration/metadata, and queues the extraction task.

#### Request Body
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "targetFormat": "mp3",
  "audioBitrate": "320k",
  "trim": {
    "start": "00:00:15",
    "end": "00:03:30"
  }
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "jobId": "job_yt_7b8a1c9e",
  "status": "queued",
  "videoDetails": {
    "title": "Rick Astley - Never Gonna Give You Up",
    "channel": "Rick Astley",
    "durationSeconds": 212,
    "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
  },
  "creditsDeducted": 1
}
```

---

### `GET /api/jobs/[jobId]`
Fetches the current status and signed download URL for a completed job.

#### Response (200 OK)
```json
{
  "jobId": "job_9f4c3a2e-8b1c-4d5e",
  "status": "completed",
  "progressPercent": 100,
  "createdAt": "2026-10-07T15:30:00.000Z",
  "completedAt": "2026-10-07T15:30:12.000Z",
  "output": {
    "fileName": "annual_report.docx",
    "fileSizeBytes": 4194304,
    "downloadUrl": "https://storage.googleapis.com/convertflow-outputs/outputs/uid_123/job_9f4c3a2e/annual_report.docx?Expires=1791390600&Signature=...",
    "expiresInSeconds": 3600
  }
}
```

---

### `POST /api/billing/create-checkout-session`
Generates a Stripe Checkout session URL for upgrading subscriptions or buying credit packs.

#### Request Body
```json
{
  "priceId": "price_1Ov...pro_monthly",
  "mode": "subscription",
  "successUrl": "https://convertflow.app/dashboard?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://convertflow.app/pricing"
}
```

#### Response (200 OK)
```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3..."
}
```

---

## 3. HTTP Error Codes

| Status Code | Code | Description |
| :--- | :--- | :--- |
| **400** | `INVALID_PAYLOAD` | Missing required conversion parameters or unsupported format pair. |
| **401** | `UNAUTHORIZED` | Expired or missing Firebase authentication token. |
| **402** | `INSUFFICIENT_CREDITS` | User credit balance is zero; upgrade or top-up required. |
| **413** | `FILE_TOO_LARGE` | Input file exceeds tier limit (e.g. 50MB for Free, 1GB for Pro). |
| **429** | `RATE_LIMIT_EXCEEDED` | Exceeded maximum concurrent jobs (Free: 1, Pro: 5). |
| **500** | `CONVERSION_FAILED` | Internal worker engine failed to parse/transcode input. |
