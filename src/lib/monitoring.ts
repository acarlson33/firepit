type Metric = {
  name: string;
  value: number;
  attributes?: Record<string, string | number | boolean>;
};
const queue: Metric[] = [];
const maxBuffer = 100;
/**
 * Handles record metric.
 *
 * @param {string} name - The name value.
 * @param {number} value - The value value, if provided.
 * @param {Record<string, string | number | boolean> | undefined} attributes - The attributes value, if provided.
 * @returns {void} The return value.
 */
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
/**
 * Handles flush metrics.
 * @returns {void} The return value.
 */
export function flushMetrics() {
  queue.length = 0;
}
/**
 * Handles record timing.
 *
 * @param {string} name - The name value.
 * @param {number} start - The start value.
 * @param {Record<string, string | number | boolean> | undefined} attributes - The attributes value, if provided.
 * @returns {void} The return value.
 */
export function recordTiming(
  name: string,
  start: number,
  attributes?: Metric["attributes"]
) {
  recordMetric(name, Date.now() - start, { ...(attributes || {}), unit: "ms" });
}

// Test-only helpers (no runtime impact outside tests)
/**
 * Handles get metrics snapshot.
 * @returns {Metric[]} The return value.
 */
export function __getMetricsSnapshot() {
  return [...queue];
}

/**
 * Handles set test metric buffer.
 *
 * @param {number} newMax - The new max value.
 * @returns {void} The return value.
 */
export function __setTestMetricBuffer(newMax: number) {
  // no-op placeholder to satisfy potential future dynamic buffer sizing
  if (newMax < 0) {
    throw new Error("buffer size must be positive");
  }
}
