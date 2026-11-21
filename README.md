# ClipForge — AI Stream & Video Highlight Clipper

ClipForge automatically turns long streams and videos from **Twitch**, **YouTube**, and **Kick** into viral short clips with emotion analysis, speech-to-text, in-browser timeline editing, and ad insertion.

---

## Architecture Overview

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (dark streaming UI) + TanStack React Query + Recharts + Zustand
- **Backend API**: Python FastAPI (async SQLAlchemy 2.0, Pydantic v2, Alembic)
- **Background Worker**: Python Celery with Redis broker and PostgreSQL state
- **Speech-to-Text**: `faster-whisper` (CTranslate2) with VAD filter and word timestamps
- **Signal Analysis**: `librosa`, `soundfile`, `numpy`, and `scipy.signal`
- **Database**: PostgreSQL 16
- **Object Storage**: MinIO (S3-compatible)
- **Video Engine**: FFmpeg / ffprobe / yt-dlp

---

## Getting Started

### 1. Prerequisites
- [Docker & Docker Compose](https://www.docker.com/)
- [Node.js 18+](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Python 3.11+](https://www.python.org/)

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. API Keys Setup
- **Twitch Helix API**: Obtain Client ID & Secret from [Twitch Developer Console](https://dev.twitch.tv/console/apps).
- **YouTube Data API v3**: Obtain API key from [Google Cloud Console](https://console.cloud.google.com/).
- **Anthropic API (Optional for AI Titles)**: Set `ANTHROPIC_API_KEY` for Claude 3 Haiku clip title and reason generation. If omitted, ClipForge uses its built-in rule-based template title extractor.

---

## Phase 3: AI Moment Detection Pipeline

### 1. Model Download & Hardware (GPU vs CPU)
- On the first run, `faster-whisper` automatically downloads the specified model weight files (default: `small`, ~460MB) to the Hugging Face cache.
- **Hardware Acceleration**:
  - **NVIDIA GPU**: If CUDA is detected, worker automatically runs in `float16` for ~4x faster processing.
  - **CPU**: Default mode runs with `int8` quantization for optimal memory and CPU performance.
- Model size can be tuned in `.env`: `WHISPER_MODEL=base` (fastest) or `WHISPER_MODEL=small` (recommended balance).

### 2. Tuning Scoring Weights (`config/scoring.yaml`)
Scoring weights are loaded dynamically from `apps/worker/config/scoring.yaml`:
```yaml
funny:
  audio_laughter: 0.30            # Laughter frequency probability
  audio_energy_spike: 0.20        # Sudden volume jumps / shouting
  audio_scream: 0.10              # High-frequency spectral bursts
  chat_rate_spike: 0.15           # Message velocity spikes
  chat_funny_emotes: 0.15         # LUL, KEKW, OMEGALUL density
  transcript_positive_sentiment: 0.05
  transcript_reaction_keywords: 0.05
  music_penalty: -0.10            # Penalty for sustained music without speech

sad:
  transcript_negative_sentiment: 0.30
  transcript_sad_keywords: 0.20
  audio_sudden_silence: 0.15      # Silence following high-energy emotion
  audio_soft_energy: 0.10         # Soft/whisper voice energy
  chat_sad_emotes: 0.15           # Sadge, BibleThump, PepeHands, F
  chat_rate_spike: 0.10
```

### 3. Running Database Migrations
```bash
docker-compose exec api alembic upgrade head
```

### 4. Running the Complete Stack
```bash
docker-compose up --build
```

---

## Phase 3: Manual Testing Guide

1. Open **[http://localhost:3000](http://localhost:3000)** and sign in.
2. Select any **Ready** project or import a new YouTube / Twitch VOD.
3. On `/projects/[id]`:
   - Adjust the **Detection Mode** (Funny, Sad, or Both).
   - Set the clip length range (e.g. 15s to 60s).
   - Click **Start AI Detection**.
4. The **Progress View** displays real-time stages (`downloading` → `transcribing` → `analyzing`) with a progress percentage bar and a working **Cancel** button.
5. Once complete:
   - The interactive **Recharts Signal Timeline** renders funny and sad scores over time.
   - Click anywhere on the timeline chart to seek the video player!
   - The **Detected Moments** cards display the score, title, reason, time range, and transcript excerpt.
   - Click any moment to jump the embedded video preview directly to that start timestamp.
   - Edit clip start/end boundaries manually using the inline time inputs.
   - Click **Re-run Analysis** with different settings: all runs are preserved in the run history dropdown.

---

## Running Automated Tests

```bash
# Run API tests (FastAPI + mock auth & DB)
docker-compose exec api pytest apps/api/tests -v

# Run Worker tests (unit scoring, peak snapping, and 60s integration pipeline)
docker-compose exec worker pytest apps/worker/tests -v
```

---

## Known Limitations & Future Improvements
1. **Chat Replay Availability**: Official Twitch and Kick APIs currently do not expose live-chat replay for past VODs. ClipForge operates gracefully with audio and speech signals alone when chat is unavailable (`NullChatReplayProvider`). Future improvement: integrating unofficial IRC chat log scrapers.
2. **Audio-Only Laughter Heuristic**: The built-in audio signal analysis uses spectral flatness and energy burst modulation. For studio podcasts with heavy laugh tracks, acoustic classification can be further fine-tuned with a dedicated YAMNet audio checkpoint.
