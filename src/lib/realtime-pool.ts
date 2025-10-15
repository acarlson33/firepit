/**
 * Realtime subscription pool to reduce connection churn
 * Shares a single Appwrite Client instance across components
 */

import { Client } from "appwrite";

let sharedClient: Client | null = null;
const subscriptionRefs = new Map<string, number>();

/**
 * Get or create shared Appwrite client
 */
export function getSharedClient(): Client {
  if (!sharedClient) {
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const project = process.env.APPWRITE_PROJECT_ID;

    if (!endpoint || !project) {
      throw new Error("Missing Appwrite configuration");
    }

    sharedClient = new Client()
      .setEndpoint(endpoint)
      .setProject(project);
  }

  return sharedClient;
}

/**
 * Track subscription references to prevent premature cleanup
 */
export function trackSubscription(channel: string): () => void {
  const count = subscriptionRefs.get(channel) ?? 0;
  subscriptionRefs.set(channel, count + 1);

  return () => {
    const newCount = (subscriptionRefs.get(channel) ?? 1) - 1;
    if (newCount <= 0) {
      subscriptionRefs.delete(channel);
    } else {
      subscriptionRefs.set(channel, newCount);
    }
  };
}

/**
 * Check if a channel has active subscriptions
 */
export function hasActiveSubscriptions(channel: string): boolean {
  return (subscriptionRefs.get(channel) ?? 0) > 0;
}
