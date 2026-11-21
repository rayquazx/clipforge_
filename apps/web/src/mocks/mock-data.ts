import type {
  Clip,
  Render,
  Moment,
  Project,
  Analysis,
  AdAsset,
  AdTemplate,
  Batch,
} from "@/types";

export const MOCK_PROJECT_ID = "22222222-2222-2222-2222-222222222222";
export const MOCK_ANALYSIS_ID = "33333333-3333-3333-3333-333333333333";
export const MOCK_MOMENT_1_ID = "44444444-4444-4444-4444-444444444441";
export const MOCK_MOMENT_2_ID = "44444444-4444-4444-4444-444444444442";
export const MOCK_CLIP_1_ID = "55555555-5555-5555-5555-555555555555";
export const MOCK_CLIP_2_ID = "55555555-5555-5555-5555-555555555556";
export const MOCK_CLIP_3_ID = "55555555-5555-5555-5555-555555555557";
export const MOCK_RENDER_1_ID = "66666666-6666-6666-6666-666666666666";

export const MOCK_AD_ASSET_1_ID = "77777777-7777-7777-7777-777777777771";
export const MOCK_AD_ASSET_2_ID = "77777777-7777-7777-7777-777777777772";
export const MOCK_AD_ASSET_3_ID = "77777777-7777-7777-7777-777777777773";
export const MOCK_AD_TEMPLATE_1_ID = "88888888-8888-8888-8888-888888888881";
export const MOCK_BATCH_1_ID = "99999999-9999-9999-9999-999999999991";

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
      ads: [
        {
          id: "ad-placement-1",
          ad_asset_id: MOCK_AD_ASSET_1_ID,
          type: "preroll",
          timing: {
            duration_sec: 5.0,
          },
          layout: {
            position: "center",
            scale: 1.0,
          },
          audio: {
            volume: 0.8,
          },
        },
        {
          id: "ad-placement-2",
          ad_asset_id: MOCK_AD_ASSET_2_ID,
          type: "overlay",
          timing: {
            anchor: "clip_start",
            offset_sec: 2.0,
            duration_sec: 6.0,
          },
          layout: {
            position: "top_right",
            scale: 0.25,
            opacity: 0.9,
            margin: 0.05,
          },
          animation: "fade",
        },
      ],
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
  {
    id: MOCK_CLIP_2_ID,
    project_id: MOCK_PROJECT_ID,
    analysis_id: MOCK_ANALYSIS_ID,
    moment_id: MOCK_MOMENT_2_ID,
    title: "Heartbreaking Defeat in Overtime",
    category: "sad",
    source_start_sec: 60.0,
    source_end_sec: 85.0,
    edit_state: {
      schema_version: 1,
      trim: {
        start: 60.0,
        end: 85.0,
      },
      ads: [],
    },
    status: "ready",
    thumbnail_url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80",
    score: 0.88,
    reason: "Deep sigh and sudden silence across team audio",
    version: 1,
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 18).toISOString(),
  },
  {
    id: MOCK_CLIP_3_ID,
    project_id: MOCK_PROJECT_ID,
    analysis_id: MOCK_ANALYSIS_ID,
    title: "Clutch 1v3 Pistol Round",
    category: "funny",
    source_start_sec: 100.0,
    source_end_sec: 125.0,
    edit_state: {
      schema_version: 1,
      trim: {
        start: 100.0,
        end: 125.0,
      },
      ads: [],
    },
    status: "ready",
    thumbnail_url: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80",
    score: 0.91,
    reason: "Loud cheer and high chat activity",
    version: 1,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
];

export const initialAdAssets: AdAsset[] = [
  {
    id: MOCK_AD_ASSET_1_ID,
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Energy Drink 5s Sponsor Intro",
    kind: "video",
    url: "/mock/sample.mp4",
    thumbnail_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=800&q=80",
    duration_sec: 5.0,
    width: 1920,
    height: 1080,
    has_audio: true,
    file_size: 4194304,
    text_config: null,
    tags: ["sponsor", "energy", "intro"],
    status: "ready",
    usage_count: 3,
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
  {
    id: MOCK_AD_ASSET_2_ID,
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Gamer Brand Corner Watermark",
    kind: "image",
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
    thumbnail_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
    duration_sec: null,
    width: 1080,
    height: 1080,
    has_audio: false,
    file_size: 524288,
    text_config: null,
    tags: ["logo", "branding", "overlay"],
    status: "ready",
    usage_count: 4,
    created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 36).toISOString(),
  },
  {
    id: MOCK_AD_ASSET_3_ID,
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Creator Discount Code Banner",
    kind: "text",
    url: null,
    thumbnail_url: null,
    duration_sec: null,
    width: null,
    height: null,
    has_audio: false,
    file_size: null,
    text_config: {
      text: "USE CODE 'FORGE' FOR 20% OFF",
      font: "Montserrat",
      size: 38,
      color: "#FFFFFF",
      stroke: "#000000",
      bg: "#7C3AED",
      bg_opacity: 0.9,
    },
    tags: ["promo", "discount", "lower-third"],
    status: "ready",
    usage_count: 1,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

export const initialAdTemplates: AdTemplate[] = [
  {
    id: MOCK_AD_TEMPLATE_1_ID,
    user_id: "00000000-0000-0000-0000-000000000000",
    name: "Standard Stream Sponsor Pack",
    placements: [
      {
        ad_asset_id: MOCK_AD_ASSET_1_ID,
        type: "preroll",
        timing: {
          duration_sec: 5.0,
        },
        layout: {
          position: "center",
          scale: 1.0,
        },
        audio: {
          volume: 0.8,
        },
      },
      {
        ad_asset_id: MOCK_AD_ASSET_2_ID,
        type: "overlay",
        timing: {
          anchor: "clip_start",
          offset_sec: 2.0,
          duration_sec: 6.0,
        },
        layout: {
          position: "top_right",
          scale: 0.25,
          opacity: 0.9,
          margin: 0.05,
        },
        animation: "fade",
      },
    ],
    usage_count: 2,
    created_at: new Date(Date.now() - 3600000 * 30).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 30).toISOString(),
  },
];

export const initialBatches: Batch[] = [
  {
    id: MOCK_BATCH_1_ID,
    user_id: "00000000-0000-0000-0000-000000000000",
    status: "completed",
    total: 3,
    completed: 3,
    failed: 0,
    ad_template_id: MOCK_AD_TEMPLATE_1_ID,
    options: {
      resolution: "1080p",
      fps: 60,
      quality: "high",
    },
    ads_mode: "replace",
    items: [
      {
        id: "batch-item-1",
        batch_id: MOCK_BATCH_1_ID,
        clip_id: MOCK_CLIP_1_ID,
        render_id: MOCK_RENDER_1_ID,
        status: "completed",
        error_message: null,
      },
      {
        id: "batch-item-2",
        batch_id: MOCK_BATCH_1_ID,
        clip_id: MOCK_CLIP_2_ID,
        render_id: "render-mock-2",
        status: "completed",
        error_message: null,
      },
      {
        id: "batch-item-3",
        batch_id: MOCK_BATCH_1_ID,
        clip_id: MOCK_CLIP_3_ID,
        render_id: "render-mock-3",
        status: "completed",
        error_message: null,
      },
    ],
    zip_ready: true,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    finished_at: new Date(Date.now() - 3600000 * 5 + 45000).toISOString(),
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
