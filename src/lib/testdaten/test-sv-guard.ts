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
  if (!leadId) return { email: null, name: null }
  const { data: lead } = await db.from('leads').select('email, vorname, nachname').eq('id', leadId).maybeSingle()
  if (!lead) return { email: null, name: null }
  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null
  return { email: (lead.email as string | null) ?? null, name }
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
    const [svRes, identitaet] = await Promise.all([
      db.from('sachverstaendige').select('ist_testaccount').eq('id', svId).maybeSingle(),
      ladeIdentitaet(db, bezug),
    ])
    const svIstTest = (svRes.data?.ist_testaccount as boolean | null) === true
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
