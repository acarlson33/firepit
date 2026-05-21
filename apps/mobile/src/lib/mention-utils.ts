export interface MentionMatch {
  fullMatch: string;
  username: string;
  startIndex: number;
  endIndex: number;
}

const EVERYONE_MENTION_REGEX = /(?:^|\s)@all(?=$|\s|[.,!?;:])/i;

export const MENTION_REGEX = /@(\S+)/g;

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
  const beforeCursor = text.substring(0, cursorPosition);
  const lastAtSymbol = beforeCursor.lastIndexOf("@");

  if (lastAtSymbol === -1) {
    return null;
  }

  const textAfterAt = text.substring(lastAtSymbol + 1, cursorPosition);
  if (/\s/.test(textAfterAt)) {
    return null;
  }

  const textAfterCursor = text.substring(cursorPosition);
  const nextWhitespace = textAfterCursor.search(/\s/);
  const endIndex =
    nextWhitespace === -1 ? text.length : cursorPosition + nextWhitespace;

  const fullMatch = text.substring(lastAtSymbol, endIndex);
  const username = fullMatch.substring(1);

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

  const before = text.substring(0, mention.startIndex);
  const after = text.substring(mention.endIndex);
  const newText = `${before}@${newUsername} ${after}`;
  const newCursorPosition = mention.startIndex + newUsername.length + 2;

  return { newText, newCursorPosition };
}

export function hasEveryoneMention(text: string): boolean {
  return EVERYONE_MENTION_REGEX.test(text);
}
