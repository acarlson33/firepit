function isValidMentionId(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function normalizeMentionIds(input: unknown): string[] {
    let normalizedInput: unknown[];
    if (!Array.isArray(input)) {
        // Try parsing JSON string
        if (typeof input === "string") {
            try {
                const parsed = JSON.parse(input);
                normalizedInput = Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        } else {
            return [];
        }
    } else {
        normalizedInput = input;
    }

    const trimmed = normalizedInput.filter(isValidMentionId).map((v) => v.trim());

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
