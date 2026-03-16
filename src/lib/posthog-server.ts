import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
    const projectApiKey =
        process.env.POSTHOG_PROJECT_API_KEY ??
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
        "";
    const host =
        process.env.POSTHOG_HOST ??
        process.env.NEXT_PUBLIC_POSTHOG_HOST ??
        "https://us.i.posthog.com";

    if (!posthogClient) {
        posthogClient = new PostHog(projectApiKey, {
            host,
            flushAt: 1,
            flushInterval: 0,
        });
    }
    return posthogClient;
}

export async function shutdownPostHog() {
    if (posthogClient) {
        await posthogClient.shutdown();
    }
}
