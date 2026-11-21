# PHASE 6 API CONTRACT (Ads & Batch Export)

## Overview
Phase 6 adds an Ad Asset Library (video, image, text), Ad Placements (preroll, postroll, overlay, lower_third), Ad Templates, Timeline Synchronization, 360p Ads Preview Rendering, and a high-performance Batch Export pipeline with ZIP packaging and SSE progress tracking.

---

## 1. Time Rules & Coordination
- **MAIN Clip Time:** Placement times for `overlay` and `lower_third` are defined relative to the main trimmed clip (`0.0` = `edit_state.trim.start`).
- **Preroll Shift:** The renderer automatically shifts all overlays, lower thirds, subtitles, and text overlays by `preroll_duration_sec`.
- **Duration Formula:**
  $$\text{total\_duration\_sec} = \text{preroll\_duration\_sec} + \text{main\_duration\_sec} + \text{postroll\_duration\_sec}$$
- **Single Source of Truth:** `GET /clips/{id}/timeline-info` returns exact durations calculated by the shared engine.

---

## 2. Types & Schemas

### AdAsset
```typescript
interface AdAsset {
  id: string; // UUID
  user_id: string;
  name: string;
  kind: "video" | "image" | "text";
  url: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  file_size: number | null;
  text_config: AdTextConfig | null;
  tags: string[];
  status: "processing" | "ready" | "failed";
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface AdTextConfig {
  text: string;
  font: string;
  size: number;
  color: string;
  stroke?: string;
  bg?: string;
  bg_opacity?: number; // 0-1
}
```

### AdPlacement
```typescript
interface AdPlacement {
  id: string; // UUID
  ad_asset_id: string; // UUID
  type: "preroll" | "postroll" | "overlay" | "lower_third";
  timing: {
    anchor: "clip_start" | "clip_end"; // overlay/lower_third only; preroll/postroll ignore it
    offset_sec: number;                // seconds from anchor, in MAIN clip time
    duration_sec: number;              // required for image/text; defaults to asset duration for video
  };
  layout: {
    position: "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" | "custom";
    x?: number;     // 0-1 (fraction of video width for custom)
    y?: number;     // 0-1 (fraction of video height for custom)
    scale: number;  // 0-1 (fraction of video width, default 0.3)
    opacity: number;// 0-1 (default 1.0)
    margin: number; // 0-1 (default 0.05)
  };
  animation: "none" | "fade" | "slide";
  text_override: string | null;
  audio: {
    volume: number; // 0-1, default 1.0
  };
}
```

### AdTemplate
```typescript
interface AdTemplate {
  id: string; // UUID
  user_id: string;
  name: string;
  placements: Omit<AdPlacement, "id">[];
  usage_count: number;
  created_at: string;
  updated_at: string;
}
```

### Batch & BatchItem
```typescript
interface Batch {
  id: string; // UUID
  user_id: string;
  status: "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
  total: number;
  completed: number;
  failed: number;
  ad_template_id: string | null;
  options: RenderOptions;
  ads_mode: "replace" | "append" | "keep";
  items: BatchItem[];
  zip_ready: boolean;
  created_at: string;
  finished_at: string | null;
}

interface BatchItem {
  id: string;
  batch_id: string;
  clip_id: string;
  render_id: string | null;
  status: "queued" | "rendering" | "completed" | "failed";
  error_message: string | null;
}
```

### TimelineInfo
```typescript
interface TimelineInfo {
  main_duration_sec: number;
  preroll_duration_sec: number;
  postroll_duration_sec: number;
  total_duration_sec: number;
}
```

---

## 3. API Endpoints

### Ad Assets
* `GET /ad-assets?kind&q&page&limit` -> `{ items: AdAsset[], total, page, limit }`
* `POST /ad-assets` -> Multipart `(file, name, tags)` OR JSON for kind `"text"` -> `AdAsset`
* `PATCH /ad-assets/{id}` -> `{ name?, tags?, text_config? }` -> `AdAsset`
* `DELETE /ad-assets/{id}` -> `204 No Content` (Returns 409 `in_use` with `details.clip_count` if referenced in clips or templates, unless `?force=true`)
* `GET /ad-assets/{id}/preview` -> Streams video with HTTP 206 Range support, or returns direct image stream

### Ad Templates
* `GET /ad-templates` -> `AdTemplate[]`
* `POST /ad-templates` -> `{ name, placements }` -> `AdTemplate`
* `PATCH /ad-templates/{id}` -> `{ name?, placements? }` -> `AdTemplate`
* `DELETE /ad-templates/{id}` -> `204 No Content`
* `POST /clips/{id}/ads/apply-template` -> `{ template_id, mode: "replace" | "append" }` -> `Clip` (with optimistic concurrency version bump)

### Clip Timeline & Preview
* `GET /clips/{id}/timeline-info` -> `TimelineInfo`
* `POST /clips/{id}/renders/preview` -> `Render` (360p quick render with ads included)

### Batch Export
* `POST /batches` -> `{ clip_ids: string[], ad_template_id?: string | null, options: RenderOptions, ads_mode?: "replace" | "append" | "keep" }` -> `Batch`
* `GET /batches?page&limit` -> `{ items: Batch[], total, page, limit }`
* `GET /batches/{id}` -> `Batch`
* `POST /batches/{id}/cancel` -> `Batch` (cancels running renders and cleans temp files)
* `POST /batches/{id}/retry-failed` -> `Batch` (retries only failed items)
* `GET /batches/{id}/download` -> `{ url: string, expires_at: string, filename: string }` (Signed URL for ZIP)

---

## 4. SSE Events
* `batch.progress`: `{ batch_id: string, completed: number, failed: number, total: number }`
* `batch.completed`: `{ batch_id: string, status: string }`
* `ad_asset.ready`: `{ ad_asset_id: string }`

---

## 5. Error Codes
* `409 in_use`: Ad asset is currently referenced by clips or templates (`details.clip_count`).
* `413 media_too_large`: Asset file size exceeds limit (200MB max for video).
* `415 unsupported_media`: Unsupported format (only MP4, MOV, WEBM, PNG, JPG, WEBP).
* `422 invalid_placement`: Invalid coordinates, durations, or total preroll exceeds max (30s).
