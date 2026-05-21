type AuditMember = {
    userId: string;
    userName?: string;
    displayName?: string;
};

type AuditUserLabelOptions = {
    defaultLabel?: string;
    fallbackName?: string;
    members: AuditMember[];
    userId?: string;
};

function getShortId(value?: string) {
    return value ? value.slice(0, 8) : undefined;
}

export function getAuditUserLabel({
    defaultLabel,
    fallbackName,
    members,
    userId,
}: AuditUserLabelOptions) {
    const member = userId
        ? members.find((candidate) => candidate.userId === userId)
        : undefined;

    const preferredUserName = member?.userName?.trim();
    if (preferredUserName) {
        return preferredUserName;
    }

    const trimmedFallbackName = fallbackName?.trim();
    if (trimmedFallbackName) {
        return trimmedFallbackName;
    }

    const displayName = member?.displayName?.trim();
    if (displayName) {
        return displayName;
    }

    return getShortId(userId) || defaultLabel || "Unknown user";
}
