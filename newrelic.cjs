/**
 * New Relic Configuration
 * 
 * This file configures New Relic APM for comprehensive monitoring including:
 * - Application performance monitoring (APM)
 * - Error tracking
 * - Transaction tracing
 * - Custom events and metrics
 * - Browser monitoring
 * 
 * Documentation: https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration/
 */

'use strict'

const process = require('process');

/**
 * New Relic agent configuration.
 *
 * See lib/config/default.js in the agent distribution for a more complete
 * description of configuration variables and their potential values.
 */
exports.config = {
  /**
   * Application name(s) - can be a string or array for multiple app names
   * This is how your app will appear in New Relic
   */
  app_name: [process.env.NEW_RELIC_APP_NAME || 'firepit-qpc'],
  
  /**
   * Your New Relic license key
   */
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',
  
  /**
   * Logging configuration
   */
  logging: {
    /**
     * Level at which to log. Options: trace, debug, info, warn, error, fatal
     * Use 'info' for production
     */
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    
    /**
     * Where to write log data
     */
    filepath: 'stdout',
    
    /**
     * Whether to collect and send logs to New Relic
     */
    enabled: true,
  },
  
  /**
   * Allow all data to be sent to New Relic
   */
  allow_all_headers: true,
  
  /**
   * Attributes configuration - control what data is captured
   */
  attributes: {
    /**
     * Enable attribute capture globally
     */
    enabled: true,
    
    /**
     * Attributes to exclude from all destinations
     */
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.x-api-key',
    ],
  },
  
  /**
   * Application logging configuration
   * Forward application logs to New Relic
   */
  application_logging: {
    enabled: true,
    
    /**
     * Forward logs to New Relic
     */
    forwarding: {
      enabled: true,
      max_samples_stored: 10000,
    },
    
    /**
     * Local log decoration (add New Relic metadata to logs)
     */
    local_decorating: {
      enabled: true,
    },
    
    /**
     * Metrics derived from logs
     */
    metrics: {
      enabled: true,
    },
  },
  
  /**
   * Error collector configuration
   */
  error_collector: {
    enabled: true,
    
    /**
     * Ignore specific error status codes
     * 404s are usually not errors we care about
     */
    ignore_status_codes: [404],
    
    /**
     * Maximum number of errors to send per harvest cycle
     */
    max_event_samples_stored: 100,
    
    /**
     * Capture error attributes
     */
    attributes: {
      enabled: true,
    },
  },
  
  /**
   * Transaction tracer configuration
   */
  transaction_tracer: {
    enabled: true,
    
    /**
     * Threshold for when a transaction is considered slow (in seconds)
     */
    transaction_threshold: 'apdex_f',
    
    /**
     * Maximum number of slow queries to collect per harvest cycle
     */
    top_n: 20,
    
    /**
     * Record SQL queries
     */
    record_sql: 'obfuscated',
    
    /**
     * Explain plan threshold (in milliseconds)
     */
    explain_threshold: 500,
    
    /**
     * Capture transaction attributes
     */
    attributes: {
      enabled: true,
    },
  },
  
  /**
   * Distributed tracing configuration
   * Essential for tracking requests across services
   */
  distributed_tracing: {
    enabled: true,
  },
  
  /**
   * Slow SQL configuration
   */
  slow_sql: {
    enabled: true,
    max_samples: 10,
  },
  
  /**
   * Transaction events configuration
   */
  transaction_events: {
    enabled: true,
    max_samples_stored: 10000,
    
    attributes: {
      enabled: true,
    },
  },
  
  /**
   * Custom insights events configuration
   */
  custom_insights_events: {
    enabled: true,
    max_samples_stored: 10000,
  },
  
  /**
   * Browser monitoring configuration
   * Enables Real User Monitoring (RUM)
   */
  browser_monitoring: {
    enable: true,
    
    /**
     * Attributes to capture in browser monitoring
     */
    attributes: {
      enabled: true,
    },
  },
  
  /**
   * Span events configuration (for distributed tracing)
   */
  span_events: {
    enabled: true,
    
    attributes: {
      enabled: true,
    },
  },
  
  /**
   * Rules for naming and ignoring transactions
   */
  rules: {
    /**
     * Transaction naming rules
     */
    name: [
      // API routes
      { pattern: '/api/(.*)', name: '/api/*' },
      // Dynamic routes
      { pattern: '/(.*)', name: '/*' },
    ],
    
    /**
     * Transactions to ignore (don't report to New Relic)
     */
    ignore: [
      // Health check endpoints
      '^/api/health$',
      '^/health$',
      // Next.js internals
      '^/_next/static',
      '^/_next/image',
      // Favicons
      '^/favicon',
    ],
  },
  
  /**
   * Labels for organizing apps in New Relic
   */
  labels: {
    environment: process.env.NODE_ENV || 'development',
    project: 'firepit',
  },
}
