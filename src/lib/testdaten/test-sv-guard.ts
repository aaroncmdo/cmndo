import type { SupabaseClient } from '@supabase/supabase-js'
import { istInterneIdentitaet, istInterneEmail, letzte9Ziffern } from './interne-identitaet'

// Test-SV-Guard: verhindert an genau EINEM Buchungs-Chokepoint (reserviere()), dass
//   - ein interner/Test-Lead einen ECHTEN Sachverstaendigen bucht (der gemeldete Vorfall), und
//   - ein echter Kunde einen TEST-SV bucht (das umgekehrte Leck).
// Test<->Test und Echt<->Echt laufen unveraendert durch. Fail-open: jeder Lookup-Fehler
// laesst die Buchung durch — der Guard darf NIE eine legitime Buchung brechen.

export type BezugRef = { typ: 'claim' | 'fall' | 'lead'; id: string }
export type TestSvGuardResult = { blockieren: boolean; grund?: string }

/**
 * Reine Konsistenz-Matrix: nur die beiden MISCHungen werden blockiert.
 * (leadIstIntern, svIstTest) -> blockieren?
 *   (true,  false) intern -> echt  = BLOCK  (der Vorfall)
 *   (false, true)  echt   -> Test  = BLOCK  (umgekehrtes Leck)
 *   (true,  true)  intern -> Test  = ok     (Smokes)
 *   (false, false) echt   -> echt  = ok     (Normalbetrieb)
 */
export function entscheideTestSvGuard(leadIstIntern: boolean, svIstTest: boolean): TestSvGuardResult {
  if (leadIstIntern && !svIstTest) {
    return { blockieren: true, grund: 'Test-Guard: interner/Test-Lead darf keinen echten Sachverstaendigen buchen.' }
  }
  if (!leadIstIntern && svIstTest) {
    return { blockieren: true, grund: 'Test-Guard: echter Kunde darf keinen Test-Sachverstaendigen buchen.' }
  }
  return { blockieren: false }
}

/**
 * AAR-956 17.07. (Attestation-Follow-up 3): Angebots-Spiegel der Matrix fuer den
 * FIXER-Pfad (SV-Embed, planeTerminOeffentlich fixerSvId). Der globale Pool filtert
 * Test-SVs laengst (applyDispatchableFilter/ist_testaccount=false, auch Finder-Karte
 * + LP seit #3438) — nur das Embed eines TEST-SVs bot bisher JEDEM Besucher Slots an;
 * ein echter Kunde lief dann an der Buchung in den Guard (degradierte UX).
 *
 * Regel: ein Test-SV wird nur INTERNEN Identitaeten (istInterneIdentitaet) angeboten —
 * genau denen, die ihn per Matrix auch buchen duerfen (Smoke-Strecken bleiben voll
 * funktionsfaehig). Unbekannte Identitaet = fail-closed Richtung Kundenschutz.
 * Echte SVs sind hier NIE blockiert (die intern→echt-Sperre bleibt Sache des
 * Buchungs-Chokepoints — ein interner Betrachter DARF echte Profile sehen).
 */
export function istTestSvAngebotBlockiert(
  svIstTest: boolean,
  identitaet?: { email?: string | null; name?: string | null } | null,
): boolean {
  if (!svIstTest) return false
  const intern = istInterneIdentitaet(identitaet?.email ?? null, identitaet?.name ?? null)
  return entscheideTestSvGuard(intern, true).blockieren
}

/** Loest die Kunden-Email/Name hinter einem bezug (lead direkt, claim/fall ueber lead_id) auf. */
async function ladeIdentitaet(
  db: SupabaseClient,
  bezug: BezugRef,
): Promise<{ email: string | null; name: string | null }> {
  let leadId: string | null = null
  if (bezug.typ === 'lead') {
    leadId = bezug.id
  } else {
    // claim | fall -> ueber claims.lead_id (post-CMM-49: fall_id == claim_id im Regelfall)
    const { data } = await db.from('claims').select('lead_id').eq('id', bezug.id).maybeSingle()
    leadId = (data?.lead_id as string | null) ?? null
  }
  if (leadId) {
    const { data: lead } = await db.from('leads').select('email, vorname, nachname').eq('id', leadId).maybeSingle()
    if (lead) {
      const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null
      return { email: (lead.email as string | null) ?? null, name }
    }
  }
  // Fallback ueber claim_parties (11.08.): die lead_id-only-Aufloesung war bei 30/79 Claims (38 %)
  // blind — der Guard sah dort weder Email noch Name und lief fail-open durch. 26 dieser 30 sind
  // ueber den Geschaedigten der claim_parties aufloesbar (user_id -> profiles ODER person_id ->
  // personen, je nach Gast/Account). Belegt an CLM-2026-01011: Smoke-Claim (lead_id NULL) klebte
  // 13 Tage im Portal eines ECHTEN Partner-SV, ohne dass der Guard etwas sehen konnte.
  if (bezug.typ === 'lead') return { email: null, name: null }
  const { data: party } = await db
    .from('claim_parties')
    .select('user_id, person_id')
    .eq('claim_id', bezug.id)
    .eq('rolle', 'geschaedigter')
    .eq('ist_aktiv', true)
    .order('reihenfolge')
    .limit(1)
    .maybeSingle()
  if (!party) return { email: null, name: null }
  const alsIdentitaet = (r: { email?: unknown; vorname?: unknown; nachname?: unknown } | null) =>
    r ? { email: (r.email as string | null) ?? null, name: [r.vorname, r.nachname].filter(Boolean).join(' ') || null } : null
  if (party.user_id) {
    const { data: prof } = await db.from('profiles').select('email, vorname, nachname').eq('id', party.user_id).maybeSingle()
    const ident = alsIdentitaet(prof)
    if (ident && (ident.email || ident.name)) return ident
  }
  if (party.person_id) {
    const { data: pers } = await db.from('personen').select('email, vorname, nachname').eq('id', party.person_id).maybeSingle()
    const ident = alsIdentitaet(pers)
    if (ident && (ident.email || ident.name)) return ident
  }
  return { email: null, name: null }
}

/**
 * Prueft, ob die Buchung des SV `svId` fuer den `bezug` (Lead/Claim/Fall) test-konsistent ist.
 * Kein bezug -> nie blockieren. Lookup-Fehler -> fail-open (nie blockieren).
 */
export async function pruefeTestSvKonsistenz(
  db: SupabaseClient,
  svId: string,
  bezug: BezugRef | null | undefined,
): Promise<TestSvGuardResult> {
  if (!bezug) return { blockieren: false }
  try {
    const [svRes, fixtureRes, identitaet] = await Promise.all([
      db.from('sachverstaendige').select('ist_testaccount').eq('id', svId).maybeSingle(),
      // E2E-Wegwerf-Fixture (Mig 20260812152026): ein SV, der fuers MATCHING echt sein MUSS
      // (ist_testaccount=false, sonst filtert ihn applyDispatchableFilter raus), fuer den
      // Guard aber als Test zaehlt. Ohne das war der Finder-Buchungspfad auf prod gar nicht
      // smokebar: interner Bucher + echter SV = BLOCK, und beide Seiten sind im Test nicht
      // frei waehlbar. Die Tabelle ist nur fuer service_role beschreibbar — das Signal liegt
      // also NICHT im Schreibbereich des SV, den es klassifiziert.
      db.from('e2e_test_fixtures').select('sv_id').eq('sv_id', svId).maybeSingle(),
      ladeIdentitaet(db, bezug),
    ])
    const svIstTest =
      (svRes.data?.ist_testaccount as boolean | null) === true || fixtureRes.data != null
    const leadIstIntern = istInterneIdentitaet(identitaet.email, identitaet.name)
    return entscheideTestSvGuard(leadIstIntern, svIstTest)
  } catch (err) {
    console.warn('[test-sv-guard] Identitaets-Lookup fehlgeschlagen, lasse Buchung durch:', err)
    return { blockieren: false }
  }
}

/**
 * Reverse-Lookup Telefon -> interne/Test-Identitaet: sucht leads + profiles per Telefon
 * (letzte 9 Ziffern, 9-stelliger Match -> Kollision vernachlaessigbar) und prueft, ob eine
 * davon eine interne Email hat. Fuer den Send-Client-Guard (sendWhatsApp), wo nur ein Telefon
 * vorliegt. Fail-open: Lookup-Fehler ODER zu kurze Nummer -> false (senden, nie faelschlich
 * eine echte Kundennachricht unterdruecken).
 */
export async function istInternesTelefon(telefonE164: string, db?: SupabaseClient): Promise<boolean> {
  try {
    const digits = letzte9Ziffern(telefonE164)
    if (!digits) return false
    // Client-Erzeugung INNERHALB des try — ein createAdminClient-Fehler (z.B. fehlende Env
    // im Test) darf den Send nie brechen (fail-open).
    const client: SupabaseClient = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
    const [profRes, leadRes] = await Promise.all([
      client.from('profiles').select('email, telefon').ilike('telefon', `%${digits}%`),
      client.from('leads').select('email, telefon').ilike('telefon', `%${digits}%`),
    ])
    const kandidaten = [...(profRes.data ?? []), ...(leadRes.data ?? [])]
    return kandidaten.some((k) => istInterneEmail((k as { email?: string | null }).email))
  } catch (err) {
    console.warn('[send-isolation] istInternesTelefon Lookup-Fehler, lasse Send durch:', err)
    return false
  }
}
