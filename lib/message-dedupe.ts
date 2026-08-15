export const DEDUPE_WINDOW_MS = 10_000

/** Makes small formatting differences irrelevant for cross-channel deduplication. */
export function normalizeChatMessage(message: string): string {
  return message
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLocaleLowerCase('hu-HU')
    .replace(/[.,!?;:()[\]{}"'`…_—–\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Repeat detection keeps command punctuation meaningful: `isigur` differs from `!isigur`. */
export function normalizeRepeatedMessage(message: string): string {
  return message
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
