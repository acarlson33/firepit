import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getOrCreateUserProfile, updateUserProfile } from "@/lib/appwrite-profiles";
import { logger } from "@/lib/newrelic-utils";

type PatchBody = {
    dmEncryptionPublicKey: string;
};

const PUBLIC_KEY_MAX_LENGTH = 256;
const PUBLIC_KEY_BYTE_LENGTH = 32;

const isLikelyBase64 = (value: string): boolean =>
    /^[A-Za-z0-9+/=_-]+$/.test(value);

function decodeBase64ToBytes(value: string): Uint8Array | null {
    try {
        const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
        const padded = normalized.padEnd(
            Math.ceil(normalized.length / 4) * 4,
            "=",
        );
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        return bytes;
    } catch {
        return null;
    }
}

function isPatchBody(value: unknown): value is PatchBody {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Partial<PatchBody>;
    return typeof candidate.dmEncryptionPublicKey === "string";
}

export async function GET() {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);

        return NextResponse.json({
            dmEncryptionPublicKey: profile.dmEncryptionPublicKey,
            userId: user.$id,
        });
    } catch (error) {
        logger.error("Failed to fetch DM encryption key metadata", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        if (!isPatchBody(body)) {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        const dmEncryptionPublicKey = body.dmEncryptionPublicKey;
        const decodedPublicKey = decodeBase64ToBytes(dmEncryptionPublicKey);

        if (
            typeof dmEncryptionPublicKey !== "string" ||
            dmEncryptionPublicKey.length === 0 ||
            dmEncryptionPublicKey.length > PUBLIC_KEY_MAX_LENGTH ||
            !isLikelyBase64(dmEncryptionPublicKey) ||
            !decodedPublicKey ||
            decodedPublicKey.length !== PUBLIC_KEY_BYTE_LENGTH
        ) {
            return NextResponse.json(
                {
                    error:
                        "Invalid dmEncryptionPublicKey: key must be base64 and decode to 32 bytes",
                },
                { status: 400 },
            );
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);
        const updated = await updateUserProfile(profile.$id, {
            dmEncryptionPublicKey,
        });

        return NextResponse.json({
            dmEncryptionPublicKey: updated.dmEncryptionPublicKey,
            userId: user.$id,
        });
    } catch (error) {
        logger.error("Failed to update DM encryption key metadata", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
