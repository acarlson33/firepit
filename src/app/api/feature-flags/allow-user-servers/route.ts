import { NextResponse } from "next/server";
import { logger } from "@/lib/newrelic-utils";
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";

export async function GET() {
	try {
		const enabled = await getFeatureFlag(FEATURE_FLAGS.ALLOW_USER_SERVERS);
		
		return NextResponse.json({ enabled });
	} catch (error) {
		logger.error("Failed to get feature flag:", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
		
		// Default to false if there's an error
		return NextResponse.json({ enabled: false });
	}
}
