import { zuE164 } from '../anreicherung/telefon-e164'
import type { Db } from '../anreicherung/schreiben'
import { ladeCheck, type Check } from './check'
import { findeOderLegeAn } from './lead'
import { nameAusQuelle } from './dubletten'

/**
 * Der Wortlaut, dem zugestimmt wird — er wird MITGESPEICHERT.
 *
 * Ein Nachweis „hat eingewilligt" ohne den Text belegt nur DASS, nicht WORIN.
 * Aendert sich die Formulierung spaeter, bleibt an jedem Altvorgang die
 * Fassung stehen, die dort galt.
 */
export const EINWILLIGUNG_TEXT =
  'Ich bin damit einverstanden, dass Claimondo mich unter der angegebenen Nummer zu diesem ' +
  'Termin und zu meiner Auswertung kontaktiert. Die Einwilligung kann ich jederzeit widerrufen.'

export const CONSENT_ZWECKE = ['sv_levelup_beratung', 'telefon_kontakt']
export const POLICY_VERSION = 'sv-levelup-1'

export type TerminEingabe = {
  token: string
  slotStart: string
  telefon: string
  einwilligung: boolean
  ipHash: string
  userAgent?: string
}

export type TerminErgebnis =
  | { ok: true; terminId: string; leadId: string }
  | { ok: false; error: string }

/**
 * F-06 · Termin waehlen — hier entsteht der Lead.
 *
 * Die Reihenfolge ist Teil der Zusage und steht so in CONTRACT F-06:
 *
 *   1. Einwilligung pruefen — VOR jedem Schreibzugriff. Ein Lead, der entsteht
 *      und dann zurueckgerollt werden muesste, ist bereits ein
 *      Datenschutzvorgang.
 *   2. Consent-Nachweis
 *   3. Dublettenpruefung, dann Lead verknuepfen oder anlegen
 *   4. Rueckverweise an Check und Lead
 *   5. Termin
 *   6. Aufgabe fuer den Vertrieb
 *   7. Ereignis
 *
 * ⚠ Schritt 6 ist eine `tasks`-Zeile, KEIN `notification_events`. Der dortige
 * Emitter ist claim-gekeyt (`resolveClaimId`, im Fan-out
 * `loadClaimParticipants`) — ein Vertriebstermin hat keinen Schadenfall. Das
 * Ereignis wuerde geschrieben und nie verteilt: ein toter Alarm, schlechter
 * als keiner. Design-Spec §5.2.
 *
 * ⚠ Die Telefonnummer erscheint in KEINER Log- und keiner Fehlermeldung.
 */
export async function waehleTermin(db: Db, e: TerminEingabe): Promise<TerminErgebnis> {
  // 1 · Ohne Einwilligung kein Lead — und keine Zeile irgendwo.
  if (e.einwilligung !== true) return { ok: false, error: 'einwilligung_fehlt' }

  const telefon = zuE164(e.telefon)
  if (!telefon) return { ok: false, error: 'telefon_ungueltig' }

  if (Date.parse(e.slotStart) <= Date.now()) return { ok: false, error: 'slot_vergangen' }

  const check = await ladeCheck(db, e.token)
  if (!check) return { ok: false, error: 'unbekannt' }
  if (check.status !== 'fertig') return { ok: false, error: 'nicht_fertig' }

  const jetzt = new Date().toISOString()

  // 2 · Consent-Nachweis nach dem Hausmuster (categories als Zweck-Array).
  const { error: consentFehler } = await db.from('consent_records').insert({
    categories: CONSENT_ZWECKE,
    policy_version: POLICY_VERSION,
    user_agent: e.userAgent ?? null,
    created_at: jetzt,
  })
  if (consentFehler) {
    return { ok: false, error: `Einwilligung nicht dokumentierbar: ${consentFehler.message}` }
  }

  // 3 · Lead — beim zweiten Aufruf bleibt es beim bestehenden.
  const bestehenderLead = check.sv_lead_id
  let leadId = bestehenderLead

  if (!leadId) {
    const lead = await findeOderLegeAn(db, {
      firma: check.firmenname,
      plz: check.standort_plz,
      ort: check.standort_ort,
      lat: check.standort_lat ?? 0,
      lng: check.standort_lng ?? 0,
      telefon,
      websiteUrl: check.website_url,
    })
    if (!lead.ok) return { ok: false, error: lead.error }
    leadId = lead.leadId

    // 4 · Rueckverweise in beide Richtungen.
    const { error: checkFehler } = await db
      .from('levelup_checks')
      .update({ sv_lead_id: leadId })
      .eq('token', e.token)
      .select()
    if (checkFehler) return { ok: false, error: `Verknuepfung fehlgeschlagen: ${checkFehler.message}` }

    const { error: leadFehler } = await db
      .from('sv_leads')
      .update({
        levelup_letzter_check_id: check.id,
        levelup_letzter_score: check.score,
      })
      .eq('id', leadId)
      .select()
    if (leadFehler) console.error('Denormalisierung am Lead fehlgeschlagen:', leadFehler.message)
  }

  // 5 · Termin — zweiter Aufruf verschiebt, statt zu duplizieren.
  const { data: vorhanden } = await db
    .from('levelup_termine')
    .select('id')
    .eq('check_id', check.id)
    .maybeSingle()

  let terminId: string
  if (vorhanden) {
    terminId = (vorhanden as { id: string }).id
    const { error } = await db
      .from('levelup_termine')
      .update({ slot_start: e.slotStart, telefon, status: 'gewuenscht' })
      .eq('id', terminId)
      .select()
    if (error) return { ok: false, error: 'Termin nicht aenderbar.' }
  } else {
    const { data, error } = await db
      .from('levelup_termine')
      .insert({
        check_id: check.id,
        slot_start: e.slotStart,
        telefon,
        status: 'gewuenscht',
        einwilligung_am: jetzt,
        einwilligung_ip_hash: e.ipHash,
        einwilligung_text: EINWILLIGUNG_TEXT,
      })
      .select()
      .single()

    if (error || !data) {
      // ⚠ Ohne die Nummer im Text — sie darf in keinem Log auftauchen.
      console.error('Termin nicht anlegbar:', error?.message ?? 'kein Ergebnis')
      return { ok: false, error: 'Der Termin konnte nicht gespeichert werden.' }
    }
    terminId = (data as { id: string }).id

    // 6 · Aufgabe fuer den Vertrieb.
    await spiegeleAlsAufgabe(db, check, e.slotStart)
  }

  // 7 · Ereignis. Nicht kritisch — ein fehlendes Protokoll darf den Termin
  // nicht verhindern.
  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'termin_gewaehlt',
    payload: { slotStart: e.slotStart, leadNeu: !bestehenderLead },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return { ok: true, terminId, leadId: leadId as string }
}

/**
 * Der Vertrieb sieht den Lead als Aufgabe — dasselbe Muster wie
 * `sv_basic_claim_review`, damit niemand etwas Neues lernen muss.
 *
 * ⚠ `lead_id` bleibt ungesetzt: die Spalte zeigt auf `public.leads`, und das
 * sind Schadenfaelle von Endkunden. Der Bezug laeuft ueber
 * `entity_type`/`entity_id`.
 */
async function spiegeleAlsAufgabe(db: Db, check: Check, slotStart: string): Promise<void> {
  const firma = check.firmenname ?? nameAusQuelle(null, check.website_url, check.standort_ort)
  const wann = new Date(slotStart).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short',
  })
  const bewertung = check.kein_score ? 'Teilbefund' : `Score ${check.score}`

  const { error } = await db.from('tasks').insert({
    typ: 'levelup_lead',
    titel: `SV-LevelUp: ${firma} (${check.standort_ort ?? 'ohne Ort'})`,
    beschreibung: `${bewertung} · Terminwunsch ${wann}\nCheck: /check/${check.token}`,
    empfaenger_rolle: 'admin',
    entity_type: 'levelup_check',
    entity_id: check.id,
    prioritaet: 'hoch',
    faellig_am: slotStart,
    auto_erstellt: true,
  })

  // Nicht kritisch: der Termin steht auch ohne Aufgabe. Aber es MUSS auffallen,
  // sonst sieht der Vertrieb den Lead nie.
  if (error) console.error('Vertriebs-Aufgabe nicht angelegt:', error.message)
}
