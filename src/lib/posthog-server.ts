import { PostHog } from "posthog-node";

type PostHogShim = {
    capture: (...args: Parameters<PostHog["capture"]>) => void;
    shutdown: () => Promise<void>;
};

function createNoOpShim(): PostHogShim {
    return {
        capture(..._args) {
            // no-op: PostHog project API key not configured
        },
        async shutdown() {
            // no-op
        },
    };
}

let posthogClient: PostHog | PostHogShim | null = null;

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
        if (!projectApiKey) {
            posthogClient = createNoOpShim();
        } else {
            // flushAt: 1 and flushInterval: 0 force immediate event delivery,
            // which is critical for serverless/short-lived processes where the
            // process may exit before a batch flush completes.
            posthogClient = new PostHog(projectApiKey, {
                host,
                flushAt: 1,
                flushInterval: 0,
            });
        }
    }
    return posthogClient;
}

export async function shutdownPostHog() {
    if (posthogClient) {
        await posthogClient.shutdown();
    }
}
