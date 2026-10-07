import sys
import os
import json
import glob
import re
import yt_dlp

def sanitize_youtube_url(url):
    # Extract video ID or clean standard video URL
    match = re.search(r'(?:v=|\/|shorts\/)([0-9A-Za-z_-]{11})', url)
    if match:
        return f"https://www.youtube.com/watch?v={match.group(1)}"
    return url

def download_audio(url, output_dir, target_format='mp3'):
    os.makedirs(output_dir, exist_ok=True)
    clean_url = sanitize_youtube_url(url)
    outtmpl = os.path.join(output_dir, '%(id)s.%(ext)s')
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': outtmpl,
        'quiet': True,
        'noprogress': True,
        'no_warnings': True,
        'noplaylist': True,
        'overwrites': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(clean_url, download=True)
        video_id = info.get('id', 'audio')
        title = info.get('title', 'YouTube Audio')
        
        pattern = os.path.join(output_dir, f"{video_id}.*")
        matching = glob.glob(pattern)
        file_path = matching[0] if matching else os.path.join(output_dir, f"{video_id}.webm")
        
        actual_ext = os.path.splitext(file_path)[1].replace('.', '') or 'webm'
        
        return {
            'success': True,
            'title': title,
            'video_id': video_id,
            'file_path': os.path.abspath(file_path),
            'ext': actual_ext,
            'duration': info.get('duration', 0),
            'filesize': os.path.getsize(file_path) if os.path.exists(file_path) else 0
        }

if __name__ == '__main__':
    if len(sys.argv) > 1:
        url = sys.argv[1]
        out_dir = sys.argv[2] if len(sys.argv) > 2 else 'temp_audio'
        target_fmt = sys.argv[3] if len(sys.argv) > 3 else 'mp3'
        try:
            res = download_audio(url, out_dir, target_fmt)
            print(f"__RESULT__{json.dumps(res)}")
        except Exception as e:
            print(f"__RESULT__{json.dumps({'success': False, 'error': str(e)})}")

