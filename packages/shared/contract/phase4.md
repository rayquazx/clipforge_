# PHASE 4 API CONTRACT (source of truth for backend and frontend)

## Conventions
- All endpoints require auth and check ownership. JSON uses snake_case. Times are in seconds
  (float) relative to the ORIGINAL source video unless stated otherwise.
- Errors: HTTP status + { "error": { "code": string, "message": string, "details"?: object } }
  Codes: validation_error, not_found, forbidden, version_conflict (409, details.current_clip
  contains the latest clip), source_unavailable, render_failed, rate_limited.
- Lists: { "items": [], "page": number, "limit": number, "total": number }

## Types
Implement in /packages/shared: Pydantic on backend, Zod on frontend.

### Clip
```typescript
interface Clip {
  id: string;
  project_id: string;
  analysis_id: string | null;
  moment_id: string | null;
  title: string;
  category: "funny" | "sad" | "custom";
  source_start_sec: number;
  source_end_sec: number;
  edit_state: {
    schema_version: 1;
    trim: { start: number; end: number };
    [key: string]: unknown; // unknown keys preserved
  };
  status: "draft" | "rendering" | "ready" | "failed";
  thumbnail_url: string | null;
  score: number | null;
  reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
```

### Render
```typescript
interface Render {
  id: string;
  clip_id: string;
  status: "queued" | "downloading" | "rendering" | "ready" | "failed" | "cancelled";
  progress: number; // 0-100
  options: RenderOptions;
  file_size: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}
```

### RenderOptions
```typescript
interface RenderOptions {
  resolution: "original" | "1080p" | "720p";
  fps: "original" | 30 | 60;
  quality: "high" | "medium" | "small";
  filename?: string;
}
```

### PreviewStatus
```typescript
interface PreviewStatus {
  status: "missing" | "preparing" | "ready" | "failed";
  progress: number; // 0-100
  url: string | null;
  offset_sec: number; // source time of the preview file's 0:00 (clip start minus padding)
  duration_sec: number;
  padding_sec: number;
  error_message: string | null;
}
```

### Waveform
```typescript
interface Waveform {
  peaks: number[]; // 0..1
  peaks_per_second: number;
  offset_sec: number;
  duration_sec: number;
}
```

### Thumbnails
```typescript
interface Thumbnails {
  sprite_url: string;
  frame_width: number;
  frame_height: number;
  columns: number;
  interval_sec: number;
  count: number;
  offset_sec: number;
}
```

## Endpoints
- `POST /analyses/{id}/clips` `{ moment_ids: string[] } -> { items: Clip[] }` (idempotent per moment)
- `POST /projects/{id}/clips` `{ start: number, end: number, title?: string } -> Clip`
- `GET /clips?category&project_id&status&q&sort=newest|score|duration&page&limit -> List<Clip>`
- `GET /clips/{id} -> Clip`
- `PATCH /clips/{id}` `{ title?: string, edit_state?: object, version: number } -> Clip` (409 on stale version)
- `POST /clips/{id}/duplicate -> Clip`
- `DELETE /clips/{id} -> 204`
- `POST /clips/{id}/preview/prepare -> PreviewStatus` (starts the job if needed)
- `GET /clips/{id}/preview/status -> PreviewStatus`
- `GET /clips/{id}/preview/video -> MP4 stream with HTTP Range support (206)`
- `GET /clips/{id}/waveform -> Waveform`
- `GET /clips/{id}/thumbnails -> Thumbnails`
- `POST /clips/{id}/renders` `{ options: RenderOptions } -> Render`
- `GET /clips/{id}/renders -> List<Render>`
- `GET /renders/{id} -> Render`
- `POST /renders/{id}/cancel -> Render`
- `GET /renders/{id}/download -> { url: string, expires_at: string, filename: string }`
- `POST /clips/bulk` `{ action: "export" | "delete", clip_ids: string[] } -> { accepted: string[], skipped: { id: string, reason: string }[] }`
- `GET /config -> { max_clip_seconds: number, preview_padding_sec: number, export_resolutions: string[] }`

## SSE
`GET /events/stream` (one stream per user; query `?clip_id=` optional filter)

Event types and payloads:
- `preview.progress` `{ clip_id, stage: "downloading"|"transcoding", progress }`
- `preview.ready` `{ clip_id }`
- `preview.failed` `{ clip_id, message }`
- `render.progress` `{ render_id, clip_id, stage: "downloading"|"rendering"|"finalizing", progress }`
- `render.ready` `{ render_id, clip_id }`
- `render.failed` `{ render_id, clip_id, message }`
- `render.cancelled` `{ render_id, clip_id }`

Each event formatted as:
```
event: <type>
data: <json>

```
With a heartbeat comment (`: heartbeat\n\n`) every 15s.

## Rules
- Preview time = source time - offset_sec. The frontend must convert between them.
- The trim must satisfy `1s <= (end - start) <= MAX_CLIP_SECONDS` (from `GET /config`).
- `GET /config` -> `{ max_clip_seconds, preview_padding_sec, export_resolutions: [...] }`
- Backend publishes an OpenAPI schema at `/openapi.json`. Any change to this contract
  must update this file and the shared types in the same commit.
