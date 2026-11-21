// ============================================================================
// ClipForge Phase 5 Pure TypeScript Types
// ============================================================================

export type Category = "funny" | "sad" | "custom";
export type ClipStatus = "draft" | "rendering" | "ready" | "failed";

export interface Trim {
  start: number;
  end: number;
}

// ----------------------------------------------------------------------------
// Format & Crop
// ----------------------------------------------------------------------------
export type AspectRatioPreset = "16:9" | "9:16" | "1:1" | "4:5";
export type CropMode = "center" | "smart" | "manual" | "stacked";
export type BackgroundFill = "blur" | "color" | "none";

export interface ManualCrop {
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  w: number; // percentage 0..100
  h: number; // percentage 0..100
}

export interface StackedCrop {
  game_crop: ManualCrop;
  cam_crop: ManualCrop;
}

export interface FormatConfig {
  preset: AspectRatioPreset;
  crop_mode: CropMode;
  manual_crop?: ManualCrop;
  stacked?: StackedCrop;
  background: BackgroundFill;
  background_color?: string;
}

// ----------------------------------------------------------------------------
// Subtitles
// ----------------------------------------------------------------------------
export type SubtitlePosition = "bottom" | "middle" | "top";
export type SubtitlePresetType = "classic" | "boxed" | "karaoke" | "bold_pop" | "custom";

export interface WordItem {
  w: string;
  start: number;
  end: number;
}

export interface SubtitleItem {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: WordItem[];
}

export interface SubtitlesConfig {
  enabled: boolean;
  language: string;
  style_id?: string;
  position: SubtitlePosition;
  items: SubtitleItem[];
}

export interface SubtitleStyle {
  id: string;
  user_id?: string | null;
  name: string;
  font_family: string;
  font_size: number;
  primary_color: string;
  outline_color: string;
  outline_width: number;
  box_color?: string | null;
  shadow_color?: string | null;
  position: SubtitlePosition;
  uppercase: boolean;
  preset_type: SubtitlePresetType;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
}

// ----------------------------------------------------------------------------
// Text Overlays
// ----------------------------------------------------------------------------
export type OverlayAnimation = "none" | "fade" | "slide-up" | "pop";

export interface OverlayItem {
  id: string;
  type: "text";
  text: string;
  start: number;
  end: number;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  font: string;
  size: number;
  color: string;
  stroke?: string;
  bg?: string;
  opacity: number;
  animation: OverlayAnimation;
  z_index?: number;
}

// ----------------------------------------------------------------------------
// Background Music
// ----------------------------------------------------------------------------
export interface MusicConfig {
  track_id?: string | null;
  uploaded_asset_id?: string | null;
  volume: number; // 0..1
  original_volume: number; // 0..1
  fade_in: number; // seconds
  fade_out: number; // seconds
  start_offset: number; // seconds
  ducking: boolean;
}

export interface AudioAsset {
  id: string;
  user_id?: string | null;
  title: string;
  artist?: string | null;
  duration_sec: number;
  storage_key?: string;
  url?: string;
  file_size_bytes?: number;
  is_bundled: boolean;
  license_info?: string | null;
  genre?: string | null;
  waveform_peaks?: number[] | null;
  created_at?: string;
}

// ----------------------------------------------------------------------------
// Versioned Edit State
// ----------------------------------------------------------------------------
export interface EditState {
  schema_version: number;
  trim: Trim;
  format?: FormatConfig;
  subtitles?: SubtitlesConfig;
  overlays?: OverlayItem[];
  music?: MusicConfig;
  [key: string]: unknown;
}

export interface EditVersion {
  id: string;
  clip_id: string;
  version: number;
  edit_state: EditState;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Smart Crop
// ----------------------------------------------------------------------------
export interface SmartCropKeyframe {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SmartCropResponse {
  clip_id: string;
  preset: AspectRatioPreset;
  keyframes: SmartCropKeyframe[];
  cached: boolean;
}

// ----------------------------------------------------------------------------
// Clips & Renders
// ----------------------------------------------------------------------------
export interface Clip {
  id: string;
  project_id: string;
  analysis_id: string | null;
  moment_id: string | null;
  title: string;
  category: Category;
  source_start_sec: number;
  source_end_sec: number;
  edit_state: EditState;
  status: ClipStatus;
  thumbnail_url: string | null;
  score: number | null;
  reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type RenderStatus =
  | "queued"
  | "downloading"
  | "rendering"
  | "ready"
  | "failed"
  | "cancelled";

export interface RenderOptions {
  resolution?: "original" | "1080p" | "720p" | "360p";
  fps?: "original" | 30 | 60;
  quality?: "high" | "medium" | "small";
  filename?: string;
  include_srt?: boolean;
  is_preview?: boolean;
}

export interface Render {
  id: string;
  clip_id: string;
  status: RenderStatus;
  progress: number;
  options: RenderOptions;
  file_size: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface PreviewStatus {
  status: "missing" | "preparing" | "ready" | "failed";
  progress: number;
  url: string | null;
  offset_sec: number;
  duration_sec: number;
  padding_sec: number;
  error_message: string | null;
}

export interface Waveform {
  peaks: number[];
  peaks_per_second: number;
  offset_sec: number;
  duration_sec: number;
}

export interface Thumbnails {
  sprite_url: string;
  frame_width: number;
  frame_height: number;
  columns: number;
  interval_sec: number;
  count: number;
  offset_sec: number;
}

export interface ConfigResponse {
  max_clip_seconds: number;
  preview_padding_sec: number;
  export_resolutions: string[];
}

export interface DownloadResponse {
  url: string;
  expires_at: string;
  filename: string;
}

export interface BulkActionRequest {
  action: "export" | "delete";
  clip_ids: string[];
}

export interface BulkActionResponse {
  accepted: string[];
  skipped: Array<{ id: string; reason: string }>;
}
