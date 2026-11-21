"use client";

import * as React from "react";
import { Plus, Trash2, LayoutTemplate, Layers } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { AdAsset, AdTemplate, AdPlacement, AdPlacementType, AdLayoutPosition } from "@/types";
import { layoutToCSS } from "@/lib/ad-math";

interface AdTemplateModalProps {
  template: AdTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AdTemplateModal({
  template,
  isOpen,
  onClose,
  onSaved,
}: AdTemplateModalProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [placements, setPlacements] = React.useState<Omit<AdPlacement, "id">[]>([]);
  const [availableAssets, setAvailableAssets] = React.useState<AdAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      if (template) {
        setName(template.name);
        setPlacements(JSON.parse(JSON.stringify(template.placements)));
      } else {
        setName("New Sponsor Template");
        setPlacements([
          {
            ad_asset_id: "",
            type: "preroll",
            timing: { duration_sec: 5 },
            layout: { position: "center", scale: 1.0 },
          },
        ]);
      }

      // Fetch assets to populate pickers
      setIsLoadingAssets(true);
      apiClient
        .getAdAssets({ limit: 50 })
        .then((res) => setAvailableAssets(res.items))
        .catch(() => {})
        .finally(() => setIsLoadingAssets(false));
    }
  }, [isOpen, template]);

  const addPlacement = (type: AdPlacementType = "overlay") => {
    const defaultAsset = availableAssets[0]?.id || "";
    setPlacements((prev) => [
      ...prev,
      {
        ad_asset_id: defaultAsset,
        type,
        timing: {
          anchor: "clip_start",
          offset_sec: type === "overlay" ? 2 : 0,
          duration_sec: 5,
        },
        layout: {
          position: type === "overlay" ? "top_right" : "center",
          scale: type === "overlay" ? 0.25 : 1.0,
          opacity: 1.0,
          margin: 0.05,
        },
        animation: "fade",
      },
    ]);
  };

  const removePlacement = (index: number) => {
    setPlacements((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePlacement = (index: number, updates: Partial<Omit<AdPlacement, "id">>) => {
    setPlacements((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Template name is required.");
      return;
    }
    if (placements.length === 0) {
      toast.error("Please add at least one ad placement.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (template) {
        await apiClient.updateAdTemplate(template.id, { name, placements });
        toast.success("Template updated!");
      } else {
        await apiClient.createAdTemplate({ name, placements });
        toast.success("Template created!");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save template.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? "Edit Ad Template" : "New Ad Template"}
      description="Bundle reusable pre-rolls, overlays, and sponsor lower-thirds into a single preset."
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Template Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. YouTube Shorts 5s Pre-roll + Logo"
          required
        />

        {/* Placements Builder */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              Placements ({placements.length})
            </h4>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPlacement("preroll")}
                className="text-xs h-7 gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Pre-roll
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPlacement("overlay")}
                className="text-xs h-7 gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Overlay
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPlacement("lower_third")}
                className="text-xs h-7 gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Lower-third
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPlacement("postroll")}
                className="text-xs h-7 gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Post-roll
              </Button>
            </div>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {placements.map((p, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-surface border border-border space-y-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-text-primary uppercase text-[11px] tracking-wide">
                      {p.type.replace("_", " ")}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removePlacement(idx)}
                    className="text-text-secondary hover:text-error p-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Asset selector */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-text-secondary font-medium">Asset</label>
                    <select
                      value={p.ad_asset_id}
                      onChange={(e) =>
                        updatePlacement(idx, { ad_asset_id: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-surface-hover border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-primary"
                    >
                      <option value="">Select ad asset...</option>
                      {availableAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.kind})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Duration */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-text-secondary font-medium">
                      Duration (sec)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={0.5}
                      value={p.timing?.duration_sec ?? 5}
                      onChange={(e) =>
                        updatePlacement(idx, {
                          timing: { ...p.timing, duration_sec: Number(e.target.value) },
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-surface-hover border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Offset for overlay/lower_third */}
                  {(p.type === "overlay" || p.type === "lower_third") && (
                    <div className="space-y-1">
                      <label className="text-[11px] text-text-secondary font-medium">
                        Start Offset (sec)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={p.timing?.offset_sec ?? 0}
                        onChange={(e) =>
                          updatePlacement(idx, {
                            timing: { ...p.timing, offset_sec: Number(e.target.value) },
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-surface-hover border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}

                  {/* Position for overlay/lower_third */}
                  {(p.type === "overlay" || p.type === "lower_third") && (
                    <div className="space-y-1">
                      <label className="text-[11px] text-text-secondary font-medium">Position</label>
                      <select
                        value={p.layout?.position || "top_right"}
                        onChange={(e) =>
                          updatePlacement(idx, {
                            layout: {
                              ...p.layout,
                              position: e.target.value as AdLayoutPosition,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-surface-hover border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-primary capitalize"
                      >
                        <option value="top_left">Top Left</option>
                        <option value="top_right">Top Right</option>
                        <option value="bottom_left">Bottom Left</option>
                        <option value="bottom_right">Bottom Right</option>
                        <option value="center">Center</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" isLoading={isSubmitting}>
            {template ? "Update Template" : "Save Template"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
