export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  channel_name?: string | null;
  source_type: string;
  source_url?: string | null;
  external_id?: string | null;
  duration_seconds?: number | null;
  duration_sec?: number | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  status: "queued" | "downloading" | "ready" | "failed" | string;
  progress: number;
  error_message?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PaginatedProjects {
  items: Project[];
  total: number;
  page: number;
  limit: number;
  total_pages?: number;
}

export interface Analysis {
  id: string;
  project_id: string;
  mode: "funny" | "sad" | "both" | string;
  min_clip_seconds?: number;
  max_clip_seconds?: number;
  max_clips?: number;
  language?: string | null;
  status: "queued" | "downloading" | "transcribing" | "analyzing" | "ready" | "failed" | "cancelled" | string;
  stage?: "downloading" | "transcribing" | "analyzing" | "ready" | string;
  progress: number;
  error_message?: string | null;
  created_at: string;
  finished_at?: string | null;
  moments_count?: number | null;
}

export interface Moment {
  id: string;
  analysis_id: string;
  category: "funny" | "sad" | "custom" | string;
  start_sec: number;
  end_sec: number;
  score: number;
  title: string;
  reason: string;
  transcript_excerpt?: string;
  label?: string;
  transcript?: string;
  created_at?: string;
}

export interface SignalWindow {
  start_sec: number;
  end_sec: number;
  funny_score: number;
  sad_score: number;
  audio_energy?: number;
  laughter_score?: number;
  scream_score?: number;
  silence_score?: number;
  chat_rate?: number;
  emote_score?: number;
  sentiment_pos?: number;
  sentiment_neg?: number;
}

// Re-export Phase 4 & Phase 5 contract types from shared
export * from "@clipforge/shared";
