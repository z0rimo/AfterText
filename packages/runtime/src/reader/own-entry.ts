/**
 * Reads `record[key]` only when `key` is an own property. Reader Memory is
 * keyed by author-supplied ids, so an id such as `constructor` or `toString`
 * must not resolve to something inherited from `Object.prototype` and look
 * like an existing entry. Internal — not part of the public barrel.
 */
export function ownEntry<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
