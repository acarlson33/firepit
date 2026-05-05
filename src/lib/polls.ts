import type { MessagePoll, MessagePollOption } from "@/lib/types";

type PollOptionRecord = {
    id: string;
    text: string;
};

type PollVoteRecord = {
    pollId: string;
    userId: string;
    optionId: string;
};

const POLL_COMMAND_PREFIX = "/poll";
const MAX_POLL_OPTIONS = 10;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_QUESTION_LENGTH = 300;
const MAX_POLL_OPTION_LENGTH = 120;

type ParsedPollCommand = {
    question: string;
    options: PollOptionRecord[];
};

export type PollDocShape = {
    $id: string;
    messageId: string;
    channelId: string;
    question: string;
    options: string;
    status: "open" | "closed";
    createdBy: string;
    closedAt?: string;
    closedBy?: string;
};

type PollVoteDocShape = {
    $id: string;
    pollId: string;
    userId: string;
    optionId: string;
};

function parseQuotedSegments(input: string): string[] | null {
    const segments: string[] = [];
    let index = 0;

    while (index < input.length) {
        while (index < input.length && /\s/.test(input[index])) {
            index += 1;
        }

        if (index >= input.length || input[index] !== '"') {
            return null;
        }

        index += 1;
        const start = index;

        while (index < input.length && input[index] !== '"') {
            index += 1;
        }

        if (index >= input.length) {
            return null;
        }

        const segment = input.slice(start, index).trim();
        segments.push(segment);
        index += 1;

        while (index < input.length && /\s/.test(input[index])) {
            index += 1;
        }

        if (index >= input.length) {
            break;
        }

        if (input[index] !== "|") {
            return null;
        }
        index += 1;
    }

    return segments;
}

function normalizePollStatus(value: unknown): "open" | "closed" {
    return value === "closed" ? "closed" : "open";
}

export function normalizePollDocument(raw: unknown): PollDocShape | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const value = raw as Record<string, unknown>;
    if (
        typeof value.$id !== "string" ||
        typeof value.messageId !== "string" ||
        typeof value.channelId !== "string" ||
        typeof value.question !== "string" ||
        typeof value.options !== "string" ||
        typeof value.createdBy !== "string"
    ) {
        return null;
    }

    return {
        $id: value.$id,
        messageId: value.messageId,
        channelId: value.channelId,
        question: value.question,
        options: value.options,
        status: normalizePollStatus(value.status),
        createdBy: value.createdBy,
        closedAt: typeof value.closedAt === "string" ? value.closedAt : undefined,
        closedBy: typeof value.closedBy === "string" ? value.closedBy : undefined,
    };
}

export function normalizePollVoteDocument(raw: unknown): PollVoteDocShape | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const value = raw as Record<string, unknown>;
    if (
        typeof value.$id !== "string" ||
        typeof value.pollId !== "string" ||
        typeof value.userId !== "string" ||
        typeof value.optionId !== "string"
    ) {
        return null;
    }

    return {
        $id: value.$id,
        pollId: value.pollId,
        userId: value.userId,
        optionId: value.optionId,
    };
}

export function isPollCommand(text: string): boolean {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith(POLL_COMMAND_PREFIX)) {
        return false;
    }

    if (trimmed.length === POLL_COMMAND_PREFIX.length) {
        return true;
    }

    const nextCharacter = trimmed.at(POLL_COMMAND_PREFIX.length) ?? "";
    return /\s/.test(nextCharacter);
}

export function parsePollCommand(text: string): ParsedPollCommand {
    const trimmed = text.trim();
    const commandBody = trimmed.slice(POLL_COMMAND_PREFIX.length).trim();

    if (!commandBody) {
        throw new Error(
            'Poll command requires a question and options. Format: /poll "Question" | "Option 1" | "Option 2"',
        );
    }

    const segments = parseQuotedSegments(commandBody);
    if (!segments) {
        throw new Error(
            'Invalid poll format. Use: /poll "Question" | "Option 1" | "Option 2"',
        );
    }

    const [question, ...optionTexts] = segments;
    if (!question || question.length > MAX_POLL_QUESTION_LENGTH) {
        throw new Error(
            `Poll question must be between 1 and ${MAX_POLL_QUESTION_LENGTH} characters.`,
        );
    }

    if (
        optionTexts.length < MIN_POLL_OPTIONS ||
        optionTexts.length > MAX_POLL_OPTIONS
    ) {
        throw new Error(
            `Poll must include between ${MIN_POLL_OPTIONS} and ${MAX_POLL_OPTIONS} options.`,
        );
    }

    const options = optionTexts.map((optionText, optionIndex) => {
        if (!optionText || optionText.length > MAX_POLL_OPTION_LENGTH) {
            throw new Error(
                `Each option must be between 1 and ${MAX_POLL_OPTION_LENGTH} characters.`,
            );
        }

        return {
            id: `option-${optionIndex + 1}`,
            text: optionText,
        };
    });

    return {
        question,
        options,
    };
}

export function serializePollOptions(options: PollOptionRecord[]): string {
    return JSON.stringify(options);
}

export function parsePollOptions(raw: unknown): PollOptionRecord[] {
    let parsedRaw: unknown = raw;

    if (typeof raw === "string") {
        try {
            parsedRaw = JSON.parse(raw) as unknown;
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsedRaw)) {
        return [];
    }

    return parsedRaw
        .map((value, index) => {
            if (typeof value === "string") {
                return {
                    id: `option-${index + 1}`,
                    text: value.trim(),
                };
            }

            if (typeof value !== "object" || value === null) {
                return null;
            }

            const optionValue = value as { id?: unknown; text?: unknown };
            const id =
                typeof optionValue.id === "string" &&
                optionValue.id.trim().length > 0
                    ? optionValue.id.trim()
                    : `option-${index + 1}`;
            const text =
                typeof optionValue.text === "string"
                    ? optionValue.text.trim()
                    : "";

            return {
                id,
                text,
            };
        })
        .filter((option): option is PollOptionRecord => option !== null)
        .filter((option) => option.text.length > 0);
}

export function buildMessagePoll(params: {
    poll: PollDocShape;
    votes: PollVoteRecord[];
}): MessagePoll {
    const { poll, votes } = params;
    const optionTemplate = parsePollOptions(poll.options);
    const voteMap = new Map<string, Set<string>>();

    for (const option of optionTemplate) {
        voteMap.set(option.id, new Set());
    }

    for (const vote of votes) {
        if (!voteMap.has(vote.optionId)) {
            continue;
        }

        voteMap.get(vote.optionId)?.add(vote.userId);
    }

    const options: MessagePollOption[] = optionTemplate.map((option) => {
        const voterIds = Array.from(voteMap.get(option.id) ?? new Set<string>());
        return {
            id: option.id,
            text: option.text,
            count: voterIds.length,
            voterIds,
        };
    });

    return {
        id: poll.$id,
        messageId: poll.messageId,
        contextType: "channel",
        contextId: poll.channelId,
        question: poll.question,
        options,
        status: normalizePollStatus(poll.status),
        createdBy: poll.createdBy,
        closedAt: poll.closedAt,
        closedBy: poll.closedBy,
    };
}
