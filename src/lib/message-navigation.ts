export type ChatMessageDestination =
    | {
          kind: "channel";
          channelId: string;
          messageId: string;
          serverId?: string;
      }
    | {
          kind: "dm";
          conversationId: string;
          messageId: string;
      };

type JumpToMessageOptions = {
    behavior?: ScrollBehavior;
    block?: ScrollLogicalPosition;
    highlightDurationMs?: number;
    root?: ParentNode;
};

type DeferredJumpToMessageOptions = JumpToMessageOptions & {
    retryAttempts?: number;
    retryDelayMs?: number;
    onComplete?: (found: boolean) => void;
};

const MESSAGE_HIGHLIGHT_CLASSES = ["ring-2", "ring-amber-400"] as const;

function findMessageElement(
    messageId: string,
    root: ParentNode = document,
): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
}

export function buildChatMessageHref(destination: ChatMessageDestination) {
    const params = new URLSearchParams();

    if (destination.kind === "channel") {
        params.set("channel", destination.channelId);
        if (destination.serverId) {
            params.set("server", destination.serverId);
        }
    } else {
        params.set("conversation", destination.conversationId);
    }

    params.set("highlight", destination.messageId);

    return `/chat?${params.toString()}`;
}

export function jumpToMessage(
    messageId: string,
    options: JumpToMessageOptions = {},
): boolean {
    const {
        behavior = "smooth",
        block = "center",
        highlightDurationMs = 2000,
        root = document,
    } = options;

    const target = findMessageElement(messageId, root);
    if (!target) {
        return false;
    }

    target.scrollIntoView({ behavior, block });
    target.classList.add(...MESSAGE_HIGHLIGHT_CLASSES);

    window.setTimeout(() => {
        if (target.isConnected) {
            target.classList.remove(...MESSAGE_HIGHLIGHT_CLASSES);
        }
    }, highlightDurationMs);

    return true;
}

export function jumpToMessageWhenReady(
    messageId: string,
    options: DeferredJumpToMessageOptions = {},
) {
    const {
        retryAttempts = 10,
        retryDelayMs = 150,
        onComplete,
        ...jumpOptions
    } = options;

    let cancelled = false;
    let attempts = 0;
    let timeoutId: number | undefined;

    const tryJump = () => {
        if (cancelled) {
            return;
        }

        const found = jumpToMessage(messageId, jumpOptions);
        if (found) {
            onComplete?.(true);
            return;
        }

        attempts += 1;
        if (attempts >= retryAttempts) {
            onComplete?.(false);
            return;
        }

        timeoutId = window.setTimeout(tryJump, retryDelayMs);
    };

    tryJump();

    return () => {
        cancelled = true;
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
        }
    };
}
