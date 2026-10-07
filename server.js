const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
};

// ==========================================
// 1. PYTHON YT-DLP AUDIO DOWNLOADER
// ==========================================
function downloadYouTubeAudio(youtubeUrl, targetFormat = 'mp3') {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, 'temp_audio');
    const pythonProc = spawn('python', [
      path.join(__dirname, 'extract_audio.py'),
      youtubeUrl,
      tempDir,
      targetFormat
    ]);

    let stdoutData = '';
    let stderrData = '';

    pythonProc.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProc.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProc.on('close', (code) => {
      // 1. Look for explicit __RESULT__ marker
      const markerIdx = stdoutData.indexOf('__RESULT__');
      let resultJson = null;

      if (markerIdx !== -1) {
        const jsonPart = stdoutData.substring(markerIdx + '__RESULT__'.length).trim().split('\n')[0];
        try {
          resultJson = JSON.parse(jsonPart);
        } catch (e) {}
      }

      // 2. Fallback regex search for JSON
      if (!resultJson) {
        const match = stdoutData.match(/\{[\s\S]*"success"[\s\S]*\}/);
        if (match) {
          try {
            resultJson = JSON.parse(match[0]);
          } catch (e) {}
        }
      }

      if (resultJson) {
        if (resultJson.success) {
          resolve(resultJson);
        } else {
          reject(new Error(resultJson.error || 'YouTube download failed'));
        }
      } else {
        reject(new Error(stderrData.trim() || `Python exited with code ${code}: ${stdoutData.trim()}`));
      }
    });

    pythonProc.on('error', (err) => {
      reject(err);
    });
  });
}

function createServer(port) {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // ==========================================
    // API ENDPOINT: LIVE YOUTUBE TO MP3 / WAV
    // ==========================================
    if (pathname === '/api/convert/youtube') {
      const ytUrl = parsedUrl.searchParams.get('url') || '';
      const targetFormat = (parsedUrl.searchParams.get('format') || 'mp3').toLowerCase();
      
      if (!ytUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Please provide a valid YouTube video URL.' }));
      }

      console.log(`[YouTube Extractor] Downloading audio for: ${ytUrl}`);

      try {
        const result = await downloadYouTubeAudio(ytUrl, targetFormat);
        console.log(`[YouTube Extractor] Downloaded: "${result.title}" (${(result.filesize / 1024 / 1024).toFixed(2)} MB)`);

        if (!fs.existsSync(result.file_path)) {
          throw new Error('Downloaded audio file not found on disk.');
        }

        const rawTitle = result.title || 'YouTube Audio';
        const safeTitle = rawTitle.replace(/[^\w\s.-]/gi, '').trim() || 'YouTube_Audio';
        const fileExt = targetFormat === 'wav' ? 'wav' : (result.ext || 'mp3');
        const downloadName = `${safeTitle}.${fileExt}`;

        let contentType = 'audio/mpeg';
        if (fileExt === 'wav') contentType = 'audio/wav';
        else if (fileExt === 'webm') contentType = 'audio/webm';
        else if (fileExt === 'm4a') contentType = 'audio/mp4';

        const stat = fs.statSync(result.file_path);

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`,
          'X-Video-Title': encodeURIComponent(rawTitle),
          'Cache-Control': 'no-cache',
        });

        const readStream = fs.createReadStream(result.file_path);
        readStream.pipe(res);

        // Delete temporary file after sending
        res.on('finish', () => {
          fs.unlink(result.file_path, (err) => {
            if (err) console.warn('Temp file cleanup notice:', err.message);
          });
        });
      } catch (err) {
        console.error('[YouTube Extractor Error]:', err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Extraction error: ${err.message}` }));
        }
      }
      return;
    }

    // ==========================================
    // STATIC ASSETS & SPA ROUTING
    // ==========================================
    let reqUrl = pathname;
    if (reqUrl === '/' || reqUrl === '') {
      reqUrl = '/index.html';
    }

    const filePath = path.join(__dirname, reqUrl);
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          fs.readFile(path.join(__dirname, 'index.html'), (err, fallbackContent) => {
            if (err) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('404 Not Found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(fallbackContent, 'utf-8');
            }
          });
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${error.code}`);
        }
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        });
        res.end(content, 'utf-8');
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${port} is in use. Retrying on port ${port + 1}...`);
      createServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, () => {
    console.log(`\n🚀 ConvertFlow Dev Server running at:`);
    console.log(`   ➜ Local:   http://localhost:${port}/`);
    console.log(`   ➜ Network: http://127.0.0.1:${port}/\n`);
  });
}

createServer(DEFAULT_PORT);
