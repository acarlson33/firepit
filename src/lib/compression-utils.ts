/**
 * Compression utilities for API responses
 * Reduces bandwidth usage and improves load times for large payloads
 *
 * @param {string} contentType - The content type value.
 * @param {number} bodySize - The body size value.
 * @returns {boolean} The return value.
 */

export function shouldCompress(contentType: string, bodySize: number): boolean {
  // Only compress responses larger than 1KB
  const MIN_SIZE_TO_COMPRESS = 1024;
  
  if (bodySize < MIN_SIZE_TO_COMPRESS) {
    return false;
  }

  // Compress JSON, text, and other compressible content types
  const compressibleTypes = [
    "application/json",
    "text/html",
    "text/css",
    "text/javascript",
    "application/javascript",
    "text/plain",
    "text/xml",
    "application/xml",
  ];

  return compressibleTypes.some((type) => contentType.includes(type));
}

/**
 * Returns compression headers.
 * @returns {{ [x: string]: string; }} The return value.
 */
export function getCompressionHeaders(): Record<string, string> {
  return {
    "Content-Encoding": "gzip",
    Vary: "Accept-Encoding",
  };
}
