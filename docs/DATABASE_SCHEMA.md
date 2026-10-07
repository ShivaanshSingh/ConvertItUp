# Firestore Database Schema & Security Rules

This document outlines the NoSQL structure in **Google Cloud Firestore**, security rules, and indexing strategy for **ConvertFlow**.

---

## 1. Firestore Collections Overview

```text
firestore_root
│
├── users/{userId}                  # User profile, credits, subscription tier
│   └── usage_logs/{logId}          # Sub-collection for granular per-job credit deductions
│
├── jobs/{jobId}                    # Conversion jobs & real-time progress
│
├── credit_packages/{packageId}     # Available one-time credit top-up packages
│
└── system_metrics/{date}           # Daily aggregate stats (conversions, failure rates)
```

---

## 2. Collection Schemas

### `users/{userId}`
Tracks account identity, authorization, subscription tier, and remaining credits.

```typescript
interface UserDocument {
  uid: string;                       // Firebase Auth UID
  email: string;                     // Primary email
  displayName: string | null;
  photoURL: string | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  
  // Subscription & Tiering
  tier: "free" | "pro" | "enterprise";
  subscription: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    status: "active" | "canceled" | "past_due" | "none";
    currentPeriodEnd: FirebaseFirestore.Timestamp | null;
    cancelAtPeriodEnd: boolean;
  };

  // Quotas & Credits
  credits: {
    monthlyBalance: number;         // Replenished every billing cycle
    purchasedBalance: number;       // Never-expiring top-up credits
    totalUsed: number;              // Lifetime conversions count
  };

  // User Settings
  preferences: {
    defaultAudioBitrate: "128k" | "192k" | "256k" | "320k";
    defaultImageQuality: number;   // 1 - 100
    autoDownloadOnComplete: boolean;
  };
}
```

---

### `jobs/{jobId}`
Represents an individual conversion or media extraction task. Queried in real-time by the client.

```typescript
interface JobDocument {
  jobId: string;                     // Unique UUIDv4 or Firestore auto-ID
  userId: string;                    // Owner UID (or 'anonymous' for guest conversions)
  isGuest: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  completedAt: FirebaseFirestore.Timestamp | null;

  // Type & Configuration
  category: "document" | "image" | "audio" | "youtube";
  sourceFormat: string;              // e.g. 'pdf', 'jpg', 'wav', 'youtube_url'
  targetFormat: string;              // e.g. 'docx', 'png', 'mp3'
  
  conversionOptions: {
    audioBitrate?: "128k" | "192k" | "256k" | "320k";
    audioSampleRate?: 44100 | 48000;
    imageWidth?: number;
    imageHeight?: number;
    imageQuality?: number;
    ocrLanguage?: string;             // For PDF to DOCX with OCR
    youtubeCutStart?: string;         // '00:01:30'
    youtubeCutEnd?: string;           // '00:03:45'
  };

  // Input & Output File Reference
  input: {
    sourceType: "upload" | "youtube_url";
    storagePath?: string;            // 'uploads/{userId}/{jobId}/input.pdf'
    fileName: string;
    fileSizeBytes?: number;
    sourceUrl?: string;              // For YouTube extraction
    durationSeconds?: number;
  };

  output?: {
    storagePath: string;             // 'outputs/{userId}/{jobId}/result.docx'
    fileName: string;
    fileSizeBytes: number;
    downloadUrl: string;             // Signed URL valid for 1 hour
    expiresAt: FirebaseFirestore.Timestamp;
  };

  // Real-Time Job Progress State
  status: "queued" | "downloading" | "processing" | "uploading" | "completed" | "failed";
  progressPercent: number;           // 0 to 100
  errorMessage?: string;
  errorDetails?: string;

  // Billing Cost
  creditsCharged: number;
}
```

---

## 3. Firestore Security Rules (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // User documents: Only the user can read their own profile.
    // Writes to critical fields (credits, tier) must come from server Admin SDK.
    match /users/{userId} {
      allow read: if isOwner(userId);
      allow update: if isOwner(userId) 
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['credits', 'tier', 'subscription']);
      allow create: if isOwner(userId);
      allow delete: if false;

      match /usage_logs/{logId} {
        allow read: if isOwner(userId);
        allow write: if false; // Only server Admin SDK writes usage
      }
    }

    // Jobs: Authenticated users can read their own jobs.
    // Anonymous users can read jobs where userId == 'anonymous' and matching jobId in session.
    match /jobs/{jobId} {
      allow read: if (isAuthenticated() && resource.data.userId == request.auth.uid)
                  || (resource.data.isGuest == true);
      
      // Client cannot directly modify status or output; only worker/API Admin SDK updates progress
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }

    // Credit Packages: Public read-only
    match /credit_packages/{packageId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

---

## 4. Firebase Storage Security Rules (`storage.rules`)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // Allow users to upload only to their assigned inbound upload folder
    match /uploads/{userId}/{jobId}/{fileName} {
      allow write: if request.auth != null 
                   && request.auth.uid == userId
                   && request.resource.size < 200 * 1024 * 1024; // Max 200MB upload limit
      allow read: if request.auth != null && request.auth.uid == userId;
    }

    // Outputs are only written by Cloud Run Worker via Admin SDK
    // Client reads via Signed URLs or direct storage read rule
    match /outputs/{userId}/{jobId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
  }
}
```
