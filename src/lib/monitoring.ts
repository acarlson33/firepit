type Metric = {
  name: string;
  value: number;
  attributes?: Record<string, string | number | boolean>;
};
const queue: Metric[] = [];
const maxBuffer = 100;
export function recordMetric(
  name: string,
  value = 1,
  attributes?: Metric["attributes"]
) {
  if (!name) {
    return;
  }
  if (queue.length < maxBuffer) {
    queue.push({ name, value, attributes });
  }
}
export function flushMetrics() {
  queue.length = 0;
}
export function recordTiming(
  name: string,
  start: number,
  attributes?: Metric["attributes"]
) {
  recordMetric(name, Date.now() - start, { ...(attributes || {}), unit: "ms" });
}

// Test-only helpers (no runtime impact outside tests)
export function __getMetricsSnapshot() {
  return [...queue];
}

export function __setTestMetricBuffer(newMax: number) {
  // no-op placeholder to satisfy potential future dynamic buffer sizing
  if (newMax < 0) {
    throw new Error("buffer size must be positive");
  }
}
