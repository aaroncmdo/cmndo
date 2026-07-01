// Anti-Spam-Helfer fuer Community-Kommentare. Pure Logik (Tests: spam.test.ts).

const LINK_RE = /(https?:\/\/|www\.)/i

/** true, wenn der Text einen expliziten Link (http/https/www) enthaelt. */
export function containsLink(text: string): boolean {
  return LINK_RE.test(text)
}
