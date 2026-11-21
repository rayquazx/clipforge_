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

## Phase 4: Clips, Previews & Export Engine

### 1. Service Ports
- **Frontend Web App**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend & OpenAPI Docs**: [http://localhost:8000](http://localhost:8000) (Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs), OpenAPI JSON: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json))
- **MinIO S3 Web Console**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Pass: `minioadmin`)
- **MinIO S3 API**: `http://localhost:9000`
- **PostgreSQL**: `localhost:5432`
- **Redis Broker**: `localhost:6379`
*(Note: ClipForge does not use port 8080)*

### 2. FFmpeg Requirements
- FFmpeg 5.x+ with `libx264` and `aac` encoders enabled.
- `ffprobe` in system PATH for duration, stream, and resolution extraction.
- Installed and configured out-of-the-box inside the Docker container stack.

### 3. Object Storage Layout
Stored in the configured MinIO S3 bucket (`clipforge`):
- `source_media/{project_id}/{media_id}.mp4` — Full or range-cached source video downloads.
- `previews/{clip_id}/proxy_480p.mp4` — Low-bitrate H.264 proxy with padded boundaries for timeline scrubbing.
- `previews/{clip_id}/waveform.json` — Precomputed normalized audio peaks (0..1) for the audio waveform track.
- `previews/{clip_id}/thumbnails.jpg` — Sprite sheet with low-resolution video frames at regular intervals.
- `previews/{clip_id}/thumbnail.jpg` — Representative middle frame for clip cards.
- `renders/{clip_id}/{render_id}.mp4` — Final rendered, frame-accurate exported clip.

### 4. Caching & Automated Cleanup
- **Source Media Lazy Fetch**: Range downloads (`yt-dlp --download-sections`) with a Redis distributed lock prevent duplicate concurrent downloads for the same source video.
- **Storage Cleanup Job**: `media.cleanup_unused` runs periodically to remove cached source media older than `SOURCE_MEDIA_RETENTION_DAYS` (default 7 days). It safely skips any source media associated with currently active jobs (`queued`, `downloading`, `rendering`).

### 5. Environment Variables
Add to your `.env` file as needed:
```env
MAX_CLIP_SECONDS=180
PREVIEW_PADDING_SEC=5.0
SOURCE_MEDIA_RETENTION_DAYS=7
MAX_SOURCE_RESOLUTION=1080p
```

### 6. Development Seed Data
To populate real data for frontend development (creates a demo user, project, analysis, detected moments, ready clip with precomputed preview, waveform, sprite thumbnails, and a completed render):
```bash
# If running locally with Python:
make seed

# If running within Docker stack:
make seed-docker
```
Demo user credentials created by seed:
- **Email**: `streamer@clipforge.tv`
- **Password**: `clipforge123`

### 7. API Contract & cURL Examples

#### Retrieve Server Configuration
```bash
curl -X GET http://localhost:8000/config
```

#### List Clips with Filtering & Pagination
```bash
curl -X GET "http://localhost:8000/clips?category=funny&sort=newest&page=1&limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

#### Create Clips from Detected Moments (Idempotent)
```bash
curl -X POST "http://localhost:8000/analyses/{analysis_id}/clips" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"moment_ids": ["<MOMENT_ID>"]}'
```

#### Patch Clip with Optimistic Concurrency
```bash
curl -X PATCH "http://localhost:8000/clips/{clip_id}" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Epic Victory Royale",
    "edit_state": {
      "schema_version": 1,
      "trim": {"start": 10.5, "end": 45.0}
    },
    "version": 1
  }'
```
*Note: If `version` does not match the database version, returns HTTP `409 Conflict` with `details.current_clip`.*

#### Stream Preview Video (Supports HTTP 206 Partial Content Range Requests)
```bash
curl -X GET "http://localhost:8000/clips/{clip_id}/preview/video" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Range: bytes=0-1048576" -o chunk.mp4
```

#### Trigger Frame-Accurate Render
```bash
curl -X POST "http://localhost:8000/clips/{clip_id}/renders" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "options": {
      "resolution": "1080p",
      "fps": 60,
      "quality": "high",
      "filename": "my_highlight.mp4"
    }
  }'
```

#### Real-time Server-Sent Events (SSE)
```bash
curl -N -X GET "http://localhost:8000/events/stream?clip_id={clip_id}" \
  -H "Authorization: Bearer <TOKEN>"
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

## Phase 4: Frontend Web App (`/apps/web`)

The ClipForge frontend is built with **Next.js 14 App Router**, **TypeScript**, **Tailwind CSS**, **TanStack React Query**, and **Zustand**.

### 1. Running with Mocks vs Real Backend

You can toggle between fully isolated Mock Service Worker (MSW) mocking and the live FastAPI backend using the environment variable `NEXT_PUBLIC_USE_MOCKS`:

#### Mode A: Running entirely with MSW Mocks (No backend required)
```bash
# In apps/web/.env.local (or terminal)
NEXT_PUBLIC_USE_MOCKS=true
NEXT_PUBLIC_API_URL=http://localhost:8000

# Start development server
pnpm --filter @clipforge/web dev
```
In mock mode:
- MSW intercepts all contract endpoints (`/clips`, `/config`, `/events/stream`, `/renders`, etc.).
- A public sample MP4 (`/mock/sample.mp4`) is streamed with HTTP Range support.
- Waveforms, thumbnail sprite strips (`/mock/sprite.png`), and optimistic concurrency (409) conflict flows are fully simulated.

#### Mode B: Running with the Real Backend
```bash
# In apps/web/.env.local (or terminal)
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_URL=http://localhost:8000

# Start development server
pnpm --filter @clipforge/web dev
```
All requests communicate directly with the live FastAPI service on port 8000 and MinIO object storage.

### 2. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |
| `NEXT_PUBLIC_USE_MOCKS` | `false` | When `true`, enables MSW mocking in the browser |

### 3. Editor Modules Folder Structure

```
apps/web/src/
├── app/
│   ├── clips/
│   │   ├── layout.tsx                # Auth guard, sidebar & header layout for clips
│   │   ├── page.tsx                  # Clip Library: grid/list, filter, search, sort, bulk actions
│   │   └── [id]/
│   │       └── page.tsx              # Clip Editor: player, timeline, controls, details, autosave
│   ├── projects/[id]/page.tsx        # Project page: moment detection, custom clip modal, batch creation
│   └── layout.tsx                    # Root layout with MSW Provider & Toast Provider
├── components/
│   ├── editor/
│   │   ├── EditorPlayer.tsx          # Video player: preview states, looping, time mapping, speed
│   │   ├── EditorTimeline.tsx        # Timeline: waveform canvas, sprite strip, draggable trim handles
│   │   ├── EditorTrimControls.tsx    # Numeric inputs (HH:MM:SS.mmm), nudge (-1s/0.1s), play trimmed
│   │   ├── EditorDetailsPanel.tsx    # Title, category, score, transcript, render history
│   │   ├── EditorExportDialog.tsx    # Export dialog: resolution, fps, quality, filename validation
│   │   ├── EditorRenderProgress.tsx  # Live progress stages, progress bar, cancel, download button
│   │   ├── EditorConflictDialog.tsx  # 409 conflict dialog ("This clip was changed elsewhere")
│   │   └── useEditorShortcuts.ts     # Keyboard shortcuts (Space, I, O, arrows, J/K/L, Ctrl+S, Undo)
│   ├── clips/
│   │   └── BulkResultModal.tsx       # Bulk export/delete accepted and skipped items dialog
│   └── projects/
│       └── CreateCustomClipModal.tsx # Custom clip modal with video duration & /config validation
├── hooks/
│   ├── useEventStream.ts             # SSE EventSource hook with reconnect & 3s polling fallback
│   └── useAuth.ts                    # Zustand auth store hook with single-mount loadUser guard
├── lib/
│   ├── api.ts                        # Typed API client with central error handler (ApiError, 409 conflict)
│   └── time-mapping.ts               # Source <-> preview time conversion, formatting, parsing, snapping
├── mocks/
│   ├── browser.ts                    # MSW setupWorker initialization
│   ├── handlers.ts                   # Realistic MSW request handlers for all contract endpoints
│   └── mock-data.ts                  # Seed mock projects, analyses, moments, clips, renders
└── stores/
    ├── auth-store.ts                 # Auth session & token store
    └── editor-store.ts               # Clip editor state, 50-step undo/redo history, playback state
```

### 4. Running Frontend Tests

```bash
# Run unit & component tests (Vitest + React Testing Library)
pnpm --filter @clipforge/web test

# Run End-to-End browser tests on mocks (Playwright)
pnpm --filter @clipforge/web test:e2e
```

---

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
