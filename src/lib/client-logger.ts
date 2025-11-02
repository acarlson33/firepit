/**
 * Client-side logger that integrates with New Relic Browser monitoring
 * Falls back to console in development
 */

interface LogAttributes {
  [key: string]: string | number | boolean | null | undefined;
}

class ClientLogger {
  private getNewRelic() {
    if (typeof window === "undefined") {
      return null;
    }
    return (window as unknown as { newrelic?: { addPageAction: (name: string, attrs?: Record<string, unknown>) => void; noticeError: (error: Error, attrs?: Record<string, unknown>) => void } }).newrelic;
  }

  private shouldLog(): boolean {
    return process.env.NODE_ENV === "development";
  }

  info(message: string, attributes?: LogAttributes): void {
    const newrelic = this.getNewRelic();
    if (newrelic) {
      newrelic.addPageAction("log_info", { message, ...attributes });
    }
    
    if (this.shouldLog()) {
      // biome-ignore lint: development logging allowed
      console.log(`[INFO] ${message}`, attributes ?? "");
    }
  }

  warn(message: string, attributes?: LogAttributes): void {
    const newrelic = this.getNewRelic();
    if (newrelic) {
      newrelic.addPageAction("log_warn", { message, ...attributes });
    }
    
    if (this.shouldLog()) {
      // biome-ignore lint: development logging allowed
      console.warn(`[WARN] ${message}`, attributes ?? "");
    }
  }

  error(message: string, error?: Error | string, attributes?: LogAttributes): void {
    const newrelic = this.getNewRelic();
    
    if (newrelic) {
      if (error instanceof Error) {
        newrelic.noticeError(error, { message, ...attributes });
      } else {
        newrelic.addPageAction("log_error", { 
          message, 
          error: error?.toString(), 
          ...attributes 
        });
      }
    }
    
    if (this.shouldLog()) {
      // biome-ignore lint: development logging allowed
      console.error(`[ERROR] ${message}`, error ?? "", attributes ?? "");
    }
  }

  debug(message: string, attributes?: LogAttributes): void {
    // Only log debug messages in development
    if (this.shouldLog()) {
      // biome-ignore lint: development logging allowed
      console.log(`[DEBUG] ${message}`, attributes ?? "");
    }
  }
}

// Export singleton instance
export const logger = new ClientLogger();
