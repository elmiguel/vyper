/**
 * Pick which behaviour script to surface when an entity is selected, so the user lands on a script
 * without navigating Inspector → Scripts → click. Prefers the entity's last-used script (if it's
 * still attached), otherwise its first attached script. Returns `null` when the entity has no valid
 * scripts — the caller then leaves the current active script untouched (don't blank the editor).
 *
 * Pure + dependency-free so it can be unit-tested and reused by the store's `select` action.
 */
export function pickEntityScript(
  scriptIds: string[] | undefined,
  validScriptIds: ReadonlySet<string>,
  lastUsed: string | undefined,
): string | null {
  if (!scriptIds || scriptIds.length === 0) return null;
  const valid = scriptIds.filter((id) => validScriptIds.has(id));
  if (valid.length === 0) return null;
  if (lastUsed && valid.includes(lastUsed)) return lastUsed;
  return valid[0];
}
