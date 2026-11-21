import type {
  AdPlacement,
  AdAsset,
  AdLayout,
  AdAnimation,
  TimelineInfo,
  RenderOptions,
} from "@/types";
import React from "react";

// ----------------------------------------------------------------------------
// Timeline Durations Calculation
// ----------------------------------------------------------------------------

export function calculateTimeline(
  mainDuration: number,
  placements: AdPlacement[] = [],
  resolvedAssets?: Map<string, AdAsset>
): TimelineInfo {
  let prerollTotal = 0;
  let postrollTotal = 0;

  for (const p of placements) {
    if (p.type === "preroll") {
      let dur = p.timing?.duration_sec;
      if (!dur || dur <= 0) {
        const asset = resolvedAssets?.get(p.ad_asset_id);
        dur = asset?.duration_sec ?? 5; // default 5s for images/text
      }
      prerollTotal += dur;
    } else if (p.type === "postroll") {
      let dur = p.timing?.duration_sec;
      if (!dur || dur <= 0) {
        const asset = resolvedAssets?.get(p.ad_asset_id);
        dur = asset?.duration_sec ?? 5;
      }
      postrollTotal += dur;
    }
  }

  const safeMain = Math.max(0, mainDuration);
  const total = Number((prerollTotal + safeMain + postrollTotal).toFixed(3));

  return {
    main_duration_sec: Number(safeMain.toFixed(3)),
    preroll_duration_sec: Number(prerollTotal.toFixed(3)),
    postroll_duration_sec: Number(postrollTotal.toFixed(3)),
    total_duration_sec: total,
  };
}

// ----------------------------------------------------------------------------
// Time Transformations (Main clip time vs Total composite time)
// ----------------------------------------------------------------------------

/**
 * Convert a timestamp in MAIN clip time (where 0 is start of trimmed clip)
 * to TOTAL time in the composite video (including preroll).
 */
export function mainTimeToTotalTime(mainTime: number, prerollDuration: number): number {
  return Number((Math.max(0, mainTime) + Math.max(0, prerollDuration)).toFixed(3));
}

/**
 * Convert a timestamp in composite video time back to MAIN clip time.
 */
export function totalTimeToMainTime(totalTime: number, prerollDuration: number): number {
  return Number((Math.max(0, totalTime) - Math.max(0, prerollDuration)).toFixed(3));
}

// ----------------------------------------------------------------------------
// Layout to CSS Styles & Positioning
// ----------------------------------------------------------------------------

export function layoutToCSS(
  layout: AdLayout,
  animation: AdAnimation = "none"
): React.CSSProperties {
  const marginPct = (layout.margin ?? 0.05) * 100;
  const scale = layout.scale ?? 0.3;
  const opacity = layout.opacity ?? 1.0;
  const widthPct = scale * 100;

  const style: React.CSSProperties = {
    position: "absolute",
    width: `${widthPct}%`,
    opacity,
    pointerEvents: "none",
    transition: "all 0.25s ease-out",
    zIndex: 20,
  };

  switch (layout.position) {
    case "top_left":
      style.top = `${marginPct}%`;
      style.left = `${marginPct}%`;
      break;
    case "top_right":
      style.top = `${marginPct}%`;
      style.right = `${marginPct}%`;
      break;
    case "bottom_left":
      style.bottom = `${marginPct}%`;
      style.left = `${marginPct}%`;
      break;
    case "bottom_right":
      style.bottom = `${marginPct}%`;
      style.right = `${marginPct}%`;
      break;
    case "center":
      style.top = "50%";
      style.left = "50%";
      style.transform = "translate(-50%, -50%)";
      break;
    case "custom":
      style.left = `${(layout.x ?? 0.05) * 100}%`;
      style.top = `${(layout.y ?? 0.05) * 100}%`;
      break;
    default:
      style.bottom = `${marginPct}%`;
      style.right = `${marginPct}%`;
      break;
  }

  return style;
}

// ----------------------------------------------------------------------------
// Formatting & Summaries
// ----------------------------------------------------------------------------

export function formatSeconds(sec: number): string {
  const rounded = Math.round(sec);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTimelineSummary(timeline: TimelineInfo): string {
  const total = formatSeconds(timeline.total_duration_sec);
  const preroll = formatSeconds(timeline.preroll_duration_sec);
  const main = formatSeconds(timeline.main_duration_sec);
  const postroll = formatSeconds(timeline.postroll_duration_sec);

  if (timeline.preroll_duration_sec > 0 && timeline.postroll_duration_sec > 0) {
    return `Total ${total} = ${preroll} ad + ${main} clip + ${postroll} ad`;
  }
  if (timeline.preroll_duration_sec > 0) {
    return `Total ${total} = ${preroll} ad + ${main} clip`;
  }
  if (timeline.postroll_duration_sec > 0) {
    return `Total ${total} = ${main} clip + ${postroll} ad`;
  }
  return `Total ${total}`;
}

export function formatTemplateSummary(placements: Omit<AdPlacement, "id">[] = []): string {
  if (placements.length === 0) return "No ad placements";

  const parts: string[] = [];
  for (const p of placements) {
    const dur = p.timing?.duration_sec ? `${Math.round(p.timing.duration_sec)}s` : "";
    if (p.type === "preroll") {
      parts.push(`${dur || "5s"} pre-roll`);
    } else if (p.type === "postroll") {
      parts.push(`${dur || "5s"} post-roll`);
    } else if (p.type === "overlay") {
      const pos = p.layout?.position ? p.layout.position.replace("_", "-") : "overlay";
      parts.push(`${pos} overlay`);
    } else if (p.type === "lower_third") {
      const offset = p.timing?.offset_sec ? ` at ${Math.round(p.timing.offset_sec)}s` : "";
      parts.push(`lower-third${offset}`);
    }
  }

  return parts.join(" + ");
}

// ----------------------------------------------------------------------------
// Placement Validation
// ----------------------------------------------------------------------------

export function validatePlacement(
  placement: AdPlacement,
  mainDuration: number,
  currentPrerollTotal: number,
  maxPrerollSec = 30
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!placement.ad_asset_id) {
    errors.ad_asset_id = "Please select an ad asset.";
  }

  const duration = placement.timing?.duration_sec ?? 0;
  if (duration <= 0) {
    errors.duration_sec = "Duration must be greater than 0.";
  }

  if (placement.type === "preroll") {
    if (currentPrerollTotal + duration > maxPrerollSec) {
      errors.duration_sec = `Total pre-roll cannot exceed ${maxPrerollSec} seconds.`;
    }
  }

  if (placement.type === "overlay" || placement.type === "lower_third") {
    const offset = placement.timing?.offset_sec ?? 0;
    if (offset < 0) {
      errors.offset_sec = "Offset cannot be negative.";
    }
    if (offset + duration > mainDuration) {
      errors.offset_sec = "Placement exceeds clip duration.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
