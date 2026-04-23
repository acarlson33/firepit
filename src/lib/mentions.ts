export function isValidMentionId(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function normalizeMentionIds(input: unknown): string[] {
    if (!Array.isArray(input)) {
        // Try parsing JSON string
        if (typeof input === "string") {
            try {
                const parsed = JSON.parse(input);
                if (Array.isArray(parsed)) {
                    input = parsed;
                } else {
                    return [];
                }
            } catch {
                return [];
            }
        } else {
            return [];
        }
    }

    const trimmed = (input as unknown[])
        .filter((v): v is string => isValidMentionId(v))
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

    // Dedupe while preserving order
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of trimmed) {
        if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    }

    return result;
}
