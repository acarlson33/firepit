import { NextResponse } from "next/server";
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";
import { logger } from "@/lib/newrelic-utils";

export async function GET() {
    try {
        const enabled = await getFeatureFlag(FEATURE_FLAGS.ALLOW_USER_SERVERS);

        return NextResponse.json({ enabled });
    } catch (error) {
        logger.error("Failed to get allow-user-servers feature flag", {
            error: error instanceof Error ? error.message : String(error),
        });

        // Default to false if there's an error
        return NextResponse.json({ enabled: false });
    }
}
