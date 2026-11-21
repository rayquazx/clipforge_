"use client";

import * as React from "react";
import {
  Video,
  Image as ImageIcon,
  Type,
  Clock,
  HardDrive,
  MoreVertical,
  Play,
  Trash2,
  Edit2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { AdAsset } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface AdAssetCardProps {
  asset: AdAsset;
  onPreview: (asset: AdAsset) => void;
  onEdit: (asset: AdAsset) => void;
  onDelete: (asset: AdAsset) => void;
}

export function AdAssetCard({
  asset,
  onPreview,
  onEdit,
  onDelete,
}: AdAssetCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return null;
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  const getKindIcon = () => {
    switch (asset.kind) {
      case "video":
        return <Video className="w-3.5 h-3.5" />;
      case "image":
        return <ImageIcon className="w-3.5 h-3.5" />;
      case "text":
        return <Type className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="group relative rounded-2xl bg-surface border border-border hover:border-primary/40 transition-all duration-200 overflow-hidden flex flex-col shadow-sm hover:shadow-md hover:shadow-primary/5">
      {/* Thumbnail / Visual Area */}
      <div
        className="relative aspect-video w-full bg-surface-hover/60 overflow-hidden cursor-pointer flex items-center justify-center border-b border-border"
        onClick={() => onPreview(asset)}
      >
        {asset.kind === "text" && asset.text_config ? (
          <div
            className="p-3 text-center max-w-[85%] rounded-md font-bold text-xs truncate"
            style={{
              fontFamily: asset.text_config.font || "sans-serif",
              color: asset.text_config.color || "#FFFFFF",
              backgroundColor: asset.text_config.bg || "#7C3AED",
              opacity: asset.text_config.bg_opacity ?? 1.0,
            }}
          >
            {asset.text_config.text}
          </div>
        ) : asset.thumbnail_url || asset.url ? (
          <img
            src={asset.thumbnail_url || asset.url || ""}
            alt={asset.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="text-text-secondary flex flex-col items-center gap-1">
            {getKindIcon()}
            <span className="text-[10px]">No Thumbnail</span>
          </div>
        )}

        {/* Hover Play / View Overlay */}
        <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 transform group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </div>
        </div>

        {/* Kind badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <Badge
            variant={
              asset.kind === "video"
                ? "info"
                : asset.kind === "image"
                ? "success"
                : "default"
            }
            className="backdrop-blur-md bg-background/80 capitalize flex items-center gap-1 shadow-sm"
          >
            {getKindIcon()}
            <span>{asset.kind}</span>
          </Badge>
          {asset.status === "processing" && (
            <Badge variant="warning" className="backdrop-blur-md bg-background/80 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              <span>Processing...</span>
            </Badge>
          )}
        </div>

        {/* Duration Chip (for video) */}
        {asset.duration_sec && (
          <div className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-medium text-white flex items-center gap-1 border border-white/10">
            <Clock className="w-3 h-3 text-text-secondary" />
            <span>{asset.duration_sec.toFixed(1)}s</span>
          </div>
        )}
      </div>

      {/* Content Info */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-sm font-semibold text-text-primary truncate flex-1 hover:text-primary transition-colors cursor-pointer"
              onClick={() => onPreview(asset)}
              title={asset.name}
            >
              {asset.name}
            </h3>

            {/* Menu Button */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                aria-label="Ad options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-surface border border-border shadow-xl z-30 py-1 text-xs">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(asset);
                    }}
                    className="w-full text-left px-3 py-2 text-text-primary hover:bg-surface-hover flex items-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit details</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(asset);
                    }}
                    className="w-full text-left px-3 py-2 text-error hover:bg-error/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete ad</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {asset.tags && asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {asset.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-[10px] text-text-secondary bg-surface-hover px-1.5 py-0.5 rounded border border-border"
                >
                  #{t}
                </span>
              ))}
              {asset.tags.length > 3 && (
                <span className="text-[10px] text-text-secondary">
                  +{asset.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer info: size, usage count */}
        <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-text-secondary">
          <div className="flex items-center gap-1.5">
            {formatFileSize(asset.file_size) && (
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-text-secondary" />
                {formatFileSize(asset.file_size)}
              </span>
            )}
          </div>
          {asset.usage_count > 0 ? (
            <span className="text-primary font-medium text-[11px]">
              In {asset.usage_count} clip{asset.usage_count === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-text-secondary text-[11px]">Unused</span>
          )}
        </div>
      </div>
    </div>
  );
}
