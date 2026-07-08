// Reine Modell-Helfer fuer das Claim-Chat-Thread-Modell (Phase 2). Kein DB-I/O -> testbar.
// Konsumiert von thread-actions.ts (get-or-create + persist). Lokale Typen (das geteilte
// database.types.ts wird unter Nebenlaeufigkeit NICHT regeneriert — Cast-Pattern in den Actions).

export type ThreadArt = 'kunde_gruppe' | 'team_intern' | 'direkt'

/** Zuweisungs-Felder eines Claims, aus denen die Gruppen-Teilnehmer abgeleitet werden. */
export interface ClaimZuweisung {
  geschaedigter_user_id: string | null
  kundenbetreuer_id: string | null
  sv_id: string | null
}

export interface ThreadTeilnehmer {
  userId: string
  rolle: string
}

/** Deterministische Sortierung eines Direkt-Paars -> [direkt_user_a, direkt_user_b] (a <= b). */
export function sortiereDirektPaar(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a]
}

/**
 * Leitet die Teilnehmer eines Gruppen-Threads aus den Claim-Zuweisungen ab.
 * - kunde_gruppe: Kunde (geschaedigter_user_id) + Betreuer + Gutachter
 * - team_intern:  nur Betreuer + Gutachter (KEIN Kunde)
 * null-Zuweisungen werden uebersprungen; dieselbe Person mit zwei Rollen erscheint einmal
 * (erste Rolle gewinnt).
 */
export function leiteGruppenTeilnehmer(
  claim: ClaimZuweisung,
  art: 'kunde_gruppe' | 'team_intern',
): ThreadTeilnehmer[] {
  const kandidaten: ThreadTeilnehmer[] = []
  if (art === 'kunde_gruppe' && claim.geschaedigter_user_id) {
    kandidaten.push({ userId: claim.geschaedigter_user_id, rolle: 'kunde' })
  }
  if (claim.kundenbetreuer_id) kandidaten.push({ userId: claim.kundenbetreuer_id, rolle: 'kundenbetreuer' })
  if (claim.sv_id) kandidaten.push({ userId: claim.sv_id, rolle: 'sachverstaendiger' })

  const gesehen = new Set<string>()
  return kandidaten.filter((p) => {
    if (gesehen.has(p.userId)) return false
    gesehen.add(p.userId)
    return true
  })
}

const ROLLE_LABEL: Record<string, string> = {
  kunde: 'Kunde',
  kundenbetreuer: 'Betreuer',
  sachverstaendiger: 'Gutachter',
  werkstatt: 'Werkstatt',
  makler: 'Makler',
  admin: 'Admin',
  dispatch: 'Dispatch',
  teilnehmer: 'Teilnehmer',
}

/** Anzeige-Label eines Threads. Fuer direkt-Threads aus den Teilnehmer-Rollen zusammengesetzt. */
export function threadLabel(art: ThreadArt, rollen: string[] = []): string {
  if (art === 'kunde_gruppe') return 'Gruppe'
  if (art === 'team_intern') return 'Team-intern'
  const namen = rollen.map((r) => ROLLE_LABEL[r] ?? r)
  return namen.length ? `Privat: ${namen.join(' · ')}` : 'Privater Chat'
}

/** Anzeige-Label einer einzelnen Rolle (fuer den DM-Kandidaten-Picker). */
export function rolleLabel(rolle: string): string {
  return ROLLE_LABEL[rolle] ?? rolle
}

/** Claim-Felder fuer die DM-Kandidaten (alle zugewiesenen Beteiligten). */
export interface DmKandidatenClaim extends ClaimZuweisung {
  makler_id: string | null
}

/** DM-Kandidaten eines Claims: alle zugewiesenen Beteiligten AUSSER dem aktuellen User (non-null, dedup). */
export function leiteDmKandidaten(claim: DmKandidatenClaim, meId: string): ThreadTeilnehmer[] {
  const roh: { userId: string | null; rolle: string }[] = [
    { userId: claim.geschaedigter_user_id, rolle: 'kunde' },
    { userId: claim.kundenbetreuer_id, rolle: 'kundenbetreuer' },
    { userId: claim.sv_id, rolle: 'sachverstaendiger' },
    { userId: claim.makler_id, rolle: 'makler' },
  ]
  const gesehen = new Set<string>()
  const out: ThreadTeilnehmer[] = []
  for (const k of roh) {
    if (!k.userId || k.userId === meId || gesehen.has(k.userId)) continue
    gesehen.add(k.userId)
    out.push({ userId: k.userId, rolle: k.rolle })
  }
  return out
}

/** Membership eines Users in einem Thread (fuer die Unread-Aggregation). */
export interface UnreadMembership {
  threadId: string
  claimId: string
  zuletztGelesenAm: string | null
}

/** Nachricht-Minimal-Shape fuer die Unread-Aggregation. */
export interface UnreadNachricht {
  threadId: string
  createdAt: string
  senderId: string | null
}

/**
 * Zaehlt ungelesene Nachrichten pro Claim: fremde Nachrichten (senderId != meId),
 * die nach dem zuletzt_gelesen_am des Users im jeweiligen Thread liegen (null =
 * nie gelesen -> alle fremden zaehlen). Nachrichten ohne Membership werden ignoriert.
 */
export function aggregiereUnreadProClaim(
  memberships: UnreadMembership[],
  nachrichten: UnreadNachricht[],
  meId: string,
): Record<string, number> {
  const threadToClaim = new Map<string, string>()
  const threadGelesen = new Map<string, string | null>()
  for (const m of memberships) {
    threadToClaim.set(m.threadId, m.claimId)
    threadGelesen.set(m.threadId, m.zuletztGelesenAm)
  }
  const counts: Record<string, number> = {}
  for (const n of nachrichten) {
    const claimId = threadToClaim.get(n.threadId)
    if (!claimId) continue
    if (n.senderId === meId) continue
    const gelesen = threadGelesen.get(n.threadId)
    if (gelesen && n.createdAt <= gelesen) continue
    counts[claimId] = (counts[claimId] ?? 0) + 1
  }
  return counts
}
