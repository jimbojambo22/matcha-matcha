/**
 * Opaque unique ids for games and profiles.
 *
 * crypto.randomUUID needs a secure context, which the dev server and GitHub
 * Pages both provide — but an embedded webview or a plain-http LAN preview
 * may not, so there is a fallback. Ids are opaque strings: nothing should
 * ever parse one.
 */
export function newId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    // fall through
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
