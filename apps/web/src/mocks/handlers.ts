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
} from "./mock-data";
import type { Clip, Render, RenderOptions } from "@/types";

// In-memory state for mock service worker session
let clips: Clip[] = JSON.parse(JSON.stringify(initialClips));
let renders: Render[] = JSON.parse(JSON.stringify(initialRenders));
let moments = JSON.parse(JSON.stringify(initialMoments));
let projects = JSON.parse(JSON.stringify(initialProjects));
let analyses = JSON.parse(JSON.stringify(initialAnalyses));
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

  // --------------------------------------------------------------------------
  // GET /events/stream (Mock SSE stream)
  // --------------------------------------------------------------------------
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
