import { http, HttpResponse } from "msw";
import {
  MOCK_CLIP_1_ID,
  MOCK_PROJECT_ID,
  MOCK_ANALYSIS_ID,
  initialProjects,
  initialAnalyses,
  initialMoments,
  initialClips,
  initialRenders,
  initialAdAssets,
  initialAdTemplates,
  initialBatches,
} from "./mock-data";
import type {
  Clip,
  Render,
  RenderOptions,
  AdAsset,
  AdTemplate,
  Batch,
  AdPlacement,
  TimelineInfo,
} from "@/types";
import { calculateTimeline } from "@/lib/ad-math";

// In-memory state for mock service worker session
let clips: Clip[] = JSON.parse(JSON.stringify(initialClips));
let renders: Render[] = JSON.parse(JSON.stringify(initialRenders));
let moments = JSON.parse(JSON.stringify(initialMoments));
let projects = JSON.parse(JSON.stringify(initialProjects));
let analyses = JSON.parse(JSON.stringify(initialAnalyses));
let adAssets: AdAsset[] = JSON.parse(JSON.stringify(initialAdAssets));
let adTemplates: AdTemplate[] = JSON.parse(JSON.stringify(initialAdTemplates));
let batches: Batch[] = JSON.parse(JSON.stringify(initialBatches));
let currentUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "demo@clipforge.tv",
  display_name: "Demo Creator",
  created_at: new Date().toISOString(),
};

export function resetMockData() {
  clips = JSON.parse(JSON.stringify(initialClips));
  renders = JSON.parse(JSON.stringify(initialRenders));
  moments = JSON.parse(JSON.stringify(initialMoments));
  projects = JSON.parse(JSON.stringify(initialProjects));
  analyses = JSON.parse(JSON.stringify(initialAnalyses));
  adAssets = JSON.parse(JSON.stringify(initialAdAssets));
  adTemplates = JSON.parse(JSON.stringify(initialAdTemplates));
  batches = JSON.parse(JSON.stringify(initialBatches));
  currentUser = {
    id: "00000000-0000-0000-0000-000000000000",
    email: "demo@clipforge.tv",
    display_name: "Demo Creator",
    created_at: new Date().toISOString(),
  };
}

// Generate realistic sinusoidal audio peaks for waveform
function generatePeaks(count = 200): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = 0.2 + 0.6 * Math.sin(i / 8) * Math.sin(i / 3) + 0.2 * Math.random();
    peaks.push(Math.max(0.05, Math.min(1.0, Math.abs(val))));
  }
  return peaks;
}

export const handlers = [
  // --------------------------------------------------------------------------
  // Auth Mock Handlers
  // --------------------------------------------------------------------------
  http.get("*/auth/me", () => {
    return HttpResponse.json(currentUser);
  }),

  http.post("*/auth/login", async ({ request }) => {
    let email = "demo@clipforge.tv";
    try {
      const body = (await request.json()) as { email?: string; password?: string };
      if (body?.email) email = body.email;
    } catch {
      // Ignore
    }
    const displayName = email.includes("@") ? email.split("@")[0] : "Demo Creator";
    currentUser = {
      id: "00000000-0000-0000-0000-000000000000",
      email,
      display_name: displayName,
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json({
      access_token: "mock-jwt-access-token",
      refresh_token: "mock-jwt-refresh-token",
      token_type: "bearer",
      user: currentUser,
    });
  }),

  http.post("*/auth/register", async ({ request }) => {
    let email = "creator@clipforge.tv";
    let displayName = "New Creator";
    try {
      const body = (await request.json()) as {
        email?: string;
        password?: string;
        display_name?: string;
      };
      if (body?.email) email = body.email;
      if (body?.display_name) displayName = body.display_name;
      else if (body?.email) displayName = body.email.split("@")[0];
    } catch {
      // Ignore
    }
    currentUser = {
      id: "00000000-0000-0000-0000-000000000000",
      email,
      display_name: displayName,
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(
      {
        access_token: "mock-jwt-access-token",
        refresh_token: "mock-jwt-refresh-token",
        token_type: "bearer",
        user: currentUser,
      },
      { status: 201 }
    );
  }),

  // --------------------------------------------------------------------------
  // GET /config
  // --------------------------------------------------------------------------
  http.get("*/config", () => {
    return HttpResponse.json({
      max_clip_seconds: 60,
      preview_padding_sec: 5,
      export_resolutions: ["original", "1080p", "720p"],
    });
  }),

  // --------------------------------------------------------------------------
  // Projects & Analysis (for seamless end-to-end navigation)
  // --------------------------------------------------------------------------
  http.get("*/projects", ({ request }) => {
    if (request.headers.get("accept")?.includes("text/html")) {
      return; // Pass through to Next.js page route
    }
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "9", 10);
    const startIndex = (page - 1) * limit;
    const paginated = projects.slice(startIndex, startIndex + limit);

    return HttpResponse.json({
      items: paginated,
      page,
      limit,
      total: projects.length,
      total_pages: Math.max(1, Math.ceil(projects.length / limit)),
    });
  }),

  http.post("*/projects", async ({ request }) => {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Ignore
    }
    const newProject = {
      id: crypto.randomUUID ? crypto.randomUUID() : `proj-${Date.now()}`,
      user_id: currentUser.id,
      title: body.title || (body.url ? `Stream Import - ${body.url.slice(-10)}` : "New Highlight Project"),
      channel_name: currentUser.display_name,
      source_type: "twitch",
      source_url: body.url || "https://twitch.tv/videos/123456789",
      duration_seconds: 180,
      duration_sec: 180,
      thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
      status: "ready",
      progress: 100,
      created_at: new Date().toISOString(),
    };
    projects.unshift(newProject);
    return HttpResponse.json(newProject, { status: 201 });
  }),

  http.get("*/projects/:id", ({ request, params }) => {
    if (request.headers.get("accept")?.includes("text/html")) {
      return; // Pass through to Next.js page route
    }
    const project = projects.find((p: any) => p.id === params.id) || projects[0];
    return HttpResponse.json(project);
  }),

  http.get("*/projects/:id/analyses", ({ params }) => {
    const filtered = analyses.filter((a: any) => a.project_id === params.id);
    return HttpResponse.json(filtered.length ? filtered : analyses);
  }),

  http.get("*/analyses/:id/moments", () => {
    return HttpResponse.json(moments);
  }),

  http.get("*/analyses/:id/signals", () => {
    const signals = [];
    for (let sec = 0; sec <= 180; sec += 2) {
      signals.push({
        start_sec: sec,
        end_sec: sec + 2,
        funny_score: Math.max(0, Math.sin(sec / 15) * 0.9),
        sad_score: Math.max(0, Math.cos(sec / 20) * 0.7),
      });
    }
    return HttpResponse.json(signals);
  }),

  // --------------------------------------------------------------------------
  // POST /analyses/:id/clips
  // --------------------------------------------------------------------------
  http.post("*/analyses/:id/clips", async ({ request, params }) => {
    const body = (await request.json()) as { moment_ids: string[] };
    const created: Clip[] = [];

    for (const momentId of body.moment_ids) {
      // Idempotency: check if clip already exists for this moment
      const existing = clips.find((c) => c.moment_id === momentId);
      if (existing) {
        created.push(existing);
        continue;
      }

      const moment = moments.find((m: any) => m.id === momentId);
      const start = moment ? moment.start_sec : 10;
      const end = moment ? moment.end_sec : 30;
      const title = moment ? moment.title : "New Clip";

      const newClip: Clip = {
        id: crypto.randomUUID ? crypto.randomUUID() : `clip-${Date.now()}-${Math.random()}`,
        project_id: (params.id as string) || MOCK_PROJECT_ID,
        analysis_id: params.id as string,
        moment_id: momentId,
        title,
        category: (moment?.category as any) || "funny",
        source_start_sec: start,
        source_end_sec: end,
        edit_state: {
          schema_version: 1,
          trim: { start, end },
        },
        status: "ready",
        thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
        score: moment?.score || 0.9,
        reason: moment?.reason || "Created from moment",
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      clips.unshift(newClip);
      created.push(newClip);
    }

    return HttpResponse.json({ items: created });
  }),

  // --------------------------------------------------------------------------
  // POST /projects/:id/clips (Custom Clip)
  // --------------------------------------------------------------------------
  http.post("*/projects/:id/clips", async ({ request, params }) => {
    const body = (await request.json()) as { start: number; end: number; title?: string };
    const newClip: Clip = {
      id: crypto.randomUUID ? crypto.randomUUID() : `clip-custom-${Date.now()}`,
      project_id: params.id as string,
      analysis_id: null,
      moment_id: null,
      title: body.title || `Custom Clip (${body.start.toFixed(1)}s - ${body.end.toFixed(1)}s)`,
      category: "custom",
      source_start_sec: body.start,
      source_end_sec: body.end,
      edit_state: {
        schema_version: 1,
        trim: { start: body.start, end: body.end },
      },
      status: "ready",
      thumbnail_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
      score: null,
      reason: "Custom created by user",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    clips.unshift(newClip);
    return HttpResponse.json(newClip);
  }),

  // --------------------------------------------------------------------------
  // GET /clips (List with filter, sort, search, pagination)
  // --------------------------------------------------------------------------
  http.get("*/clips", ({ request }) => {
    if (request.headers.get("accept")?.includes("text/html")) {
      return; // Pass through to Next.js page route
    }
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const projectId = url.searchParams.get("project_id");
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.toLowerCase();
    const sort = url.searchParams.get("sort") || "newest";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "12", 10);

    let filtered = [...clips];

    if (category && category !== "all") {
      filtered = filtered.filter((c) => c.category === category);
    }
    if (projectId) {
      filtered = filtered.filter((c) => c.project_id === projectId);
    }
    if (status && status !== "all") {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (q) {
      filtered = filtered.filter(
        (c) => c.title.toLowerCase().includes(q) || c.reason?.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sort === "score") {
      filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (sort === "duration") {
      filtered.sort((a, b) => {
        const durA = (a.edit_state?.trim?.end || a.source_end_sec) - (a.edit_state?.trim?.start || a.source_start_sec);
        const durB = (b.edit_state?.trim?.end || b.source_end_sec) - (b.edit_state?.trim?.start || b.source_start_sec);
        return durB - durA;
      });
    } else {
      // "newest"
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    return HttpResponse.json({
      items: paginated,
      page,
      limit,
      total,
    });
  }),

  // --------------------------------------------------------------------------
  // GET /clips/:id
  // --------------------------------------------------------------------------
  http.get("*/clips/:id", ({ request, params }) => {
    if (request.headers.get("accept")?.includes("text/html")) {
      return; // Pass through to Next.js page route
    }
    const clip = clips.find((c) => c.id === params.id);
    if (!clip) {
      // Fallback for default clip ID if missing
      return HttpResponse.json(clips[0] || initialClips[0]);
    }
    return HttpResponse.json(clip);
  }),

  // --------------------------------------------------------------------------
  // PATCH /clips/:id (Optimistic Concurrency 409 check)
  // --------------------------------------------------------------------------
  http.patch("*/clips/:id", async ({ request, params }) => {
    const body = (await request.json()) as {
      title?: string;
      edit_state?: any;
      version: number;
    };
    const clipIndex = clips.findIndex((c) => c.id === params.id);
    const clip = clipIndex >= 0 ? clips[clipIndex] : clips[0];

    // Optimistic concurrency check
    if (body.version !== clip.version) {
      return HttpResponse.json(
        {
          error: {
            code: "version_conflict",
            message: "Clip was updated by another process",
            details: {
              current_clip: clip,
            },
          },
        },
        { status: 409 }
      );
    }

    // Preserve unknown keys in edit_state per contract!
    const updatedEditState = body.edit_state
      ? { ...clip.edit_state, ...body.edit_state }
      : clip.edit_state;

    const updatedClip: Clip = {
      ...clip,
      title: body.title !== undefined ? body.title : clip.title,
      edit_state: updatedEditState,
      version: clip.version + 1,
      updated_at: new Date().toISOString(),
    };

    if (clipIndex >= 0) {
      clips[clipIndex] = updatedClip;
    }

    return HttpResponse.json(updatedClip);
  }),

  // --------------------------------------------------------------------------
  // POST /clips/:id/duplicate
  // --------------------------------------------------------------------------
  http.post("*/clips/:id/duplicate", ({ params }) => {
    const clip = clips.find((c) => c.id === params.id) || clips[0];
    const duplicated: Clip = {
      ...clip,
      id: crypto.randomUUID ? crypto.randomUUID() : `clip-copy-${Date.now()}`,
      title: `${clip.title} (Copy)`,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    clips.unshift(duplicated);
    return HttpResponse.json(duplicated);
  }),

  // --------------------------------------------------------------------------
  // DELETE /clips/:id
  // --------------------------------------------------------------------------
  http.delete("*/clips/:id", ({ params }) => {
    clips = clips.filter((c) => c.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  // --------------------------------------------------------------------------
  // POST /clips/:id/preview/prepare
  // --------------------------------------------------------------------------
  http.post("*/clips/:id/preview/prepare", ({ params }) => {
    const clip = clips.find((c) => c.id === params.id) || clips[0];
    const offset = Math.max(0, clip.source_start_sec - 5);
    const duration = clip.source_end_sec - clip.source_start_sec + 10;

    return HttpResponse.json({
      status: "ready",
      progress: 100,
      url: `/clips/${clip.id}/preview/video`,
      offset_sec: offset,
      duration_sec: duration,
      padding_sec: 5,
      error_message: null,
    });
  }),

  // --------------------------------------------------------------------------
  // GET /clips/:id/preview/status
  // --------------------------------------------------------------------------
  http.get("*/clips/:id/preview/status", ({ params }) => {
    const clip = clips.find((c) => c.id === params.id) || clips[0];
    const offset = Math.max(0, clip.source_start_sec - 5);
    const duration = clip.source_end_sec - clip.source_start_sec + 10;

    return HttpResponse.json({
      status: "ready",
      progress: 100,
      url: `/clips/${clip.id}/preview/video`,
      offset_sec: offset,
      duration_sec: duration,
      padding_sec: 5,
      error_message: null,
    });
  }),

  // --------------------------------------------------------------------------
  // GET /clips/:id/preview/video (Supports HTTP 206 / streaming sample.mp4)
  // --------------------------------------------------------------------------
  http.get("*/clips/:id/preview/video", async ({ request }) => {
    // Forward / redirect to the mock sample video stored in /mock/sample.mp4
    return HttpResponse.redirect("/mock/sample.mp4", 302);
  }),

  // --------------------------------------------------------------------------
  // GET /clips/:id/waveform
  // --------------------------------------------------------------------------
  http.get("*/clips/:id/waveform", ({ params }) => {
    const clip = clips.find((c) => c.id === params.id) || clips[0];
    const offset = Math.max(0, clip.source_start_sec - 5);
    const duration = clip.source_end_sec - clip.source_start_sec + 10;

    return HttpResponse.json({
      peaks: generatePeaks(250),
      peaks_per_second: 50,
      offset_sec: offset,
      duration_sec: duration,
    });
  }),

  // --------------------------------------------------------------------------
  // GET /clips/:id/thumbnails
  // --------------------------------------------------------------------------
  http.get("*/clips/:id/thumbnails", ({ params }) => {
    const clip = clips.find((c) => c.id === params.id) || clips[0];
    const offset = Math.max(0, clip.source_start_sec - 5);

    return HttpResponse.json({
      sprite_url: "/mock/sprite.png",
      frame_width: 160,
      frame_height: 90,
      columns: 10,
      interval_sec: 2,
      count: 10,
      offset_sec: offset,
    });
  }),

  // --------------------------------------------------------------------------
  // POST /clips/:id/renders
  // --------------------------------------------------------------------------
  http.post("*/clips/:id/renders", async ({ request, params }) => {
    const body = (await request.json()) as { options: RenderOptions };
    const clip = clips.find((c) => c.id === params.id) || clips[0];

    const newRender: Render = {
      id: crypto.randomUUID ? crypto.randomUUID() : `render-${Date.now()}`,
      clip_id: clip.id,
      status: "ready", // Finished ready render for mock test workflows
      progress: 100,
      options: body.options || { resolution: "1080p", fps: 60, quality: "high" },
      file_size: 18432000,
      duration_sec: clip.source_end_sec - clip.source_start_sec,
      width: 1920,
      height: 1080,
      error_message: null,
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };

    renders.unshift(newRender);
    return HttpResponse.json(newRender);
  }),

  // --------------------------------------------------------------------------
  // GET /clips/:id/renders
  // --------------------------------------------------------------------------
  http.get("*/clips/:id/renders", ({ params }) => {
    const clipRenders = renders.filter((r) => r.clip_id === params.id);
    return HttpResponse.json({
      items: clipRenders.length ? clipRenders : renders,
      total: clipRenders.length || renders.length,
      page: 1,
      limit: 10,
    });
  }),

  // --------------------------------------------------------------------------
  // GET /renders/:id
  // --------------------------------------------------------------------------
  http.get("*/renders/:id", ({ params }) => {
    const render = renders.find((r) => r.id === params.id) || renders[0];
    return HttpResponse.json(render);
  }),

  // --------------------------------------------------------------------------
  // POST /renders/:id/cancel
  // --------------------------------------------------------------------------
  http.post("*/renders/:id/cancel", ({ params }) => {
    const render = renders.find((r) => r.id === params.id) || renders[0];
    render.status = "cancelled";
    return HttpResponse.json(render);
  }),

  // --------------------------------------------------------------------------
  // GET /renders/:id/download
  // --------------------------------------------------------------------------
  http.get("*/renders/:id/download", ({ params }) => {
    const render = renders.find((r) => r.id === params.id) || renders[0];
    const filename = render.options.filename || `clipforge_render_${render.id.slice(0, 8)}.mp4`;
    return HttpResponse.json({
      url: "/mock/sample.mp4",
      expires_at: "2099-01-01T00:00:00Z",
      filename,
    });
  }),

  // --------------------------------------------------------------------------
  // POST /clips/bulk
  // --------------------------------------------------------------------------
  http.post("*/clips/bulk", async ({ request }) => {
    const body = (await request.json()) as { action: "export" | "delete"; clip_ids: string[] };

    if (body.action === "delete") {
      clips = clips.filter((c) => !body.clip_ids.includes(c.id));
      return HttpResponse.json({
        accepted: body.clip_ids,
        skipped: [],
      });
    }

    if (body.action === "export") {
      // Create a render for each accepted clip
      for (const id of body.clip_ids) {
        renders.unshift({
          id: crypto.randomUUID ? crypto.randomUUID() : `bulk-render-${Date.now()}-${id.slice(0, 4)}`,
          clip_id: id,
          status: "rendering",
          progress: 25,
          options: { resolution: "1080p", fps: 60, quality: "high" },
          file_size: null,
          duration_sec: 20.0,
          width: 1920,
          height: 1080,
          error_message: null,
          created_at: new Date().toISOString(),
          finished_at: null,
        });
      }

      return HttpResponse.json({
        accepted: body.clip_ids,
        skipped: [],
      });
    }

    return HttpResponse.json({ accepted: [], skipped: [] });
  }),

  // ==========================================================================
  // Phase 6 Ads & Batch Export Mock Handlers
  // ==========================================================================

  // 1. GET /ad-assets
  http.get("*/ad-assets", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const q = url.searchParams.get("q")?.toLowerCase();
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "12", 10);

    let filtered = [...adAssets];
    if (kind && kind !== "all") {
      filtered = filtered.filter((a) => a.kind === kind);
    }
    if (q) {
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    return HttpResponse.json({
      items: paginated,
      total,
      page,
      limit,
    });
  }),

  // 2. POST /ad-assets (Multipart file upload or text JSON)
  http.post("*/ad-assets", async ({ request }) => {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const name = (formData.get("name") as string) || file?.name || "Uploaded Ad";
      const tagsRaw = formData.get("tags") as string | null;
      const tags = tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : ["uploaded"];

      if (!file) {
        return HttpResponse.json(
          { error: { code: "validation_error", message: "File is required." } },
          { status: 422 }
        );
      }

      // Format validation
      const ext = file.name.split(".").pop()?.toLowerCase();
      const validVideos = ["mp4", "mov", "webm"];
      const validImages = ["png", "jpg", "jpeg", "webp"];
      const isVideo = validVideos.includes(ext || "");
      const isImage = validImages.includes(ext || "");

      if (!isVideo && !isImage) {
        return HttpResponse.json(
          {
            error: {
              code: "unsupported_media",
              message: "Unsupported media format. Allowed: MP4, MOV, WEBM, PNG, JPG, WEBP.",
            },
          },
          { status: 415 }
        );
      }

      // Max size check: 200MB
      if (file.size > 200 * 1024 * 1024) {
        return HttpResponse.json(
          {
            error: {
              code: "media_too_large",
              message: "File exceeds maximum size limit (200MB).",
            },
          },
          { status: 413 }
        );
      }

      const newId = `ad-asset-${Date.now()}`;
      const newAsset: AdAsset = {
        id: newId,
        user_id: currentUser.id,
        name,
        kind: isVideo ? "video" : "image",
        url: isVideo ? "/mock/sample.mp4" : "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
        thumbnail_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
        duration_sec: isVideo ? 5.0 : null,
        width: 1920,
        height: 1080,
        has_audio: isVideo,
        file_size: file.size,
        text_config: null,
        tags,
        status: "processing", // simulated processing
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      adAssets.unshift(newAsset);

      // Simulate asynchronous processing completion and SSE event
      setTimeout(() => {
        const found = adAssets.find((a) => a.id === newId);
        if (found) {
          found.status = "ready";
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("clipforge:sse", {
                detail: { event: "ad_asset.ready", data: { ad_asset_id: newId } },
              })
            );
          }
        }
      }, 1200);

      return HttpResponse.json(newAsset, { status: 201 });
    }

    // JSON text asset
    try {
      const body = (await request.json()) as any;
      const newId = `ad-text-${Date.now()}`;
      const newAsset: AdAsset = {
        id: newId,
        user_id: currentUser.id,
        name: body.name || "Text Ad",
        kind: "text",
        url: null,
        thumbnail_url: null,
        duration_sec: null,
        width: null,
        height: null,
        has_audio: false,
        file_size: null,
        text_config: body.text_config,
        tags: body.tags || ["text", "overlay"],
        status: "ready",
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      adAssets.unshift(newAsset);
      return HttpResponse.json(newAsset, { status: 201 });
    } catch {
      return HttpResponse.json(
        { error: { code: "validation_error", message: "Invalid payload" } },
        { status: 422 }
      );
    }
  }),

  // 3. PATCH /ad-assets/:id
  http.patch("*/ad-assets/:id", async ({ params, request }) => {
    const id = params.id as string;
    const body = (await request.json()) as any;
    const index = adAssets.findIndex((a) => a.id === id);
    if (index === -1) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Ad asset not found" } },
        { status: 404 }
      );
    }

    adAssets[index] = {
      ...adAssets[index],
      name: body.name !== undefined ? body.name : adAssets[index].name,
      tags: body.tags !== undefined ? body.tags : adAssets[index].tags,
      text_config: body.text_config !== undefined ? body.text_config : adAssets[index].text_config,
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json(adAssets[index]);
  }),

  // 4. DELETE /ad-assets/:id (checks in_use unless ?force=true)
  http.delete("*/ad-assets/:id", ({ params, request }) => {
    const id = params.id as string;
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    const index = adAssets.findIndex((a) => a.id === id);
    if (index === -1) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Ad asset not found" } },
        { status: 404 }
      );
    }

    // Count clips referencing this asset
    let clipCount = 0;
    for (const c of clips) {
      if (c.edit_state?.ads?.some((p: AdPlacement) => p.ad_asset_id === id)) {
        clipCount += 1;
      }
    }

    if (clipCount > 0 && !force) {
      return HttpResponse.json(
        {
          error: {
            code: "in_use",
            message: `This ad asset is currently used in ${clipCount} clip${clipCount === 1 ? "" : "s"}.`,
            details: { clip_count: clipCount },
          },
        },
        { status: 409 }
      );
    }

    // If force delete, remove placement from clips
    if (clipCount > 0 && force) {
      clips.forEach((c) => {
        if (c.edit_state?.ads) {
          c.edit_state.ads = c.edit_state.ads.filter(
            (p: AdPlacement) => p.ad_asset_id !== id
          );
        }
      });
    }

    adAssets.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // 5. GET /ad-assets/:id/preview
  http.get("*/ad-assets/:id/preview", () => {
    return HttpResponse.json({ url: "/mock/sample.mp4" });
  }),

  // 6. GET /ad-templates
  http.get("*/ad-templates", () => {
    return HttpResponse.json(adTemplates);
  }),

  // 7. POST /ad-templates
  http.post("*/ad-templates", async ({ request }) => {
    const body = (await request.json()) as any;
    const newTemplate: AdTemplate = {
      id: `template-${Date.now()}`,
      user_id: currentUser.id,
      name: body.name || "Untitled Template",
      placements: body.placements || [],
      usage_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    adTemplates.unshift(newTemplate);
    return HttpResponse.json(newTemplate, { status: 201 });
  }),

  // 8. PATCH /ad-templates/:id
  http.patch("*/ad-templates/:id", async ({ params, request }) => {
    const id = params.id as string;
    const body = (await request.json()) as any;
    const index = adTemplates.findIndex((t) => t.id === id);
    if (index === -1) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Template not found" } },
        { status: 404 }
      );
    }
    adTemplates[index] = {
      ...adTemplates[index],
      name: body.name !== undefined ? body.name : adTemplates[index].name,
      placements: body.placements !== undefined ? body.placements : adTemplates[index].placements,
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(adTemplates[index]);
  }),

  // 9. DELETE /ad-templates/:id
  http.delete("*/ad-templates/:id", ({ params }) => {
    const id = params.id as string;
    const index = adTemplates.findIndex((t) => t.id === id);
    if (index !== -1) {
      adTemplates.splice(index, 1);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // 10. POST /clips/:id/ads/apply-template
  http.post("*/clips/:id/ads/apply-template", async ({ params, request }) => {
    const clipId = params.id as string;
    const body = (await request.json()) as { template_id: string; mode: "replace" | "append" };
    const clip = clips.find((c) => c.id === clipId);
    const template = adTemplates.find((t) => t.id === body.template_id);

    if (!clip || !template) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Clip or template not found" } },
        { status: 404 }
      );
    }

    const newPlacements: AdPlacement[] = template.placements.map((p, idx) => ({
      ...p,
      id: `p-${Date.now()}-${idx}`,
    }));

    if (!clip.edit_state) {
      clip.edit_state = { schema_version: 1, trim: { start: 0, end: 30 } };
    }

    if (body.mode === "replace") {
      clip.edit_state.ads = newPlacements;
    } else {
      clip.edit_state.ads = [...(clip.edit_state.ads || []), ...newPlacements];
    }

    clip.version += 1;
    clip.updated_at = new Date().toISOString();
    template.usage_count += 1;

    return HttpResponse.json(clip);
  }),

  // 11. GET /clips/:id/timeline-info
  http.get("*/clips/:id/timeline-info", ({ params }) => {
    const clipId = params.id as string;
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Clip not found" } },
        { status: 404 }
      );
    }

    const start = clip.edit_state?.trim?.start ?? clip.source_start_sec ?? 0;
    const end = clip.edit_state?.trim?.end ?? clip.source_end_sec ?? 30;
    const mainDur = Math.max(0, end - start);
    const ads = clip.edit_state?.ads || [];

    const assetMap = new Map(adAssets.map((a) => [a.id, a]));
    const timeline = calculateTimeline(mainDur, ads, assetMap);

    return HttpResponse.json(timeline);
  }),

  // 12. POST /clips/:id/renders/preview (360p quick render with ads)
  http.post("*/clips/:id/renders/preview", ({ params }) => {
    const clipId = params.id as string;
    const renderId = `render-preview-${Date.now()}`;
    const newRender: Render = {
      id: renderId,
      clip_id: clipId,
      status: "ready",
      progress: 100,
      options: {
        resolution: "360p",
        fps: 30,
        quality: "low",
        filename: "preview_360p_ads.mp4",
      },
      file_size: 2097152,
      duration_sec: 25.0,
      width: 640,
      height: 360,
      error_message: null,
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };

    renders.unshift(newRender);
    return HttpResponse.json(newRender, { status: 201 });
  }),

  // 13. POST /batches
  http.post("*/batches", async ({ request }) => {
    const body = (await request.json()) as {
      clip_ids: string[];
      ad_template_id?: string | null;
      options: RenderOptions;
      ads_mode?: "replace" | "append" | "keep";
    };

    const batchId = `batch-${Date.now()}`;
    const items = body.clip_ids.map((clipId, index) => ({
      id: `batch-item-${Date.now()}-${index}`,
      batch_id: batchId,
      clip_id: clipId,
      render_id: `render-batch-${Date.now()}-${index}`,
      status: "queued" as const,
      error_message: null,
    }));

    const newBatch: Batch = {
      id: batchId,
      user_id: currentUser.id,
      status: "running",
      total: items.length,
      completed: 0,
      failed: 0,
      ad_template_id: body.ad_template_id || null,
      options: body.options,
      ads_mode: body.ads_mode || "keep",
      items,
      zip_ready: false,
      created_at: new Date().toISOString(),
      finished_at: null,
    };

    batches.unshift(newBatch);

    // Simulate progressive execution across items (making 1 item fail if > 1 items to test retry)
    setTimeout(() => {
      const b = batches.find((x) => x.id === batchId);
      if (!b) return;

      b.items.forEach((item, idx) => {
        if (idx === b.items.length - 1 && b.items.length > 1) {
          // One item fails to test retry flow
          item.status = "failed";
          item.error_message = "Transcoding error: corrupted frame in source segment";
          b.failed += 1;
        } else {
          item.status = "completed";
          b.completed += 1;
        }
      });

      b.status = b.failed > 0 ? "completed_with_errors" : "completed";
      b.zip_ready = true;
      b.finished_at = new Date().toISOString();

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("clipforge:sse", {
            detail: {
              event: "batch.completed",
              data: { batch_id: batchId, status: b.status },
            },
          })
        );
      }
    }, 1500);

    return HttpResponse.json(newBatch, { status: 201 });
  }),

  // 14. GET /batches
  http.get("*/batches", ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    const startIndex = (page - 1) * limit;
    const paginated = batches.slice(startIndex, startIndex + limit);

    return HttpResponse.json({
      items: paginated,
      total: batches.length,
      page,
      limit,
    });
  }),

  // 15. GET /batches/:id
  http.get("*/batches/:id", ({ params }) => {
    const id = params.id as string;
    const batch = batches.find((b) => b.id === id);
    if (!batch) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Batch not found" } },
        { status: 404 }
      );
    }
    return HttpResponse.json(batch);
  }),

  // 16. POST /batches/:id/cancel
  http.post("*/batches/:id/cancel", ({ params }) => {
    const id = params.id as string;
    const batch = batches.find((b) => b.id === id);
    if (!batch) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Batch not found" } },
        { status: 404 }
      );
    }
    batch.status = "cancelled";
    batch.items.forEach((item) => {
      if (item.status === "queued" || item.status === "rendering") {
        item.status = "failed";
        item.error_message = "Cancelled by user";
      }
    });
    return HttpResponse.json(batch);
  }),

  // 17. POST /batches/:id/retry-failed
  http.post("*/batches/:id/retry-failed", ({ params }) => {
    const id = params.id as string;
    const batch = batches.find((b) => b.id === id);
    if (!batch) {
      return HttpResponse.json(
        { error: { code: "not_found", message: "Batch not found" } },
        { status: 404 }
      );
    }

    batch.items.forEach((item) => {
      if (item.status === "failed") {
        item.status = "completed";
        item.error_message = null;
        batch.failed = Math.max(0, batch.failed - 1);
        batch.completed += 1;
      }
    });

    batch.status = "completed";
    batch.zip_ready = true;
    batch.finished_at = new Date().toISOString();

    return HttpResponse.json(batch);
  }),

  // 18. GET /batches/:id/download
  http.get("*/batches/:id/download", ({ params }) => {
    const id = params.id as string;
    return HttpResponse.json({
      url: "/mock/sample.mp4",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      filename: `clipforge_batch_${id}.zip`,
    });
  }),
  http.get("*/events/stream", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        // Send a simulated progress event
        const data = JSON.stringify({
          clip_id: MOCK_CLIP_1_ID,
          stage: "transcoding",
          progress: 100,
        });
        controller.enqueue(encoder.encode(`event: preview.progress\ndata: ${data}\n\n`));
      },
    });

    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }),
];
