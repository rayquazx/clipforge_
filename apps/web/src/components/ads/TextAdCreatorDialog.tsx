"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { AdTextConfig } from "@/types";

interface TextAdCreatorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const FONTS = ["Inter", "Montserrat", "Anton", "Roboto", "Impact", "Arial"];

export function TextAdCreatorDialog({
  isOpen,
  onClose,
  onCreated,
}: TextAdCreatorDialogProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState("Creator Promo Code");
  const [tags, setTags] = React.useState("promo, discount, overlay");
  const [text, setText] = React.useState("USE CODE 'FORGE' FOR 20% OFF");
  const [font, setFont] = React.useState("Montserrat");
  const [size, setSize] = React.useState(32);
  const [color, setColor] = React.useState("#FFFFFF");
  const [stroke, setStroke] = React.useState("#000000");
  const [bg, setBg] = React.useState("#7C3AED");
  const [bgOpacity, setBgOpacity] = React.useState(0.9);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("Text content cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    try {
      const textConfig: AdTextConfig = {
        text,
        font,
        size,
        color,
        stroke,
        bg,
        bg_opacity: bgOpacity,
      };

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await apiClient.createTextAdAsset({
        name,
        text_config: textConfig,
        tags: tagList,
      });

      toast.success("Text ad created successfully!");
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create text ad.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Text Ad / Overlay"
      description="Design a stylized sponsor lower-third or discount code banner."
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Live Preview Box */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary">Live Preview</label>
          <div className="relative aspect-video w-full rounded-2xl bg-black/90 border border-border flex items-center justify-center p-6 overflow-hidden">
            <div
              className="px-6 py-3 rounded-xl text-center shadow-2xl transition-all duration-150 max-w-lg"
              style={{
                fontFamily: font,
                fontSize: `${size}px`,
                color,
                backgroundColor: bg,
                opacity: bgOpacity,
                textShadow: stroke ? `0 0 6px ${stroke}` : undefined,
              }}
            >
              {text || "Sample Ad Text Preview"}
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Ad Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />

          <div className="md:col-span-2">
            <Input
              label="Banner Text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. GET 20% OFF AT BRAND.COM WITH CODE PRO"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Font Family</label>
            <select
              value={font}
              onChange={(e) => setFont(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">
              Font Size ({size}px)
            </label>
            <input
              type="range"
              min={16}
              max={64}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-text-secondary">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg bg-surface border border-border cursor-pointer p-0.5"
                />
                <span className="text-xs text-text-secondary uppercase">{color}</span>
              </div>
            </div>

            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-text-secondary">Outline / Shadow</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={stroke}
                  onChange={(e) => setStroke(e.target.value)}
                  className="w-8 h-8 rounded-lg bg-surface border border-border cursor-pointer p-0.5"
                />
                <span className="text-xs text-text-secondary uppercase">{stroke}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-text-secondary">Background Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="w-8 h-8 rounded-lg bg-surface border border-border cursor-pointer p-0.5"
                />
                <span className="text-xs text-text-secondary uppercase">{bg}</span>
              </div>
            </div>

            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-text-secondary">
                Opacity ({Math.round(bgOpacity * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bgOpacity}
                onChange={(e) => setBgOpacity(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" isLoading={isSubmitting}>
            Save Text Ad
          </Button>
        </div>
      </form>
    </Modal>
  );
}
