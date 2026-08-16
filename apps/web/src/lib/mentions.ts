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

    const result: string[] = Array.from(new Set(trimmed));

    return result;
}
