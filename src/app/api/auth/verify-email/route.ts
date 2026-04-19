import { Account, Client } from "node-appwrite";
import { NextResponse } from "next/server";

import { getEnvConfig } from "@/lib/appwrite-core";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import { logger } from "@/lib/newrelic-utils";

function buildLoginRedirect(requestUrl: string): URL {
    return new URL("/login", requestUrl);
}

export async function GET(request: Request) {
    const loginRedirectUrl = buildLoginRedirect(request.url);

    const featureEnabled = await getFeatureFlag(
        FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION,
    ).catch(() => false);

    if (!featureEnabled) {
        return NextResponse.redirect(loginRedirectUrl);
    }

    const requestUrl = new URL(request.url);
    const userId = requestUrl.searchParams.get("userId")?.trim() || "";
    const secret = requestUrl.searchParams.get("secret")?.trim() || "";

    if (!userId || !secret) {
        loginRedirectUrl.searchParams.set("verified", "0");
        return NextResponse.redirect(loginRedirectUrl);
    }

    try {
        const { endpoint, project } = getEnvConfig();
        const client = new Client().setEndpoint(endpoint).setProject(project);
        const account = new Account(client);

        await account.updateVerification({
            userId,
            secret,
        });

        loginRedirectUrl.searchParams.set("verified", "1");
        return NextResponse.redirect(loginRedirectUrl);
    } catch (error) {
        logger.error("Email verification callback failed", {
            error: error instanceof Error ? error.message : String(error),
            hasUserId: userId.length > 0,
            loginRedirectUrl: loginRedirectUrl.toString(),
        });
        loginRedirectUrl.searchParams.set("verified", "0");
        return NextResponse.redirect(loginRedirectUrl);
    }
}
