import 'server-only'

// Leitungstyp einer Rufnummer per Twilio Lookup v2 (Feld `line_type_intelligence`).
//
// ⚠ WAS DAS NICHT KANN — gemessen am 21.09.2026 gegen prod, bevor hier etwas gebaut wurde:
// Twilio erkennt NICHT, ob eine deutsche Mobilnummer tatsaechlich vergeben ist. Die Nummer
// +491607481923 (laut Aaron nicht vergeben) kam als `valid: true`, `type: mobile`,
// Carrier "DTAG (T-Mobile)" zurueck; auch das Feld `line_status` meldete `reachable`.
// Deutsche Netze beantworten die HLR-Abfrage generisch. Ein Phantom-Filter auf dieser Basis
// waere ein Versprechen ohne Deckung. Die verlaessliche Pruefung bleibt der SMS-Code.
//
// WOFUER ES HIER STEHT: die KANAL-WEICHE. 'landline' heisst, dass WhatsApp und SMS
// aussichtslos sind — dann ist die E-Mail die einzige Rueckfallebene, und der KI-Assistent
// soll das erfahren, BEVOR ein Lead ohne jeden Kanal entsteht (Soll-Blatt 1c Schritt 2).
//
// Kosten: ~0,008 USD je Abfrage (Formatpruefung allein waere gratis). Bei ~21 MCP-Leads je
// 30 Tage vernachlaessigbar.

/** 'unbekannt' = Lookup nicht moeglich (kein Zugang, Timeout, Fehler, unplausible Nummer). */
export type TelefonTyp = 'mobile' | 'landline' | 'voip' | 'unbekannt'

export type TelefonPruefung = {
  typ: TelefonTyp
  /** true = Twilio haelt das Format fuer gueltig. Sagt NICHTS ueber "vergeben". */
  formatGueltig: boolean
  /** Netzbetreiber laut Twilio, rein informativ fuer Dispatch. */
  carrier: string | null
}

const UNBEKANNT: TelefonPruefung = { typ: 'unbekannt', formatGueltig: false, carrier: null }
const TIMEOUT_MS = 3000

/** Twilios Typen auf unser Vokabular (= der CHECK auf leads.telefon_typ) abbilden. */
function normalisiere(roh: string | null | undefined): TelefonTyp {
  const t = (roh ?? '').toLowerCase()
  if (t === 'mobile') return 'mobile'
  if (t === 'landline' || t === 'fixedvoip') return 'landline'
  if (t === 'voip' || t === 'nonfixedvoip' || t === 'personal') return 'voip'
  return 'unbekannt'
}

/**
 * Fragt den Leitungstyp ab. **Fail-open**: jeder Fehler liefert 'unbekannt' — eine
 * Nummernpruefung darf niemals einen Lead kosten (Soll-Blatt Kriterium 5).
 */
export async function pruefeTelefonTyp(telefonE164: string): Promise<TelefonPruefung> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token || !telefonE164.startsWith('+')) return UNBEKANNT

  const steuerung = new AbortController()
  const wecker = setTimeout(() => steuerung.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(telefonE164)}?Fields=line_type_intelligence`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
        signal: steuerung.signal,
      },
    )
    if (!res.ok) {
      console.warn('[telefon-lookup] HTTP', res.status, 'fuer', telefonE164.slice(0, 6) + '…')
      return UNBEKANNT
    }
    const daten = (await res.json()) as {
      valid?: boolean
      line_type_intelligence?: { type?: string | null; carrier_name?: string | null } | null
    }
    const lti = daten.line_type_intelligence ?? null
    return {
      typ: normalisiere(lti?.type),
      formatGueltig: daten.valid === true,
      carrier: lti?.carrier_name ?? null,
    }
  } catch (err) {
    // AbortError (Timeout) und Netzfehler landen hier — bewusst still, der Lead laeuft weiter.
    console.warn('[telefon-lookup] fehlgeschlagen:', err instanceof Error ? err.message : String(err))
    return UNBEKANNT
  } finally {
    clearTimeout(wecker)
  }
}

/**
 * Trägt eine Nummer dieses Typs WhatsApp/SMS? Bei 'landline' nicht — dann ist die E-Mail die
 * einzige Rückfallebene. 'unbekannt' gilt bewusst als tragfähig (fail-open).
 */
export function kannKurznachrichtEmpfangen(typ: TelefonTyp): boolean {
  return typ !== 'landline'
}
