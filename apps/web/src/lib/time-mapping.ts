/**
 * Time Mapping and Formatting Utilities for ClipForge Phase 4
 *
 * Rules:
 * - All edit_state times are in SOURCE time (relative to original source media).
 * - Preview media starts at offset_sec (clip start minus padding), so:
 *     previewTime = sourceTime - offset_sec
 *     sourceTime = previewTime + offset_sec
 */

/**
 * Converts source media timestamp to preview player timestamp.
 */
export function sourceToPreviewTime(sourceSec: number, offsetSec: number): number {
  return Math.max(0, sourceSec - offsetSec);
}

/**
 * Converts preview player timestamp to original source media timestamp.
 */
export function previewToSourceTime(previewSec: number, offsetSec: number): number {
  return Math.max(0, previewSec + offsetSec);
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Formats seconds into HH:MM:SS.mmm format.
 * Examples:
 *   75.5 -> "00:01:15.500"
 *   3661.123 -> "01:01:01.123"
 */
export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00:00.000";

  const totalMilliseconds = Math.round(seconds * 1000);
  const ms = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Parses timestamp string (HH:MM:SS.mmm or MM:SS.mmm or SS.mmm or raw seconds) into seconds.
 * Returns null if format is invalid.
 */
export function parseTimestamp(str: string): number | null {
  if (!str || typeof str !== "string") return null;

  const trimmed = str.trim();
  if (!trimmed) return null;

  // Pure number check (e.g. "12.345")
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const val = parseFloat(trimmed);
    return isNaN(val) ? null : val;
  }

  // Matches HH:MM:SS or HH:MM:SS.mmm or MM:SS or MM:SS.mmm
  const parts = trimmed.split(":");
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60 || hours < 0) return null;

    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);

    if (isNaN(minutes) || isNaN(seconds)) return null;
    if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

    return minutes * 60 + seconds;
  }

  return null;
}

/**
 * Snaps a target time to the closest snap point if within threshold.
 */
export function snapToPoints(
  target: number,
  points: number[],
  threshold: number = 0.3
): number {
  if (!points || points.length === 0) return target;

  let closest = target;
  let minDiff = Infinity;

  for (const pt of points) {
    const diff = Math.abs(target - pt);
    if (diff < minDiff && diff <= threshold) {
      minDiff = diff;
      closest = pt;
    }
  }

  return closest;
}
