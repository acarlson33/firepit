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

type BuildChatMessageHrefOptions =
    | {
          entry?: "highlight";
      }
    | {
          entry: "unread";
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
    onRetry?: (attempt: number) => void;
};

const MESSAGE_HIGHLIGHT_CLASSES = ["ring-2", "ring-amber-400"] as const;
const MESSAGE_SCROLL_CONTAINER_SELECTOR = "[data-message-scroll-container]";

function findMarkedScrollContainer(
    element: HTMLElement,
    boundary: ParentNode,
): HTMLElement | null {
    let currentElement: HTMLElement | null = element;

    while (currentElement && currentElement !== boundary) {
        if (currentElement.matches(MESSAGE_SCROLL_CONTAINER_SELECTOR)) {
            return currentElement;
        }

        currentElement = currentElement.parentElement;
    }

    return null;
}

function findScrollableAncestor(
    element: HTMLElement,
    boundary: ParentNode,
): HTMLElement | null {
    const markedContainer = findMarkedScrollContainer(element, boundary);
    if (markedContainer) {
        return markedContainer;
    }

    let currentElement = element.parentElement;

    while (currentElement && currentElement !== boundary) {
        const styles = window.getComputedStyle(currentElement);
        const overflowY = styles.overflowY;
        const canScroll =
            (overflowY === "auto" || overflowY === "scroll") &&
            currentElement.scrollHeight > currentElement.clientHeight;

        if (canScroll) {
            return currentElement;
        }

        currentElement = currentElement.parentElement;
    }

    return null;
}

function scrollMessageWithinContainer(params: {
    behavior: ScrollBehavior;
    block: ScrollLogicalPosition;
    container: HTMLElement;
    target: HTMLElement;
}) {
    const { behavior, block, container, target } = params;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const relativeTop =
        targetRect.top - containerRect.top + container.scrollTop;

    let nextScrollTop = relativeTop;
    if (block === "center") {
        nextScrollTop =
            relativeTop - container.clientHeight / 2 + target.clientHeight / 2;
    }

    if (block === "end") {
        nextScrollTop =
            relativeTop - container.clientHeight + target.clientHeight;
    }

    if (block === "nearest") {
        const currentTop = container.scrollTop;
        const currentBottom = currentTop + container.clientHeight;
        const targetTop = relativeTop;
        const targetBottom = relativeTop + target.clientHeight;

        if (targetTop < currentTop) {
            nextScrollTop = targetTop;
        } else if (targetBottom > currentBottom) {
            nextScrollTop = targetBottom - container.clientHeight;
        } else {
            nextScrollTop = currentTop;
        }
    }

    container.scrollTo({
        behavior,
        top: Math.max(nextScrollTop, 0),
    });
}

function findMessageElement(
    messageId: string,
    root: ParentNode = document,
): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
}

export function buildChatMessageHref(
    destination: ChatMessageDestination,
    options: BuildChatMessageHrefOptions = { entry: "highlight" },
) {
    const params = new URLSearchParams();

    if (destination.kind === "channel") {
        params.set("channel", destination.channelId);
        if (destination.serverId) {
            params.set("server", destination.serverId);
        }
    } else {
        params.set("conversation", destination.conversationId);
    }

    params.set(
        options.entry === "unread" ? "unread" : "highlight",
        destination.messageId,
    );

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

    const scrollContainer = findScrollableAncestor(target, root);
    if (scrollContainer) {
        scrollMessageWithinContainer({
            behavior,
            block,
            container: scrollContainer,
            target,
        });
    } else {
        target.scrollIntoView({ behavior, block });
    }
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
        onRetry,
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

        onRetry?.(attempts);

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
