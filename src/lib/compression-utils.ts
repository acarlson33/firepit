/**
 * Compression utilities for API responses
 * Reduces bandwidth usage and improves load times for large payloads
 */

/**
 * Determines whether a response should be compressed based on content type and size.
 *
 * @param {string} contentType - MIME type of the response body.
 * @param {number} bodySize - Size of the response body in bytes.
 * @returns {boolean} True if the response should be compressed based on content type and size.
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
 * Returns HTTP headers used for compressed responses.
 * Includes content-encoding metadata such as {"Content-Encoding": "gzip"}.
 */
export function getCompressionHeaders(): Record<string, string> {
    return {
        "Content-Encoding": "gzip",
        Vary: "Accept-Encoding",
    };
}
