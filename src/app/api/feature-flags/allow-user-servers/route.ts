import { NextResponse } from "next/server";
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";

export async function GET() {
    try {
        const enabled = await getFeatureFlag(FEATURE_FLAGS.ALLOW_USER_SERVERS);

        return NextResponse.json({ enabled });
    } catch (error) {
        console.error("Failed to get feature flag:", error);

        // Default to false if there's an error
        return NextResponse.json({ enabled: false });
    }
}
