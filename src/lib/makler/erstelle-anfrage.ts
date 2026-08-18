'use server'

// Makler legt proaktiv einen Kunden an. Entweder kanonischer FlowLink (Kunde macht
// den Gutachter-Finder im lead-gekeyten /flow/[token] selbst) ODER Rueckruf (Default).
// Attribution IMMER via leads.promotion_code_id = eigener Makler-Promo-Code -> bestehende
// Pipeline (convert-lead-to-claim -> claims.makler_id -> makler_provisionen). Service-role
// fuer Writes; Auth-Gate user-scoped via getCurrentMakler. Komponiert nur bestehende Infra.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentMakler } from '@/lib/makler/queries'
import { getOrCreateMaklerPromoCode } from '@/lib/makler/promo-code'
import { createLead, type LeadExtra } from '@/lib/leads/create-lead'
import { pickRoundRobinDispatcher } from '@/lib/start-link/pick-dispatcher'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { toE164 } from '@/lib/format/telefon'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { revalidatePath } from 'next/cache'

export type MaklerAnfrageAusgang = 'rueckruf' | 'flowlink'

export type MaklerAnfrageInput = {
  vorname: string
  nachname: string
  telefon: string
  email?: string | null
  /** Kennzeichen des Kundenfahrzeugs -> leads.kennzeichen (Convert clampt varchar(20)). */
  kennzeichen?: string | null
  standortPlz?: string | null
  standortOrt?: string | null
  /** Makler-Anfrage: Ort mit Koordinaten (Place-Picker) -> Besichtigungsort + Kunde-Flow-Prefill + SV-Matching. */
  standortLat?: number | null
  standortLng?: number | null
  standortPlaceId?: string | null
  /** Verschulden -> leads.schuldfrage. Entscheidet Haftpflicht/Kasko (der FlowLink haengt daran). */
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung' | null
  /** Kasko-Folgefrage bei Eigenverschulden -> leads.eigene_versicherung ('ja'/'nein'). Pflicht wenn
   *  schuldfrage='eigenverantwortung' (sonst disqualifiziert das Flow-Quali-Gate den Lead still). */
  eigeneVersicherung?: 'ja' | 'nein' | null
  /** Polizei vor Ort -> leads.polizei_vor_ort. */
  polizeiVorOrt?: boolean | null
  notiz?: string | null
  /** Makler bestaetigt, dass der Kunde mit der Kontaktaufnahme einverstanden ist (DSGVO-Basis). */
  kundeEinwilligung: boolean
  ausgang: MaklerAnfrageAusgang
  rueckrufStartZeit?: string | null
}

export type MaklerAnfrageResult =
  | { ok: true; leadId: string; ausgang: MaklerAnfrageAusgang; token?: string; terminId?: string; warnung?: string }
  | { ok: false; error: string }

// Telefon auf die kanonische E.164-Form normalisieren (Dedup ist formatierungs-
// tolerant). Delegiert an die EINE Quelle (format/telefon) statt inline zu duplizieren.
function normTel(t: string | null): string {
  return toE164(t) ?? ''
}

const TERMINALE_LEAD_STATUS = new Set(['umgewandelt', 'umgewandelt-sv', 'disqualifiziert', 'kalt'])

// Dedup: existiert fuer denselben Makler (promo) bereits eine OFFENE Anfrage mit dieser
// Nummer? -> Doppel-Lead vermeiden (Doppel-Submit / versehentliche Neu-Anlage). Terminale
// Leads (konvertiert/disqualifiziert/kalt) blocken NICHT (echter neuer Fall ist erlaubt).
async function findeOffenenDuplikat(
  admin: ReturnType<typeof createAdminClient>,
  promoId: string,
  telefon: string,
): Promise<string | null> {
  const norm = normTel(telefon)
  if (!norm) return null
  const { data } = await admin
    .from('leads')
    .select('id, telefon, status')
    .eq('promotion_code_id', promoId)
    .order('created_at', { ascending: false })
    .limit(50)
  for (const l of (data ?? []) as Array<{ id: string; telefon: string | null; status: string | null }>) {
    if (TERMINALE_LEAD_STATUS.has(l.status ?? '')) continue
    if (normTel(l.telefon) === norm) return l.id
  }
  return null
}

export async function erstelleMaklerAnfrage(input: MaklerAnfrageInput): Promise<MaklerAnfrageResult> {
  // 1. Auth-Gate: eingeloggter, aktiver Makler.
  const makler = await getCurrentMakler()
  if (!makler || makler.status !== 'aktiv') return { ok: false, error: 'Kein aktiver Makler-Zugang.' }
  if (!makler.user_id) return { ok: false, error: 'Makler ohne User-Account.' }
  const maklerFirma = makler.firma
  const maklerUserId = makler.user_id

  // 2. Einwilligung (DSGVO-Basis fuer die Kontaktaufnahme des Dritten — der Makler
  //    initiiert, der Kunde hat selbst nichts angeklickt).
  if (input.kundeEinwilligung !== true) {
    return { ok: false, error: 'Bitte die Einwilligung des Kunden zur Kontaktaufnahme bestätigen.' }
  }

  // 3. Validierung.
  const vorname = input.vorname?.trim() ?? ''
  const nachname = input.nachname?.trim() ?? ''
  const telefon = input.telefon?.trim() ?? ''
  const email = input.email?.trim() || null
  const standortPlz = input.standortPlz?.trim() || null
  const standortOrt = input.standortOrt?.trim() || null
  const standortLat = typeof input.standortLat === 'number' && Number.isFinite(input.standortLat) ? input.standortLat : null
  const standortLng = typeof input.standortLng === 'number' && Number.isFinite(input.standortLng) ? input.standortLng : null
  const standortPlaceId = input.standortPlaceId?.trim() || null
  // Koordinaten nur als Paar schreiben (Prefill + SV-Matching brauchen beide).
  const hatKoords = standortLat != null && standortLng != null
  const notiz = input.notiz?.trim() || null
  const kennzeichen = input.kennzeichen?.trim() || null
  const schuldfrage = input.schuldfrage ?? null
  const eigeneVersicherung = input.eigeneVersicherung ?? null
  const polizeiVorOrt = typeof input.polizeiVorOrt === 'boolean' ? input.polizeiVorOrt : null
  if (vorname.length < 1 || nachname.length < 1) return { ok: false, error: 'Vor- und Nachname erforderlich.' }
  if (telefon.length < 5) return { ok: false, error: 'Telefonnummer erforderlich.' }
  if (input.ausgang === 'flowlink' && !telefon && !email) {
    return { ok: false, error: 'Für den Link-Versand wird Telefon oder Email benötigt.' }
  }
  // Kasko/Haftpflicht-Qualifizierung (Trust-Boundary, spiegelt den Client-Guard): Eigenverschulden
  // OHNE VS-Antwort wuerde im Flow-Quali still disqualifizieren (qualiFlowOutcome -> Abbruch).
  if (schuldfrage === 'eigenverantwortung' && eigeneVersicherung == null) {
    return { ok: false, error: 'Bei Eigenverschulden bitte angeben, ob der Kunde kaskoversichert ist.' }
  }

  // Qualifikation + Besichtigungsort — an BEIDE Zweige. besichtigungsort_* speist die SV-/faelle-
  // Seite (1:1-Kopierliste -> Navigation/ICS/Reminder); fahrzeug_standort_* (unten, nur flowlink/
  // rueckruf-Basis) speist den Kunde-Flow-Prefill (FlowWizardKfz liest fahrzeug_standort_*). Beide
  // bewusst gesetzt — sonst bricht entweder der Prefill oder der Besichtigungsort bleibt null.
  const zusatzFelder: LeadExtra = {}
  if (kennzeichen) zusatzFelder.kennzeichen = kennzeichen
  if (schuldfrage) zusatzFelder.schuldfrage = schuldfrage
  if (eigeneVersicherung) zusatzFelder.eigene_versicherung = eigeneVersicherung
  if (polizeiVorOrt != null) zusatzFelder.polizei_vor_ort = polizeiVorOrt
  if (standortOrt) zusatzFelder.besichtigungsort_adresse = standortOrt
  if (hatKoords) { zusatzFelder.besichtigungsort_lat = standortLat; zusatzFelder.besichtigungsort_lng = standortLng }
  if (standortPlaceId) zusatzFelder.besichtigungsort_place_id = standortPlaceId

  const admin = createAdminClient()

  // 4. Attribution: eigener Promo-Code (get-or-create -> Attribution scheitert nie an
  //    fehlendem Code; Fremd-Attribution unmoeglich, weil aus makler.id abgeleitet).
  const promo = await getOrCreateMaklerPromoCode(admin, makler.id)
  if (!promo) return { ok: false, error: 'Promo-Code konnte nicht ermittelt/angelegt werden. Bitte Admin kontaktieren.' }

  // 4b. Dedup: schon eine offene Anfrage dieses Maklers mit dieser Nummer? -> kein Doppel-Lead.
  const duplikatId = await findeOffenenDuplikat(admin, promo.id, telefon)
  if (duplikatId) {
    return { ok: false, error: 'Für diese Telefonnummer haben Sie bereits eine offene Anfrage — sie steht in Ihrer Lead-Liste.' }
  }

  // 5. Dispatcher (Berater) — Round-Robin fuer BEIDE Zweige.
  const dispatcherId = await pickRoundRobinDispatcher(admin)

  // Einwilligungs-Nachweis als Timeline-Eintrag (Audit-Trail, kein Schema-Change).
  async function protokolliereEinwilligung(leadId: string) {
    try {
      await admin.from('timeline').insert({
        lead_id: leadId,
        fall_id: null,
        typ: 'system',
        titel: 'Einwilligung zur Kontaktaufnahme bestätigt',
        beschreibung: `Makler ${maklerFirma} hat bestätigt, dass der Kunde mit der Kontaktaufnahme durch Claimondo einverstanden ist.`,
        erstellt_von: maklerUserId,
      })
    } catch (err) {
      console.error('[erstelleMaklerAnfrage] Einwilligungs-Timeline:', err)
    }
  }

  // 6a. RUECKRUF (Default): bestehende Rueckruf-Infra (Lead status/phase='rueckruf' + admin_termine
  //     + Mitteilungen + Team-Notify + Kunde-WA), additiv um Promo/Standort/Notiz/Round-Robin erweitert.
  if (input.ausgang === 'rueckruf') {
    const res = await erstelleOeffentlichenRueckruf({
      name: `${vorname} ${nachname}`.trim(),
      telefon,
      email,
      startZeit: input.rueckrufStartZeit ?? null,
      nachricht: notiz,
      quelle: 'makler-anfrage-rueckruf',
      promotionCodeId: promo.id,
      standortPlz,
      standortOrt,
      standortLat,
      standortLng,
      standortPlaceId,
      notiz,
      serviceTyp: 'komplett',
      zugewiesenAn: dispatcherId,
    })
    if (!res.ok) return { ok: false, error: res.error }
    // Qualifikation + Besichtigungsort nachziehen (erstelleOeffentlichenRueckruf kennt diese Felder
    // nicht — geteilte Funktion bewusst schlank). Non-critical: der Rueckruf steht, ein Enrichment-
    // Fehler darf ihn nicht kippen (der Dispatcher qualifiziert sonst manuell nach).
    if (Object.keys(zusatzFelder).length > 0) {
      const { error: enrichErr } = await admin.from('leads').update(zusatzFelder).eq('id', res.leadId)
      if (enrichErr) console.error('[erstelleMaklerAnfrage] Rueckruf-Enrichment:', enrichErr.message)
    }
    await protokolliereEinwilligung(res.leadId)
    revalidatePath('/makler/leads')
    return { ok: true, leadId: res.leadId, ausgang: 'rueckruf', terminId: res.terminId }
  }

  // 6b. FLOWLINK: kanonische Lead-Anlage (status='neu'/phase='erstkontakt') + kanonischer Sender.
  const created = await createLead(
    admin,
    { source_channel: 'makler-anfrage-flowlink', status: 'neu', vorname, nachname, telefon, email },
    {
      promotion_code_id: promo.id,
      service_typ: 'komplett',
      qualifizierungs_phase: 'erstkontakt',
      zugewiesen_an: dispatcherId,
      sprache: await getLocaleCookie(),
      ...(notiz ? { notiz } : {}),
      // fahrzeug_standort_* speist den Kunde-Flow-Prefill (FlowWizardKfz); besichtigungsort_*
      // (in zusatzFelder) speist die SV-/faelle-Seite. Beide bewusst gesetzt.
      ...(standortPlz ? { fahrzeug_standort_plz: standortPlz } : {}),
      ...(standortOrt ? { fahrzeug_standort_adresse: standortOrt } : {}),
      ...(hatKoords ? { fahrzeug_standort_lat: standortLat, fahrzeug_standort_lng: standortLng } : {}),
      ...(standortPlaceId ? { fahrzeug_standort_place_id: standortPlaceId } : {}),
      ...zusatzFelder,
    },
  )
  if (!created.ok) return { ok: false, error: created.error }
  const leadId = created.leadId
  await protokolliereEinwilligung(leadId)

  // Versand-Kaskade WhatsApp -> SMS -> Email mit Makler-Vermittlungs-Kontext im Text
  // (Vertrauen/Conversion). Der Core mintet den Token UND setzt selbst flow-gesendet/flow-versendet.
  const introText = `Ihr Versicherungsmakler ${maklerFirma} hat Sie an Claimondo vermittelt.`
  let sent: { success: boolean; error?: string; token?: string } = { success: false }
  if (telefon) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'whatsapp', maklerUserId, null, introText)
  if (!sent.success && telefon) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'sms', maklerUserId, null, introText)
  if (!sent.success && email) sent = await sendFlowLinkMultiChannelCore(admin, leadId, 'email', maklerUserId, null, introText)

  // Team-Notify (non-critical) inkl. Makler-Notiz.
  try {
    await notifyNewLead({
      leadId,
      source: 'Makler-Anfrage',
      name: `${vorname} ${nachname}`.trim(),
      phone: telefon,
      email,
      extraFields: [
        { label: 'Makler', value: maklerFirma },
        ...(notiz ? [{ label: 'Makler-Notiz', value: notiz }] : []),
      ],
    })
  } catch (err) {
    console.error('[erstelleMaklerAnfrage] notifyNewLead:', err)
  }

  revalidatePath('/makler/leads')

  if (!sent.success) {
    // Zustell-Fehlschlag: Lead auf Rückruf herabstufen, damit das Team den Kunden AKTIV
    // anruft (statt nur passiver Mitteilung) — admin_termine + Status + Dispatcher-Mitteilung.
    const start = new Date(Date.now() + 5 * 60_000).toISOString()
    const ende = new Date(Date.now() + 35 * 60_000).toISOString()
    try {
      await admin.from('admin_termine').insert({
        typ: 'rueckruf',
        titel: `Rückruf (Link nicht zustellbar): ${vorname} ${nachname}`.trim(),
        beschreibung: `Makler-Anfrage (${maklerFirma}) — FlowLink-Versand fehlgeschlagen, Kunde bitte anrufen.${notiz ? `\nNotiz: ${notiz}` : ''}`,
        start_zeit: start,
        end_zeit: ende,
        status: 'offen',
        lead_id: leadId,
        erstellt_von: dispatcherId ?? maklerUserId,
        erinnerung_min_vorher: 10,
      })
      // Das try faengt den Write nicht. Ohne ihn steht der Lead nicht auf 'rueckruf'
      // und taucht in der Rueckruf-Liste nicht auf — obwohl der Termin angelegt ist.
      const { error: rueckrufFehler } = await admin
        .from('leads')
        .update({ status: 'rueckruf', qualifizierungs_phase: 'rueckruf', updated_at: new Date().toISOString() })
        .eq('id', leadId)
      if (rueckrufFehler) {
        console.error(`[erstelleMaklerAnfrage] Rueckruf-Status nicht gesetzt (Lead ${leadId}):`, rueckrufFehler.message)
      }
    } catch (err) {
      console.error('[erstelleMaklerAnfrage] Send-Fail Auto-Rückruf:', err)
    }
    try {
      if (dispatcherId) {
        await admin.from('mitteilungen').insert({
          empfaenger_id: dispatcherId,
          empfaenger_rolle: 'dispatch',
          kategorie: 'anruf',
          titel: 'Makler-Anfrage: Link nicht zustellbar — als Rückruf eingeplant',
          inhalt: `${vorname} ${nachname} (${telefon}) — bitte anrufen.`,
          prioritaet: 'hoch',
          icon: '⚠️',
          route_url: `/dispatch/leads/${leadId}`,
        })
      }
    } catch (err) {
      console.error('[erstelleMaklerAnfrage] Send-Fail-Mitteilung:', err)
    }
    return {
      ok: true,
      leadId,
      ausgang: 'flowlink',
      warnung: 'Link konnte nicht zugestellt werden — als Rückruf eingeplant, das Team ruft den Kunden an.',
    }
  }
  return { ok: true, leadId, ausgang: 'flowlink', token: sent.token }
}
