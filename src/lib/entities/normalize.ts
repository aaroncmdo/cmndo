// CMM Entity Resolver-Foundation: kanonischer Dedup-Key fuer Org-/Namens-Resolver.
// EINE Quelle, damit "HUK-Coburg" / "HUK Coburg" / "huk  coburg" denselben Key ergeben
// (aber "HUK" allein NICHT). BEWUSST kein Rechtsform-Suffix-Stripping (GmbH/AG) — das
// wuerde verschiedene Firmen ueber-mergen. ⚠️ Das SQL-Backfill in der Migration MUSS
// bit-identisch normalisieren, sonst verfehlt find-or-create bestehende Rows.

/** lowercase · Separatoren (._/-,) -> Space · Whitespace kollabiert · trim. Leer -> null. */
export function normalizeName(input: string | null | undefined): string | null {
  if (input == null) return null
  const s = String(input)
    .toLowerCase()
    .replace(/[._/\-,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > 0 ? s : null
}
