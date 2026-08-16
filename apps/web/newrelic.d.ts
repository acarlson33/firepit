/**
 * Type declarations for the newrelic module
 * Since @types/newrelic doesn't exist, we declare the module to satisfy TypeScript
 */
declare module 'newrelic' {
  const newrelic: unknown;
  export default newrelic;
}
