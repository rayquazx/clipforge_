import axios, { AxiosError } from "axios";
import { getAccessToken, clearTokens } from "./auth";
import type {
  Clip,
  Render,
  RenderOptions,
  PreviewStatus,
  Waveform,
  Thumbnails,
  ConfigResponse,
  DownloadResponse,
  BulkActionResponse,
  AdAsset,
  AdAssetKind,
  AdTextConfig,
  AdTemplate,
  AdPlacement,
  TimelineInfo,
  Batch,
} from "@/types";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, any>;

  constructor(message: string, status: number, code: string = "unknown_error", details?: Record<string, any>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 500;
    const data = error.response?.data;

    // Contract format: { error: { code: string, message: string, details?: object } }
    if (data?.error) {
      throw new ApiError(
        data.error.message || "An unexpected error occurred",
        status,
        data.error.code || "unknown_error",
        data.error.details
      );
    }

    // FastAPI default format: { detail: string | array }
    if (data?.detail) {
      const msg = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      throw new ApiError(msg, status, "validation_error");
    }

    throw new ApiError(error.message || "Network request failed", status, "network_error");
  }

  if (error instanceof ApiError) {
    throw error;
  }

  throw new ApiError(
    error instanceof Error ? error.message : "Unknown error occurred",
    500,
    "internal_error"
  );
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      clearTokens();
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// Phase 4 Typed API Client Functions
// ============================================================================

export const apiClient = {
  // Analyses -> Clips
  async createClipsFromMoments(
    analysisId: string,
    momentIds: string[]
  ): Promise<{ items: Clip[] }> {
    try {
      const res = await api.post(`/analyses/${analysisId}/clips`, { moment_ids: momentIds });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Projects -> Custom Clip
  async createCustomClip(
    projectId: string,
    data: { start: number; end: number; title?: string }
  ): Promise<Clip> {
    try {
      const res = await api.post(`/projects/${projectId}/clips`, data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Clips CRUD & List
  async getClips(params?: {
    category?: string;
    project_id?: string;
    status?: string;
    q?: string;
    sort?: "newest" | "score" | "duration";
    page?: number;
    limit?: number;
  }): Promise<{ items: Clip[]; page: number; limit: number; total: number }> {
    try {
      const res = await api.get("/clips", { params });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getClip(clipId: string): Promise<Clip> {
    try {
      const res = await api.get(`/clips/${clipId}`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async updateClip(
    clipId: string,
    data: { title?: string; edit_state?: any; version: number }
  ): Promise<Clip> {
    try {
      const res = await api.patch(`/clips/${clipId}`, data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async duplicateClip(clipId: string): Promise<Clip> {
    try {
      const res = await api.post(`/clips/${clipId}/duplicate`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async deleteClip(clipId: string): Promise<void> {
    try {
      await api.delete(`/clips/${clipId}`);
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Preview
  async preparePreview(clipId: string): Promise<PreviewStatus> {
    try {
      const res = await api.post(`/clips/${clipId}/preview/prepare`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getPreviewStatus(clipId: string): Promise<PreviewStatus> {
    try {
      const res = await api.get(`/clips/${clipId}/preview/status`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  getPreviewVideoUrl(clipId: string): string {
    if (isMockMode) {
      return `/clips/${clipId}/preview/video`;
    }
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return `${base}/clips/${clipId}/preview/video`;
  },

  async getWaveform(clipId: string): Promise<Waveform> {
    try {
      const res = await api.get(`/clips/${clipId}/waveform`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getThumbnails(clipId: string): Promise<Thumbnails> {
    try {
      const res = await api.get(`/clips/${clipId}/thumbnails`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Renders & Export
  async createRender(clipId: string, options: RenderOptions): Promise<Render> {
    try {
      const res = await api.post(`/clips/${clipId}/renders`, { options });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getClipRenders(
    clipId: string,
    params?: { page?: number; limit?: number }
  ): Promise<{ items: Render[]; total: number; page: number; limit: number }> {
    try {
      const res = await api.get(`/clips/${clipId}/renders`, { params });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getRender(renderId: string): Promise<Render> {
    try {
      const res = await api.get(`/renders/${renderId}`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async cancelRender(renderId: string): Promise<Render> {
    try {
      const res = await api.post(`/renders/${renderId}/cancel`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getRenderDownload(renderId: string): Promise<DownloadResponse> {
    try {
      const res = await api.get(`/renders/${renderId}/download`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Bulk Actions
  async bulkClipAction(
    action: "export" | "delete",
    clipIds: string[]
  ): Promise<BulkActionResponse> {
    try {
      const res = await api.post("/clips/bulk", { action, clip_ids: clipIds });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Config
  async getConfig(): Promise<ConfigResponse> {
    try {
      const res = await api.get("/config");
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // ============================================================================
  // Phase 6 Ads & Batch Export
  // ============================================================================

  // Ad Assets
  async getAdAssets(params?: {
    kind?: AdAssetKind;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: AdAsset[]; total: number; page: number; limit: number }> {
    try {
      const res = await api.get("/ad-assets", { params });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async createAdAsset(formData: FormData): Promise<AdAsset> {
    try {
      const res = await api.post("/ad-assets", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async createTextAdAsset(data: {
    name: string;
    text_config: AdTextConfig;
    tags?: string[];
  }): Promise<AdAsset> {
    try {
      const res = await api.post("/ad-assets", data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async updateAdAsset(
    id: string,
    data: { name?: string; tags?: string[]; text_config?: AdTextConfig }
  ): Promise<AdAsset> {
    try {
      const res = await api.patch(`/ad-assets/${id}`, data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async deleteAdAsset(id: string, force = false): Promise<void> {
    try {
      await api.delete(`/ad-assets/${id}`, {
        params: force ? { force: true } : undefined,
      });
    } catch (err) {
      return handleApiError(err);
    }
  },

  getAdAssetPreviewUrl(id: string): string {
    const isMock = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return `/ad-assets/${id}/preview`;
    }
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return `${base}/ad-assets/${id}/preview`;
  },

  // Ad Templates
  async getAdTemplates(): Promise<AdTemplate[]> {
    try {
      const res = await api.get("/ad-templates");
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async createAdTemplate(data: {
    name: string;
    placements: Omit<AdPlacement, "id">[];
  }): Promise<AdTemplate> {
    try {
      const res = await api.post("/ad-templates", data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async updateAdTemplate(
    id: string,
    data: { name?: string; placements?: Omit<AdPlacement, "id">[] }
  ): Promise<AdTemplate> {
    try {
      const res = await api.patch(`/ad-templates/${id}`, data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async deleteAdTemplate(id: string): Promise<void> {
    try {
      await api.delete(`/ad-templates/${id}`);
    } catch (err) {
      return handleApiError(err);
    }
  },

  async applyAdTemplate(
    clipId: string,
    templateId: string,
    mode: "replace" | "append"
  ): Promise<Clip> {
    try {
      const res = await api.post(`/clips/${clipId}/ads/apply-template`, {
        template_id: templateId,
        mode,
      });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Clip Timeline Info & Quick Preview with Ads
  async getClipTimelineInfo(clipId: string): Promise<TimelineInfo> {
    try {
      const res = await api.get(`/clips/${clipId}/timeline-info`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async createPreviewRender(clipId: string): Promise<Render> {
    try {
      const res = await api.post(`/clips/${clipId}/renders/preview`, {});
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  // Batch Export
  async createBatch(data: {
    clip_ids: string[];
    ad_template_id?: string | null;
    options: RenderOptions;
    ads_mode?: "replace" | "append" | "keep";
  }): Promise<Batch> {
    try {
      const res = await api.post("/batches", data);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getBatches(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: Batch[]; total: number; page: number; limit: number }> {
    try {
      const res = await api.get("/batches", { params });
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getBatch(id: string): Promise<Batch> {
    try {
      const res = await api.get(`/batches/${id}`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async cancelBatch(id: string): Promise<Batch> {
    try {
      const res = await api.post(`/batches/${id}/cancel`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async retryFailedBatch(id: string): Promise<Batch> {
    try {
      const res = await api.post(`/batches/${id}/retry-failed`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },

  async getBatchDownload(id: string): Promise<DownloadResponse> {
    try {
      const res = await api.get(`/batches/${id}/download`);
      return res.data;
    } catch (err) {
      return handleApiError(err);
    }
  },
};

export default api;
