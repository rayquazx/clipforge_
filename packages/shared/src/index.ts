import { z } from "zod";

export * from "./types";

// ----------------------------------------------------------------------------
// Core Enums
// ----------------------------------------------------------------------------
export const CategorySchema = z.enum(["funny", "sad", "custom"]);
export type Category = z.infer<typeof CategorySchema>;

export const ClipStatusSchema = z.enum(["draft", "rendering", "ready", "failed"]);
export type ClipStatus = z.infer<typeof ClipStatusSchema>;

export const TrimSchema = z.object({
  start: z.number(),
  end: z.number(),
});
export type Trim = z.infer<typeof TrimSchema>;

// ----------------------------------------------------------------------------
// Format & Crop
// ----------------------------------------------------------------------------
export const AspectRatioPresetSchema = z.enum(["16:9", "9:16", "1:1", "4:5"]);
export const CropModeSchema = z.enum(["center", "smart", "manual", "stacked"]);
export const BackgroundFillSchema = z.enum(["blur", "color", "none"]);

export const ManualCropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(0).max(100),
  h: z.number().min(0).max(100),
});

export const StackedCropSchema = z.object({
  game_crop: ManualCropSchema,
  cam_crop: ManualCropSchema,
});

export const FormatConfigSchema = z.object({
  preset: AspectRatioPresetSchema.default("16:9"),
  crop_mode: CropModeSchema.default("center"),
  manual_crop: ManualCropSchema.optional(),
  stacked: StackedCropSchema.optional(),
  background: BackgroundFillSchema.default("blur"),
  background_color: z.string().optional(),
});
export type FormatConfig = z.infer<typeof FormatConfigSchema>;

// ----------------------------------------------------------------------------
// Subtitles
// ----------------------------------------------------------------------------
export const SubtitlePositionSchema = z.enum(["bottom", "middle", "top"]);
export const SubtitlePresetTypeSchema = z.enum(["classic", "boxed", "karaoke", "bold_pop", "custom"]);

export const WordItemSchema = z.object({
  w: z.string(),
  start: z.number(),
  end: z.number(),
});

export const SubtitleItemSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z.array(WordItemSchema).optional(),
});

export const SubtitlesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  language: z.string().default("en"),
  style_id: z.string().optional(),
  position: SubtitlePositionSchema.default("bottom"),
  items: z.array(SubtitleItemSchema).default([]),
});
export type SubtitlesConfig = z.infer<typeof SubtitlesConfigSchema>;

export const SubtitleStyleSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100),
  font_family: z.string().default("Montserrat"),
  font_size: z.number().min(12).max(120).default(36),
  primary_color: z.string().default("#FFFFFF"),
  outline_color: z.string().default("#000000"),
  outline_width: z.number().min(0).max(20).default(2.5),
  box_color: z.string().nullable().optional(),
  shadow_color: z.string().nullable().optional(),
  position: SubtitlePositionSchema.default("bottom"),
  uppercase: z.boolean().default(false),
  preset_type: SubtitlePresetTypeSchema.default("classic"),
  is_system: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>;

// ----------------------------------------------------------------------------
// Overlays
// ----------------------------------------------------------------------------
export const OverlayAnimationSchema = z.enum(["none", "fade", "slide-up", "pop"]);

export const OverlayItemSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  text: z.string(),
  start: z.number(),
  end: z.number(),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  font: z.string().default("Inter"),
  size: z.number().min(12).max(200).default(32),
  color: z.string().default("#FFFFFF"),
  stroke: z.string().optional(),
  bg: z.string().optional(),
  opacity: z.number().min(0).max(1).default(1),
  animation: OverlayAnimationSchema.default("none"),
  z_index: z.number().default(1),
});
export type OverlayItem = z.infer<typeof OverlayItemSchema>;

// ----------------------------------------------------------------------------
// Background Music
// ----------------------------------------------------------------------------
export const MusicConfigSchema = z.object({
  track_id: z.string().nullable().optional(),
  uploaded_asset_id: z.string().nullable().optional(),
  volume: z.number().min(0).max(2).default(0.5),
  original_volume: z.number().min(0).max(2).default(1.0),
  fade_in: z.number().min(0).max(10).default(1.0),
  fade_out: z.number().min(0).max(10).default(1.5),
  start_offset: z.number().min(0).default(0),
  ducking: z.boolean().default(true),
});
export type MusicConfig = z.infer<typeof MusicConfigSchema>;

export const AudioAssetSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  title: z.string(),
  artist: z.string().nullable().optional(),
  duration_sec: z.number(),
  storage_key: z.string().optional(),
  url: z.string().optional(),
  file_size_bytes: z.number().optional(),
  is_bundled: z.boolean().default(false),
  license_info: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  waveform_peaks: z.array(z.number()).nullable().optional(),
  created_at: z.string().optional(),
});
export type AudioAsset = z.infer<typeof AudioAssetSchema>;

// ----------------------------------------------------------------------------
// Versioned Edit State
// ----------------------------------------------------------------------------
export const EditStateSchema = z
  .object({
    schema_version: z.number().default(2),
    trim: TrimSchema,
    format: FormatConfigSchema.optional(),
    subtitles: SubtitlesConfigSchema.optional(),
    overlays: z.array(OverlayItemSchema).default([]),
    music: MusicConfigSchema.optional(),
  })
  .passthrough(); // Preserve unknown keys for forward compatibility
export type EditState = z.infer<typeof EditStateSchema>;

export const EditVersionSchema = z.object({
  id: z.string().uuid(),
  clip_id: z.string().uuid(),
  version: z.number(),
  edit_state: EditStateSchema,
  created_at: z.string(),
});
export type EditVersion = z.infer<typeof EditVersionSchema>;

// ----------------------------------------------------------------------------
// Clip & Render
// ----------------------------------------------------------------------------
export const ClipSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  analysis_id: z.string().uuid().nullable(),
  moment_id: z.string().uuid().nullable(),
  title: z.string(),
  category: CategorySchema,
  source_start_sec: z.number(),
  source_end_sec: z.number(),
  edit_state: EditStateSchema,
  status: ClipStatusSchema,
  thumbnail_url: z.string().nullable(),
  score: z.number().nullable(),
  reason: z.string().nullable(),
  version: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Clip = z.infer<typeof ClipSchema>;

export const RenderStatusSchema = z.enum([
  "queued",
  "downloading",
  "rendering",
  "ready",
  "failed",
  "cancelled",
]);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const RenderOptionsSchema = z.object({
  resolution: z.enum(["original", "1080p", "720p", "360p"]).default("original"),
  fps: z.union([z.literal("original"), z.literal(30), z.literal(60)]).default("original"),
  quality: z.enum(["high", "medium", "small"]).default("high"),
  filename: z.string().optional(),
  include_srt: z.boolean().default(false),
  is_preview: z.boolean().default(false),
});
export type RenderOptions = z.infer<typeof RenderOptionsSchema>;

export const RenderSchema = z.object({
  id: z.string().uuid(),
  clip_id: z.string().uuid(),
  status: RenderStatusSchema,
  progress: z.number().min(0).max(100),
  options: RenderOptionsSchema,
  file_size: z.number().nullable(),
  duration_sec: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type Render = z.infer<typeof RenderSchema>;

export const PreviewStatusSchema = z.object({
  status: z.enum(["missing", "preparing", "ready", "failed"]),
  progress: z.number().min(0).max(100),
  url: z.string().nullable(),
  offset_sec: z.number(),
  duration_sec: z.number(),
  padding_sec: z.number(),
  error_message: z.string().nullable(),
});
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;

export const WaveformSchema = z.object({
  peaks: z.array(z.number()),
  peaks_per_second: z.number(),
  offset_sec: z.number(),
  duration_sec: z.number(),
});
export type Waveform = z.infer<typeof WaveformSchema>;

export const ThumbnailsSchema = z.object({
  sprite_url: z.string(),
  frame_width: z.number(),
  frame_height: z.number(),
  columns: z.number(),
  interval_sec: z.number(),
  count: z.number(),
  offset_sec: z.number(),
});
export type Thumbnails = z.infer<typeof ThumbnailsSchema>;

export const ConfigResponseSchema = z.object({
  max_clip_seconds: z.number(),
  preview_padding_sec: z.number(),
  export_resolutions: z.array(z.string()),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

export const DownloadResponseSchema = z.object({
  url: z.string(),
  expires_at: z.string(),
  filename: z.string(),
});
export type DownloadResponse = z.infer<typeof DownloadResponseSchema>;

export const BulkActionRequestSchema = z.object({
  action: z.enum(["export", "delete"]),
  clip_ids: z.array(z.string().uuid()),
});
export type BulkActionRequest = z.infer<typeof BulkActionRequestSchema>;

export const BulkActionResponseSchema = z.object({
  accepted: z.array(z.string().uuid()),
  skipped: z.array(
    z.object({
      id: z.string().uuid(),
      reason: z.string(),
    })
  ),
});
export type BulkActionResponse = z.infer<typeof BulkActionResponseSchema>;
