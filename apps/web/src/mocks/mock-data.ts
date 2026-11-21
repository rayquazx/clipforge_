import type { Clip, Render, Moment, Project, Analysis } from "@/types";

export const MOCK_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
export const MOCK_ANALYSIS_ID = "33333333-3333-3333-3333-333333333333";
export const MOCK_MOMENT_1_ID = "44444444-4444-4444-4444-444444444441";
export const MOCK_MOMENT_2_ID = "44444444-4444-4444-4444-444444444442";
export const MOCK_CLIP_1_ID = "55555555-5555-5555-5555-555555555555";
export const MOCK_RENDER_1_ID = "66666666-6666-6666-6666-666666666666";

export const initialProjects: Project[] = [
  {
    id: MOCK_PROJECT_ID,
    user_id: "00000000-0000-0000-0000-000000000000",
    title: "Epic Stream Highlights - Championship Finals",
    channel_name: "ProGamer",
    source_type: "twitch",
    source_url: "https://twitch.tv/videos/123456789",
    duration_seconds: 180,
    duration_sec: 180,
    thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
    status: "ready",
    progress: 100,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

export const initialAnalyses: Analysis[] = [
  {
    id: MOCK_ANALYSIS_ID,
    project_id: MOCK_PROJECT_ID,
    mode: "both",
    status: "ready",
    progress: 100,
    moments_count: 2,
    created_at: new Date(Date.now() - 3600000 * 23).toISOString(),
  },
];

export const initialMoments: Moment[] = [
  {
    id: MOCK_MOMENT_1_ID,
    analysis_id: MOCK_ANALYSIS_ID,
    category: "funny",
    start_sec: 15.0,
    end_sec: 35.0,
    score: 0.94,
    title: "Unbelievable Accidental Trickshot",
    reason: "Sudden pitch laughter and rapid chat reaction emotes",
    transcript_excerpt: "Wait did that actually hit? No way that just happened bro!",
    created_at: new Date().toISOString(),
  },
  {
    id: MOCK_MOMENT_2_ID,
    analysis_id: MOCK_ANALYSIS_ID,
    category: "sad",
    start_sec: 60.0,
    end_sec: 85.0,
    score: 0.88,
    title: "Heartbreaking Defeat in Overtime",
    reason: "Deep sigh and sudden silence across team audio",
    transcript_excerpt: "We were one point away... gg guys.",
    created_at: new Date().toISOString(),
  },
];

export const initialClips: Clip[] = [
  {
    id: MOCK_CLIP_1_ID,
    project_id: MOCK_PROJECT_ID,
    analysis_id: MOCK_ANALYSIS_ID,
    moment_id: MOCK_MOMENT_1_ID,
    title: "Unbelievable Accidental Trickshot",
    category: "funny",
    source_start_sec: 15.0,
    source_end_sec: 35.0,
    edit_state: {
      schema_version: 1,
      trim: {
        start: 15.0,
        end: 35.0,
      },
      custom_notes: "Keep this highlight for TikTok reel",
    },
    status: "ready",
    thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
    score: 0.94,
    reason: "Sudden pitch laughter and rapid chat reaction emotes",
    version: 1,
    created_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 20).toISOString(),
  },
];

export const initialRenders: Render[] = [
  {
    id: MOCK_RENDER_1_ID,
    clip_id: MOCK_CLIP_1_ID,
    status: "ready",
    progress: 100,
    options: {
      resolution: "1080p",
      fps: 60,
      quality: "high",
      filename: "trickshot_epic.mp4",
    },
    file_size: 15728640, // 15MB
    duration_sec: 20.0,
    width: 1920,
    height: 1080,
    error_message: null,
    created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
    finished_at: new Date(Date.now() - 3600000 * 10 + 25000).toISOString(),
  },
];
