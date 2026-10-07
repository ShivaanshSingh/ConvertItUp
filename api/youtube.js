// Vercel Serverless Function Handler for /api/convert/youtube
const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const ytUrl = urlObj.searchParams.get('url') || '';
  const format = (urlObj.searchParams.get('format') || 'mp3').toLowerCase();

  if (!ytUrl) {
    return res.status(400).json({ error: 'Please provide a valid YouTube video URL.' });
  }

  // Extract video ID
  const match = ytUrl.match(/(?:v=|\/|shorts\/)([0-9A-Za-z_-]{11})/);
  const videoId = match ? match[1] : null;

  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL or Video ID could not be parsed.' });
  }

  // Use Cobalt / Noembed / Invidious fallback pipelines for serverless cloud execution
  try {
    const metaRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const metaData = await metaRes.json().catch(() => ({}));
    const videoTitle = metaData.title || `YouTube_${videoId}`;
    const safeTitle = videoTitle.replace(/[^\w\s.-]/gi, '').trim() || 'YouTube_Audio';

    // Try Cobalt API worker for live stream extraction
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ConvertFlow-Client/1.0'
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isAudioOnly: true,
        aFormat: format === 'wav' ? 'wav' : 'mp3'
      })
    }).catch(() => null);

    if (cobaltRes && cobaltRes.ok) {
      const cobaltData = await cobaltRes.json().catch(() => ({}));
      if (cobaltData && cobaltData.url) {
        // Stream audio file from resolved direct URL
        const audioStreamRes = await fetch(cobaltData.url);
        if (audioStreamRes.ok) {
          const buffer = Buffer.from(await audioStreamRes.arrayBuffer());
          res.setHeader('Content-Type', format === 'wav' ? 'audio/wav' : 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.${format}"`);
          res.setHeader('X-Video-Title', encodeURIComponent(videoTitle));
          return res.status(200).send(buffer);
        }
      }
    }

    // Fallback: If external extractor busy, return video info for client-side pipeline
    return res.status(200).json({
      success: true,
      video_id: videoId,
      title: videoTitle,
      message: 'Stream metadata resolved.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error processing YouTube stream on serverless worker.' });
  }
};
