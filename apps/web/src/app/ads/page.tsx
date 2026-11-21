"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UploadCloud,
  Plus,
  Search,
  Filter,
  Megaphone,
  LayoutTemplate,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import type { AdAsset, AdTemplate, AdAssetKind } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdAssetCard } from "@/components/ads/AdAssetCard";
import { AdPreviewModal } from "@/components/ads/AdPreviewModal";
import { AdUploadModal } from "@/components/ads/AdUploadModal";
import { TextAdCreatorDialog } from "@/components/ads/TextAdCreatorDialog";
import { AdEditDialog } from "@/components/ads/AdEditDialog";
import { AdDeleteDialog } from "@/components/ads/AdDeleteDialog";
import { AdTemplateCard } from "@/components/ads/AdTemplateCard";
import { AdTemplateModal } from "@/components/ads/AdTemplateModal";
import { useEventStream } from "@/hooks/useEventStream";
import { useToast } from "@/components/ui/Toast";

export default function AdsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<"library" | "templates">("library");

  // Filters & Search
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedKind, setSelectedKind] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [isTextAdOpen, setIsTextAdOpen] = React.useState(false);
  const [previewAsset, setPreviewAsset] = React.useState<AdAsset | null>(null);
  const [editingAsset, setEditingAsset] = React.useState<AdAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = React.useState<AdAsset | null>(null);

  // Template modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<AdTemplate | null>(null);

  // SSE hook: automatically re-fetches ad assets when ad_asset.ready event fires
  useEventStream(null, {
    onAdAssetReady: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ad-assets"] });
      toast.success("Ad asset processing completed and ready!");
    },
  });

  // 1. Fetch Ad Assets
  const {
    data: assetsData,
    isLoading: isAssetsLoading,
    refetch: refetchAssets,
  } = useQuery({
    queryKey: ["ad-assets", selectedKind, searchQuery, page],
    queryFn: () =>
      apiClient.getAdAssets({
        kind: selectedKind === "all" ? undefined : (selectedKind as AdAssetKind),
        q: searchQuery || undefined,
        page,
        limit: 12,
      }),
  });

  // 2. Fetch Ad Templates
  const {
    data: templatesData,
    isLoading: isTemplatesLoading,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ["ad-templates"],
    queryFn: () => apiClient.getAdTemplates(),
    enabled: activeTab === "templates",
  });

  const handleDeleteTemplate = async (template: AdTemplate) => {
    if (confirm(`Are you sure you want to delete template "${template.name}"?`)) {
      try {
        await apiClient.deleteAdTemplate(template.id);
        toast.success("Template deleted.");
        queryClient.invalidateQueries({ queryKey: ["ad-templates"] });
      } catch (err: any) {
        toast.error(err.message || "Failed to delete template.");
      }
    }
  };

  const assets = assetsData?.items || [];
  const totalAssetPages = assetsData?.total ? Math.ceil(assetsData.total / 12) : 1;
  const templates = templatesData || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-primary" />
            <span>Ad Library & Templates</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Manage sponsor videos, logo watermarks, lower-third overlays, and automated placement
            presets.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {activeTab === "library" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTextAdOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Create Text Ad
              </Button>
              <Button
                size="sm"
                onClick={() => setIsUploadOpen(true)}
                className="gap-1.5 text-xs"
              >
                <UploadCloud className="w-3.5 h-3.5" /> Upload Media
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setEditingTemplate(null);
                setIsTemplateModalOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> New Ad Template
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px">
        <button
          onClick={() => setActiveTab("library")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 ${
            activeTab === "library"
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Ad Assets</span>
          {assetsData?.total !== undefined && (
            <span className="text-[11px] bg-surface-hover px-2 py-0.5 rounded-full border border-border">
              {assetsData.total}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 ${
            activeTab === "templates"
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <LayoutTemplate className="w-4 h-4" />
          <span>Templates</span>
          {templates.length > 0 && (
            <span className="text-[11px] bg-surface-hover px-2 py-0.5 rounded-full border border-border">
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {/* Rights Notice */}
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface/60 border border-border text-xs text-text-secondary">
        <ShieldAlert className="w-4 h-4 text-primary shrink-0" />
        <p>
          <strong className="text-text-primary">Important:</strong> Only upload ads, sponsor
          assets, and logos that you have explicit commercial rights or streamer permissions to
          use.
        </p>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: AD ASSETS                                                      */}
      {/* ===================================================================== */}
      {activeTab === "library" && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {["all", "video", "image", "text"].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setSelectedKind(k);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize border transition-all ${
                    selectedKind === k
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-surface text-text-secondary border-border hover:bg-surface-hover hover:text-text-primary"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-72">
              <Input
                placeholder="Search ads by name or tag..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Grid of Ad Assets */}
          {isAssetsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-surface border border-border p-4 space-y-3 animate-pulse"
                >
                  <Skeleton className="aspect-video w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-12 text-center bg-surface/30 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center text-text-secondary mx-auto">
                <Megaphone className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No ad assets found</h3>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                {searchQuery || selectedKind !== "all"
                  ? "Try clearing your filters or search query."
                  : "Upload your sponsor video bumpers, brand logos, or create stylized text banners."}
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <Button size="sm" onClick={() => setIsUploadOpen(true)}>
                  Upload Ad
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsTextAdOpen(true)}>
                  Create Text Ad
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {assets.map((asset) => (
                <AdAssetCard
                  key={asset.id}
                  asset={asset}
                  onPreview={(a) => setPreviewAsset(a)}
                  onEdit={(a) => setEditingAsset(a)}
                  onDelete={(a) => setDeletingAsset(a)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalAssetPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border text-xs text-text-secondary">
              <span>
                Page {page} of {totalAssetPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalAssetPages, p + 1))}
                  disabled={page >= totalAssetPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: AD TEMPLATES                                                   */}
      {/* ===================================================================== */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          {isTemplatesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-surface border border-border p-5 space-y-3 animate-pulse"
                >
                  <Skeleton className="h-5 w-1/2 rounded" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-4 w-1/4 rounded" />
                </div>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-12 text-center bg-surface/30 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center text-text-secondary mx-auto">
                <LayoutTemplate className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No ad templates yet</h3>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                Create a template to automatically apply your favorite pre-rolls and watermark
                overlays across batch exports in one click.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTemplate(null);
                  setIsTemplateModalOpen(true);
                }}
              >
                Create First Template
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {templates.map((tpl) => (
                <AdTemplateCard
                  key={tpl.id}
                  template={tpl}
                  onEdit={(t) => {
                    setEditingTemplate(t);
                    setIsTemplateModalOpen(true);
                  }}
                  onDelete={handleDeleteTemplate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AdUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => {
          queryClient.invalidateQueries({ queryKey: ["ad-assets"] });
        }}
      />

      <TextAdCreatorDialog
        isOpen={isTextAdOpen}
        onClose={() => setIsTextAdOpen(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["ad-assets"] });
        }}
      />

      <AdPreviewModal
        asset={previewAsset}
        isOpen={!!previewAsset}
        onClose={() => setPreviewAsset(null)}
      />

      <AdEditDialog
        asset={editingAsset}
        isOpen={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["ad-assets"] });
        }}
      />

      <AdDeleteDialog
        asset={deletingAsset}
        isOpen={!!deletingAsset}
        onClose={() => setDeletingAsset(null)}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ["ad-assets"] });
        }}
      />

      <AdTemplateModal
        template={editingTemplate}
        isOpen={isTemplateModalOpen}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setEditingTemplate(null);
        }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["ad-templates"] });
        }}
      />
    </div>
  );
}
