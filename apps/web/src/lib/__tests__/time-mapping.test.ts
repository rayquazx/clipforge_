import { describe, it, expect } from "vitest";
import {
  sourceToPreviewTime,
  previewToSourceTime,
  clamp,
  formatTimestamp,
  parseTimestamp,
  snapToPoints,
} from "../time-mapping";

describe("Time Mapping & Formatting Utilities", () => {
  it("converts source time to preview time", () => {
    // preview starts at offset 10.0s
    const offset = 10.0;
    expect(sourceToPreviewTime(15.5, offset)).toBeCloseTo(5.5);
    expect(sourceToPreviewTime(10.0, offset)).toBeCloseTo(0.0);
    // Cannot be negative
    expect(sourceToPreviewTime(5.0, offset)).toBe(0);
  });

  it("converts preview time to source time", () => {
    const offset = 10.0;
    expect(previewToSourceTime(5.5, offset)).toBeCloseTo(15.5);
    expect(previewToSourceTime(0.0, offset)).toBeCloseTo(10.0);
  });

  it("clamps values between min and max", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("formats seconds to HH:MM:SS.mmm", () => {
    expect(formatTimestamp(0)).toBe("00:00:00.000");
    expect(formatTimestamp(75.5)).toBe("00:01:15.500");
    expect(formatTimestamp(3661.123)).toBe("01:01:01.123");
    expect(formatTimestamp(-5)).toBe("00:00:00.000");
  });

  it("parses valid timestamp strings to seconds", () => {
    expect(parseTimestamp("00:01:15.500")).toBeCloseTo(75.5);
    expect(parseTimestamp("01:01:01.123")).toBeCloseTo(3661.123);
    expect(parseTimestamp("01:30")).toBe(90);
    expect(parseTimestamp("45.25")).toBeCloseTo(45.25);
  });

  it("returns null for invalid timestamp strings", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("invalid")).toBeNull();
    expect(parseTimestamp("00:75:00")).toBeNull(); // invalid minutes >= 60
    expect(parseTimestamp("00:00:65")).toBeNull(); // invalid seconds >= 60
  });

  it("snaps target to closest point within threshold", () => {
    const snapPoints = [10.0, 20.0, 30.0];
    expect(snapToPoints(10.2, snapPoints, 0.3)).toBe(10.0);
    expect(snapToPoints(10.5, snapPoints, 0.3)).toBe(10.5); // outside threshold
    expect(snapToPoints(19.9, snapPoints, 0.2)).toBe(20.0);
  });
});
