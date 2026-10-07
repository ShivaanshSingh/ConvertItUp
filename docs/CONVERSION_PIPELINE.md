# Conversion Pipeline & Engine Specification

This document specifies the internal transformation commands, container setup, and media processing engines powering **ConvertFlow**.

---

## 1. Matrix of Supported Conversion Techniques

| Source Format | Target Format | Engine / Library | Key Options / Flags |
| :--- | :--- | :--- | :--- |
| **PDF** | **DOCX** | `pdf2docx` / `LibreOffice` | Page range, preserve table formatting |
| **DOCX / PPTX / XLSX** | **PDF** | `LibreOffice Headless` | High-fidelity rendering, PDF/A compliance |
| **JPG / JPEG** | **PNG / WEBP / AVIF** | `Sharp` (Node.js) / `libvips` | Quality (1-100), lossy/lossless, auto-orient |
| **PNG / WEBP** | **JPG / SVG** | `Sharp` / `Potrace` | Compression level, background color fill |
| **WAV** | **MP3** | `FFmpeg (libmp3lame)` | Bitrate (128k, 192k, 256k, 320k), CBR / VBR |
| **WAV / MP3** | **AAC / FLAC / OGG** | `FFmpeg (aac, libopus, flac)` | Sample rate (44.1kHz, 48kHz), stereo/mono |
| **YouTube URL** | **MP3 / WAV** | `yt-dlp` + `FFmpeg` pipe | Extract audio, trim timestamps (`-ss`, `-to`), ID3 metadata tags |

---

## 2. Command-Line & Pipeline Execution Recipes

### A. Document Conversion: PDF to DOCX
```bash
# Using Python pdf2docx CLI or LibreOffice headless
soffice --headless --convert-to docx:"MS Word 2007 XML" /tmp/input.pdf --outdir /tmp/output/
```

### B. Image Conversion: JPG to PNG / WEBP via Sharp (Node.js)
```typescript
import sharp from 'sharp';

export async function convertImage(
  inputBuffer: Buffer,
  targetFormat: 'png' | 'webp' | 'avif' | 'jpeg',
  options: { quality?: number; width?: number; height?: number } = {}
): Promise<Buffer> {
  let pipeline = sharp(inputBuffer).rotate(); // auto-orient EXIF

  if (options.width || options.height) {
    pipeline = pipeline.resize(options.width, options.height, { fit: 'inside' });
  }

  switch (targetFormat) {
    case 'png':
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case 'webp':
      return pipeline.webp({ quality: options.quality || 85 }).toBuffer();
    case 'avif':
      return pipeline.avif({ quality: options.quality || 80 }).toBuffer();
    case 'jpeg':
    default:
      return pipeline.jpeg({ quality: options.quality || 90 }).toBuffer();
  }
}
```

### C. Audio Conversion: WAV to MP3 via FFmpeg
```bash
# High quality 320kbps MP3 conversion with joint stereo and ID3 tag preserve
ffmpeg -i /tmp/input.wav \
  -codec:a libmp3lame \
  -b:a 320k \
  -ar 44100 \
  -map_metadata 0 \
  -id3v2_version 3 \
  -y /tmp/output.mp3
```

### D. YouTube to MP3 / WAV with `yt-dlp` & FFmpeg Piping
Stream directly from YouTube without saving intermediate 1GB video files to disk:

```bash
# For MP3 (Constant 320k Bitrate + Thumbnail embedding)
yt-dlp \
  --extract-audio \
  --audio-format mp3 \
  --audio-quality 0 \
  --add-metadata \
  --embed-thumbnail \
  --ffmpeg-location /usr/bin/ffmpeg \
  --output "/tmp/output/%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"

# For WAV (Lossless PCM 16-bit 44.1kHz)
yt-dlp \
  --extract-audio \
  --audio-format wav \
  --ffmpeg-location /usr/bin/ffmpeg \
  --output "/tmp/output/%(title)s.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

---

## 3. Worker Service `Dockerfile` (Google Cloud Run)

```dockerfile
FROM node:20-bullseye-slim

# Install system dependencies: FFmpeg, LibreOffice, Python3, yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    poppler-utils \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    fonts-liberation \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp release binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Build application
RUN npm run build

# Cloud Run listens on PORT environment variable (default 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
```
