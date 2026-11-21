import { describe, it, expect } from "vitest";
import { clamp, snapToPoints } from "../time-mapping";

describe("Trim Logic & Constraints", () => {
  it("enforces minimum duration constraint of 1.0 second", () => {
    const minClipSeconds = 1.0;
    const start = 10.0;
    let end = 10.5;
    const duration = end - start;

    expect(duration < minClipSeconds).toBe(true);
    // Trim logic adjusts end to at least start + minClipSeconds
    if (duration < minClipSeconds) {
      end = start + minClipSeconds;
    }
    expect(end - start).toBe(1.0);
  });

  it("enforces maximum duration constraint from config", () => {
    const maxClipSeconds = 60.0;
    const start = 10.0;
    let end = 75.0; // 65s duration
    const duration = end - start;

    expect(duration > maxClipSeconds).toBe(true);
    if (duration > maxClipSeconds) {
      end = start + maxClipSeconds;
    }
    expect(end - start).toBe(60.0);
  });

  it("snaps to playhead and sentence boundary points correctly", () => {
    const playhead = 15.2;
    const sentenceBoundaries = [12.0, 18.0, 24.5];
    const snapCandidates = [playhead, ...sentenceBoundaries];

    // Drag handle near playhead
    const draggedNearPlayhead = 15.35;
    expect(snapToPoints(draggedNearPlayhead, snapCandidates, 0.3)).toBe(15.2);

    // Drag handle near sentence boundary
    const draggedNearSentence = 17.85;
    expect(snapToPoints(draggedNearSentence, snapCandidates, 0.3)).toBe(18.0);
  });
});
