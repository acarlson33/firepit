export interface MentionMatch {
  fullMatch: string;
  username: string;
  startIndex: number;
  endIndex: number;
}

export interface EmojiMatch {
  fullMatch: string;
  shortcode: string;
  startIndex: number;
  endIndex: number;
}

const MENTION_REGEX = /(?<![\w@])@([a-zA-Z0-9_]+)/g;

export function parseMentions(text: string): MentionMatch[] {
  const matches: MentionMatch[] = [];
  MENTION_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      username: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}

export function getMentionAtCursor(
  text: string,
  cursorPosition: number,
): MentionMatch | null {
  const beforeCursor = text.slice(0, cursorPosition);
  const lastAtSymbol = beforeCursor.lastIndexOf("@");

  if (lastAtSymbol === -1) {
    return null;
  }

  const textAfterAt = text.slice(lastAtSymbol + 1, cursorPosition);
  if (/\s/.test(textAfterAt)) {
    return null;
  }

  const textAfterCursor = text.slice(cursorPosition);
  const nextWhitespace = textAfterCursor.search(/\s/);
  const endIndex =
    nextWhitespace === -1 ? text.length : cursorPosition + nextWhitespace;

  const fullMatch = text.slice(lastAtSymbol, endIndex);
  const username = fullMatch.slice(1);

  return {
    fullMatch,
    username,
    startIndex: lastAtSymbol,
    endIndex,
  };
}

export function replaceMentionAtCursor(
  text: string,
  cursorPosition: number,
  newUsername: string,
): { newText: string; newCursorPosition: number } {
  const mention = getMentionAtCursor(text, cursorPosition);

  if (!mention) {
    return { newText: text, newCursorPosition: cursorPosition };
  }

  const before = text.slice(0, mention.startIndex);
  const after = text.slice(mention.endIndex);
  const newText = `${before}@${newUsername} ${after}`;
  const newCursorPosition = mention.startIndex + newUsername.length + 2;

  return { newText, newCursorPosition };
}

export function getEmojiAtCursor(
  text: string,
  cursorPosition: number,
): EmojiMatch | null {
  const beforeCursor = text.slice(0, cursorPosition);
  const lastColon = beforeCursor.lastIndexOf(":");

  if (lastColon === -1) {
    return null;
  }

  // Don't trigger if colon is preceded by another colon (already :emoji:)
  const beforeColon = text.slice(0, lastColon);
  const prevColon = beforeColon.lastIndexOf(":");
  if (prevColon !== -1 && !/\s/.test(text.slice(prevColon + 1, lastColon))) {
    return null;
  }

  // Only trigger if colon is at word boundary
  if (lastColon > 0 && !/\s/.test(text.at(lastColon - 1) ?? "")) {
    return null;
  }

  const textAfterColon = text.slice(lastColon + 1, cursorPosition);
  if (/\s/.test(textAfterColon)) {
    return null;
  }

  const textAfterCursor = text.slice(cursorPosition);
  const nextWhitespace = textAfterCursor.search(/[\s:]/);
  const endIndex =
    nextWhitespace === -1 ? text.length : cursorPosition + nextWhitespace;

  const fullMatch = text.slice(lastColon, endIndex);
  const shortcode = fullMatch.slice(1);

  return {
    fullMatch,
    shortcode,
    startIndex: lastColon,
    endIndex,
  };
}

export type PollCommandResult =
  | { ok: true; command: string; error: null }
  | { ok: false; command: null; error: string };

export function buildPollCommand(
  question: string,
  options: string[],
): PollCommandResult {
  if ([question, ...options].some((s) => /["|]/.test(s))) {
    return {
      ok: false,
      command: null,
      error:
        "Poll question and options cannot contain double quotes or pipe characters.",
    };
  }
  const quotedOptions = options.map((o) => `"${o}"`).join(" | ");
  return {
    ok: true,
    command: `/poll "${question}" | ${quotedOptions}`,
    error: null,
  };
}

export function replaceEmojiAtCursor(
  text: string,
  cursorPosition: number,
  emojiShortcode: string,
): { newText: string; newCursorPosition: number } {
  const emoji = getEmojiAtCursor(text, cursorPosition);

  if (!emoji) {
    return { newText: text, newCursorPosition: cursorPosition };
  }

  const before = text.slice(0, emoji.startIndex);
  const after = text.slice(emoji.endIndex);
  const newText = `${before}:${emojiShortcode}: ${after}`;
  const newCursorPosition = emoji.startIndex + emojiShortcode.length + 3;

  return { newText, newCursorPosition };
}
