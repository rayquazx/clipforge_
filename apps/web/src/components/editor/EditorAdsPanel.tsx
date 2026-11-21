"use client";

import * as React from "react";
import {
  Megaphone,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Layers,
  Save,
  FileCheck,
  AlertTriangle,
  Play,
  Volume2,
  Sliders,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { apiClient } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type {
  AdAsset,
  AdPlacement,
  AdPlacementType,
  AdLayoutPosition,
  AdAnimation,
  AdTemplate,
} from "@/types";
import { validatePlacement } from "@/lib/ad-math";

export function EditorAdsPanel() {
  const { toast } = useToast();
  const clip = useEditorStore((s) => s.clip);
  const addAdPlacement = useEditorStore((s) => s.addAdPlacement);
  const updateAdPlacement = useEditorStore((s) => s.updateAdPlacement);
  const removeAdPlacement = useEditorStore((s) => s.removeAdPlacement);
  const updateAds = useEditorStore((s) => s.updateAds);
  const selectedAdId = useEditorStore((s) => s.selectedAdId);
  const setSelectedAdId = useEditorStore((s) => s.setSelectedAdId);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  const [assets, setAssets] = React.useState<AdAsset[]>([]);
  const [templates, setTemplates] = React.useState<AdTemplate[]>([]);
  const [assetSearch, setAssetSearch] = React.useState("");

  // Template Modals
  const [isApplyTemplateOpen, setIsApplyTemplateOpen] = React.useState(false);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = React.useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [templateApplyMode, setTemplateApplyMode] = React.useState<"replace" | "append">("replace");
  const [newTemplateName, setNewTemplateName] = React.useState("My Stream Ads Preset");

  // Fetch library assets and templates
  React.useEffect(() => {
    apiClient.getAdAssets({ limit: 50 }).then((r) => setAssets(r.items)).catch(() => {});
    apiClient.getAdTemplates().then((t) => {
      setTemplates(t);
      if (t.length > 0) setSelectedTemplateId(t[0].id);
    }).catch(() => {});
  }, []);

  const ads = clip?.edit_state?.ads || [];
  const start = clip?.edit_state?.trim?.start ?? clip?.source_start_sec ?? 0;
  const end = clip?.edit_state?.trim?.end ?? clip?.source_end_sec ?? 30;
  const mainDuration = Math.max(0, end - start);

  // Filtered assets for picker
  const filteredAssets = assets.filter((a) =>
    a.name.toLowerCase().includes(assetSearch.toLowerCase()) ||
    a.tags.some((t) => t.toLowerCase().includes(assetSearch.toLowerCase()))
  );

  const handleAddPlacement = (type: AdPlacementType) => {
    const defaultAsset = assets[0]?.id || "";
    const newPlacement: AdPlacement = {
      id: `ad-p-${Date.now()}`,
      ad_asset_id: defaultAsset,
      type,
      timing: {
        anchor: "clip_start",
        offset_sec: type === "overlay" || type === "lower_third" ? 2 : 0,
        duration_sec: 5,
      },
      layout: {
        position: type === "lower_third" ? "bottom_left" : type === "overlay" ? "top_right" : "center",
        scale: type === "lower_third" ? 0.4 : type === "overlay" ? 0.25 : 1.0,
        opacity: 1.0,
        margin: 0.05,
      },
      animation: "fade",
      audio: { volume: 0.8 },
    };
    addAdPlacement(newPlacement);
    setSelectedAdId(newPlacement.id);
  };

  const handleDuplicate = (placement: AdPlacement) => {
    const dup: AdPlacement = {
      ...JSON.parse(JSON.stringify(placement)),
      id: `ad-p-${Date.now()}`,
    };
    addAdPlacement(dup);
    setSelectedAdId(dup.id);
    toast.success("Placement duplicated");
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ads.length) return;
    const reordered = [...ads];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    updateAds(reordered);
  };

  const handleApplyTemplate = async () => {
    if (!clip || !selectedTemplateId) return;
    try {
      const updated = await apiClient.applyAdTemplate(
        clip.id,
        selectedTemplateId,
        templateApplyMode
      );
      updateAds(updated.edit_state?.ads || []);
      toast.success("Template applied to clip!");
      setIsApplyTemplateOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply template.");
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error("Template name cannot be empty.");
      return;
    }
    if (ads.length === 0) {
      toast.error("No ads placed on this clip to save.");
      return;
    }

    try {
      const cleanPlacements = ads.map(({ id, ...rest }) => rest);
      await apiClient.createAdTemplate({
        name: newTemplateName,
        placements: cleanPlacements,
      });
      toast.success("Saved as new template preset!");
      setIsSaveTemplateOpen(false);
      apiClient.getAdTemplates().then(setTemplates).catch(() => {});
    } catch (err: any) {
      toast.error(err.message || "Failed to save template.");
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Top Template Actions */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsApplyTemplateOpen(true)}
          className="flex-1 text-[11px] h-8 gap-1"
        >
          <Layers className="w-3.5 h-3.5 text-primary" /> Apply Template
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsSaveTemplateOpen(true)}
          disabled={ads.length === 0}
          className="flex-1 text-[11px] h-8 gap-1"
        >
          <Save className="w-3.5 h-3.5" /> Save as Template
        </Button>
      </div>

      {/* Add Placement Quick Buttons */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
          Add Ad Placement
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddPlacement("preroll")}
            className="text-[11px] h-8 justify-start gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" /> Pre-roll
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddPlacement("overlay")}
            className="text-[11px] h-8 justify-start gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-purple-400" /> Overlay Logo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddPlacement("lower_third")}
            className="text-[11px] h-8 justify-start gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" /> Lower-third
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddPlacement("postroll")}
            className="text-[11px] h-8 justify-start gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" /> Post-roll
          </Button>
        </div>
      </div>

      {/* Active Placements List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            Placed Ads ({ads.length})
          </label>
        </div>

        {ads.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-border rounded-xl text-text-secondary space-y-1">
            <Megaphone className="w-5 h-5 mx-auto text-text-secondary/60 mb-2" />
            <p className="font-medium text-text-primary text-xs">No ads placed yet</p>
            <p className="text-[10px]">Add a pre-roll, corner watermark, or sponsor banner above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ads.map((placement, index) => {
              const isSelected = selectedAdId === placement.id;
              const validation = validatePlacement(placement, mainDuration, 0);
              const asset = assets.find((a) => a.id === placement.ad_asset_id);

              return (
                <div
                  key={placement.id}
                  onClick={() => setSelectedAdId(placement.id)}
                  className={`p-3 rounded-xl border transition-all duration-150 space-y-3 ${
                    isSelected
                      ? "bg-surface border-primary shadow-sm ring-1 ring-primary/20"
                      : "bg-surface/60 border-border hover:border-primary/40"
                  }`}
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          placement.type === "preroll"
                            ? "bg-amber-400"
                            : placement.type === "postroll"
                            ? "bg-emerald-400"
                            : placement.type === "overlay"
                            ? "bg-purple-400"
                            : "bg-blue-400"
                        }`}
                      />
                      <span className="font-bold uppercase tracking-wider text-[10px] text-text-primary">
                        {placement.type.replace("_", " ")}
                      </span>
                      <span className="text-text-secondary text-[11px] truncate">
                        • {asset?.name || "Select asset"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMove(index, "up");
                        }}
                        disabled={index === 0}
                        className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMove(index, "down");
                        }}
                        disabled={index === ads.length - 1}
                        className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(placement);
                        }}
                        className="p-1 text-text-secondary hover:text-text-primary"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAdPlacement(placement.id);
                        }}
                        className="p-1 text-text-secondary hover:text-error"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Errors / Warnings */}
                  {!validation.valid && (
                    <div className="p-2 rounded-lg bg-error/10 border border-error/20 text-error text-[10px] space-y-0.5">
                      {Object.values(validation.errors).map((err, i) => (
                        <p key={i}>⚠️ {err}</p>
                      ))}
                    </div>
                  )}

                  {/* Configuration Form */}
                  <div className="space-y-2.5">
                    {/* Asset Picker */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-text-secondary font-medium">
                        Ad Asset
                      </label>
                      <select
                        value={placement.ad_asset_id}
                        onChange={(e) =>
                          updateAdPlacement(placement.id, { ad_asset_id: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-surface-hover border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-primary"
                      >
                        <option value="">Select ad asset...</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.kind}
                            {a.duration_sec ? ` • ${a.duration_sec}s` : ""})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Pre/Post Roll Specific Controls */}
                    {(placement.type === "preroll" || placement.type === "postroll") && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-text-secondary font-medium">
                            Duration (sec)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            step={0.5}
                            value={placement.timing?.duration_sec ?? 5}
                            onChange={(e) =>
                              updateAdPlacement(placement.id, {
                                timing: {
                                  ...placement.timing,
                                  duration_sec: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1 bg-surface-hover border border-border rounded-lg text-xs text-text-primary"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-text-secondary font-medium">
                            Audio Volume ({Math.round((placement.audio?.volume ?? 1) * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={placement.audio?.volume ?? 0.8}
                            onChange={(e) =>
                              updateAdPlacement(placement.id, {
                                audio: { volume: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-primary mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {/* Overlay / Lower Third Specific Controls */}
                    {(placement.type === "overlay" || placement.type === "lower_third") && (
                      <div className="space-y-2 pt-1 border-t border-border">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-medium">
                              Position
                            </label>
                            <select
                              value={placement.layout?.position || "top_right"}
                              onChange={(e) =>
                                updateAdPlacement(placement.id, {
                                  layout: {
                                    ...placement.layout,
                                    position: e.target.value as AdLayoutPosition,
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-surface-hover border border-border rounded-lg text-xs text-text-primary capitalize"
                            >
                              <option value="top_left">Top Left</option>
                              <option value="top_right">Top Right</option>
                              <option value="bottom_left">Bottom Left</option>
                              <option value="bottom_right">Bottom Right</option>
                              <option value="center">Center</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-medium">
                              Animation
                            </label>
                            <select
                              value={placement.animation || "fade"}
                              onChange={(e) =>
                                updateAdPlacement(placement.id, {
                                  animation: e.target.value as AdAnimation,
                                })
                              }
                              className="w-full px-2 py-1 bg-surface-hover border border-border rounded-lg text-xs text-text-primary capitalize"
                            >
                              <option value="none">None</option>
                              <option value="fade">Fade</option>
                              <option value="slide">Slide</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-medium">
                              Start Offset (sec)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={placement.timing?.offset_sec ?? 0}
                              onChange={(e) =>
                                updateAdPlacement(placement.id, {
                                  timing: {
                                    ...placement.timing,
                                    offset_sec: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-surface-hover border border-border rounded-lg text-xs text-text-primary"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-medium">
                              Duration (sec)
                            </label>
                            <input
                              type="number"
                              min={1}
                              step={0.5}
                              value={placement.timing?.duration_sec ?? 5}
                              onChange={(e) =>
                                updateAdPlacement(placement.id, {
                                  timing: {
                                    ...placement.timing,
                                    duration_sec: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-2 py-1 bg-surface-hover border border-border rounded-lg text-xs text-text-primary"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-medium">
                              Scale ({Math.round((placement.layout?.scale ?? 0.3) * 100)}%)
                            </label>
                            <input
                              type="range"
                              min={0.1}
                              max={1.0}
                              step={0.05}
                              value={placement.layout?.scale ?? 0.3}
                              onChange={(e) =>
                                updateAdPlacement(placement.id, {
                                  layout: {
                                    ...placement.layout,
                                    scale: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full accent-primary mt-1"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-medium">
                              Opacity ({Math.round((placement.layout?.opacity ?? 1.0) * 100)}%)
                            </label>
                            <input
                              type="range"
                              min={0.1}
                              max={1.0}
                              step={0.05}
                              value={placement.layout?.opacity ?? 1.0}
                              onChange={(e) =>
                                updateAdPlacement(placement.id, {
                                  layout: {
                                    ...placement.layout,
                                    opacity: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full accent-primary mt-1"
                            />
                          </div>
                        </div>

                        {/* Optional text override */}
                        <div className="space-y-1 pt-1">
                          <label className="text-[10px] text-text-secondary font-medium">
                            Text Override (optional)
                          </label>
                          <input
                            type="text"
                            placeholder="Override default sponsor text..."
                            value={placement.text_override || ""}
                            onChange={(e) =>
                              updateAdPlacement(placement.id, {
                                text_override: e.target.value || null,
                              })
                            }
                            className="w-full px-2 py-1 bg-surface-hover border border-border rounded-lg text-xs text-text-primary"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Apply Template Dialog */}
      <Modal
        isOpen={isApplyTemplateOpen}
        onClose={() => setIsApplyTemplateOpen(false)}
        title="Apply Ad Template"
        description="Choose an ad template to apply to this clip."
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">Template</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text-primary"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.placements.length} placements)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Placement Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTemplateApplyMode("replace")}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  templateApplyMode === "replace"
                    ? "bg-primary/10 border-primary text-text-primary"
                    : "bg-surface border-border text-text-secondary"
                }`}
              >
                <p className="font-semibold text-xs">Replace</p>
                <p className="text-[10px] mt-0.5 text-text-secondary">
                  Clear existing ads and replace with template
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTemplateApplyMode("append")}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  templateApplyMode === "append"
                    ? "bg-primary/10 border-primary text-text-primary"
                    : "bg-surface border-border text-text-secondary"
                }`}
              >
                <p className="font-semibold text-xs">Append</p>
                <p className="text-[10px] mt-0.5 text-text-secondary">
                  Keep existing ads and append template
                </p>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsApplyTemplateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyTemplate} disabled={!selectedTemplateId}>
              Confirm Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Save Template Dialog */}
      <Modal
        isOpen={isSaveTemplateOpen}
        onClose={() => setIsSaveTemplateOpen(false)}
        title="Save Current Ads as Template"
        description="Create a reusable preset from the current clip's ad placements."
        className="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="e.g. Standard Sponsor Intro + Logo"
            required
          />

          <p className="text-[11px] text-text-secondary">
            This will save {ads.length} placement{ads.length === 1 ? "" : "s"} to your template library.
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveAsTemplate}>
              Save Preset
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
