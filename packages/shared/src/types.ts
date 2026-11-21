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
  ads?: AdPlacement[];
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

// ============================================================================
// Phase 6 Ads & Batch Export Types
// ============================================================================

export type AdAssetKind = "video" | "image" | "text";
export type AdAssetStatus = "processing" | "ready" | "failed";

export interface AdTextConfig {
  text: string;
  font: string;
  size: number;
  color: string;
  stroke?: string;
  bg?: string;
  bg_opacity?: number;
}

export interface AdAsset {
  id: string;
  user_id: string;
  name: string;
  kind: AdAssetKind;
  url: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  file_size: number | null;
  text_config: AdTextConfig | null;
  tags: string[];
  status: AdAssetStatus;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export type AdPlacementType = "preroll" | "postroll" | "overlay" | "lower_third";
export type AdTimingAnchor = "clip_start" | "clip_end";
export type AdLayoutPosition =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | "center"
  | "custom";
export type AdAnimation = "none" | "fade" | "slide";

export interface AdTiming {
  anchor?: AdTimingAnchor;
  offset_sec?: number;
  duration_sec?: number;
}

export interface AdLayout {
  position: AdLayoutPosition;
  x?: number; // 0-1
  y?: number; // 0-1
  scale?: number; // 0-1, default 0.3
  opacity?: number; // 0-1, default 1.0
  margin?: number; // 0-1, default 0.05
}

export interface AdAudio {
  volume?: number; // 0-1, default 1.0
}

export interface AdPlacement {
  id: string;
  ad_asset_id: string;
  type: AdPlacementType;
  timing: AdTiming;
  layout: AdLayout;
  animation?: AdAnimation;
  text_override?: string | null;
  audio?: AdAudio;
}

export interface AdTemplate {
  id: string;
  user_id: string;
  name: string;
  placements: Omit<AdPlacement, "id">[];
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineInfo {
  main_duration_sec: number;
  preroll_duration_sec: number;
  postroll_duration_sec: number;
  total_duration_sec: number;
}

export type BatchStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export type BatchItemStatus = "queued" | "rendering" | "completed" | "failed";

export interface BatchItem {
  id: string;
  batch_id: string;
  clip_id: string;
  render_id: string | null;
  status: BatchItemStatus;
  error_message: string | null;
}

export interface Batch {
  id: string;
  user_id: string;
  status: BatchStatus;
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

