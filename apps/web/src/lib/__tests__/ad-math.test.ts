import { describe, it, expect } from "vitest";
import {
  calculateTimeline,
  mainTimeToTotalTime,
  totalTimeToMainTime,
  layoutToCSS,
  formatTimelineSummary,
  formatTemplateSummary,
  validatePlacement,
} from "../ad-math";
import type { AdPlacement, AdLayout } from "@/types";

describe("ad-math timeline calculations", () => {
  it("calculates exact timeline totals with prerolls and postrolls", () => {
    const placements: AdPlacement[] = [
      {
        id: "p1",
        ad_asset_id: "asset-1",
        type: "preroll",
        timing: { duration_sec: 5.5 },
        layout: { position: "center" },
      },
      {
        id: "p2",
        ad_asset_id: "asset-2",
        type: "postroll",
        timing: { duration_sec: 3.25 },
        layout: { position: "center" },
      },
      {
        id: "p3",
        ad_asset_id: "asset-3",
        type: "overlay",
        timing: { offset_sec: 2, duration_sec: 4 },
        layout: { position: "top_right" },
      },
    ];

    const timeline = calculateTimeline(40.0, placements);
    expect(timeline.preroll_duration_sec).toBe(5.5);
    expect(timeline.postroll_duration_sec).toBe(3.25);
    expect(timeline.main_duration_sec).toBe(40.0);
    expect(timeline.total_duration_sec).toBe(48.75);
  });

  it("handles main clip with no ads", () => {
    const timeline = calculateTimeline(30.0, []);
    expect(timeline.preroll_duration_sec).toBe(0);
    expect(timeline.postroll_duration_sec).toBe(0);
    expect(timeline.main_duration_sec).toBe(30.0);
    expect(timeline.total_duration_sec).toBe(30.0);
  });

  it("converts between main clip time and total composite time", () => {
    const preroll = 5.0;
    // 10s into main clip is 15s in total video
    expect(mainTimeToTotalTime(10, preroll)).toBe(15.0);
    // 15s in total video is 10s in main clip
    expect(totalTimeToMainTime(15, preroll)).toBe(10.0);
  });
});

describe("layoutToCSS", () => {
  it("generates CSS for top-right position with margins and scale", () => {
    const layout: AdLayout = {
      position: "top_right",
      scale: 0.25,
      margin: 0.04,
      opacity: 0.9,
    };
    const css = layoutToCSS(layout);
    expect(css.position).toBe("absolute");
    expect(css.width).toBe("25%");
    expect(css.top).toBe("4%");
    expect(css.right).toBe("4%");
    expect(css.opacity).toBe(0.9);
  });

  it("generates CSS for center position", () => {
    const layout: AdLayout = {
      position: "center",
      scale: 0.5,
      opacity: 1.0,
    };
    const css = layoutToCSS(layout);
    expect(css.top).toBe("50%");
    expect(css.left).toBe("50%");
    expect(css.transform).toBe("translate(-50%, -50%)");
  });
});

describe("summary formatters", () => {
  it("formats timeline summary string correctly", () => {
    const summary = formatTimelineSummary({
      main_duration_sec: 40,
      preroll_duration_sec: 5,
      postroll_duration_sec: 2,
      total_duration_sec: 47,
    });
    expect(summary).toBe("Total 0:47 = 0:05 ad + 0:40 clip + 0:02 ad");
  });

  it("formats template summary nicely", () => {
    const placements: Omit<AdPlacement, "id">[] = [
      {
        ad_asset_id: "a1",
        type: "preroll",
        timing: { duration_sec: 5 },
        layout: { position: "center" },
      },
      {
        ad_asset_id: "a2",
        type: "overlay",
        timing: { offset_sec: 0, duration_sec: 5 },
        layout: { position: "bottom_right" },
      },
      {
        ad_asset_id: "a3",
        type: "lower_third",
        timing: { offset_sec: 3, duration_sec: 5 },
        layout: { position: "bottom_left" },
      },
    ];
    const text = formatTemplateSummary(placements);
    expect(text).toBe("5s pre-roll + bottom-right overlay + lower-third at 3s");
  });
});

describe("validatePlacement", () => {
  it("flags missing asset and invalid duration", () => {
    const res = validatePlacement(
      {
        id: "p1",
        ad_asset_id: "",
        type: "preroll",
        timing: { duration_sec: 0 },
        layout: { position: "center" },
      },
      30,
      0
    );
    expect(res.valid).toBe(false);
    expect(res.errors.ad_asset_id).toBeDefined();
    expect(res.errors.duration_sec).toBeDefined();
  });

  it("flags preroll exceeding 30 seconds total limit", () => {
    const res = validatePlacement(
      {
        id: "p1",
        ad_asset_id: "asset-1",
        type: "preroll",
        timing: { duration_sec: 15 },
        layout: { position: "center" },
      },
      30,
      20 // already 20s
    );
    expect(res.valid).toBe(false);
    expect(res.errors.duration_sec).toContain("30 seconds");
  });

  it("flags overlay extending past clip duration", () => {
    const res = validatePlacement(
      {
        id: "p1",
        ad_asset_id: "asset-1",
        type: "overlay",
        timing: { offset_sec: 25, duration_sec: 10 },
        layout: { position: "top_right" },
      },
      30, // main clip is 30s
      0
    );
    expect(res.valid).toBe(false);
    expect(res.errors.offset_sec).toContain("exceeds clip duration");
  });
});
