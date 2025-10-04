import { describe, expect, it } from "vitest";

import {
  __getMetricsSnapshot,
  __setTestMetricBuffer,
  flushMetrics,
  recordMetric,
  recordTiming,
} from "../lib/monitoring";

const TEST_METRIC_BATCH = 5;

describe("monitoring", () => {
  it("records metrics up to buffer", () => {
    flushMetrics();
    for (let i = 0; i < TEST_METRIC_BATCH; i += 1) {
      recordMetric("test.count");
    }
    const snap = __getMetricsSnapshot();
    expect(snap.filter((m) => m.name === "test.count")).toHaveLength(
      TEST_METRIC_BATCH
    );
  });
  it("records timing metric", () => {
    flushMetrics();
    const start = Date.now() - 10;
    recordTiming("timing.op", start);
    const snap = __getMetricsSnapshot();
    const timing = snap.find((m) => m.name === "timing.op");
    expect(timing).toBeTruthy();
    expect(typeof timing?.value).toBe("number");
  });
  it("flush clears metrics", () => {
    recordMetric("flush.test");
    flushMetrics();
    expect(__getMetricsSnapshot()).toHaveLength(0);
  });
  it("ignores empty name + caps buffer", () => {
    flushMetrics();
    recordMetric(""); // ignored
    const overfillAttempts = 110;
    const bufferMax = 100; // defined in module
    for (let i = 0; i < overfillAttempts; i += 1) {
      recordMetric("cap.test");
    }
    const snap = __getMetricsSnapshot();
    expect(
      snap.filter((m) => m.name === "cap.test").length
    ).toBeLessThanOrEqual(bufferMax);
  });
  it("__setTestMetricBuffer throws on negative input", () => {
    expect(() => __setTestMetricBuffer(-1)).toThrow();
  });
});
