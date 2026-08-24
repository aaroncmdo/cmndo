'use server'

// P4 (Netzwerk): SV-Selbstanlage "Partner-Werkstatt vermitteln" (Spec 3 §3 Schritte 1-3).
// Der Gutachter legt mit fertigem Gutachten einen eigenen Vorgang an: Lead ->
// Sofort-Claim ('gutachten-eingegangen', un-onboardet, Direkt-INSERT via
// gutachtenBereitsErstellt) -> Gutachten-Attach OHNE Transition -> FlowLink an den
// Kunden. Alle Regulierungs-/Billing-/QC-Effekte bleiben aufgeschoben, bis der Kunde
// die SA signiert (sign-into-existing, P4 T6) — Invariante: der Status spiegelt das
// Gutachten, die Gates spiegeln den Kunden.

import { createClient } from '@/lib/supabase/server'
import { notifyTeamNeuerLead } from '@/lib/leads/notify-team-lead'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getGutachterForUser } from '@/lib/gutachter'
import { createLead } from '@/lib/leads/create-lead'
import { attachGutachtenOhneTransition } from '@/lib/gutachter/attach-gutachten-ohne-transition'

export type VermittlePartnerWerkstattResult =
  | { ok: true; fallId: string; flowLinkUrl: string }
  | { ok: false; error: string }

export async function vermittlePartnerWerkstatt(formData: FormData): Promise<VermittlePartnerWerkstattResult> {
  // 1. Auth: nur ein Sachverstaendigen-Profil darf den Flow starten.
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein Sachverständigen-Profil gefunden' }

  // 2. FormData validieren (deutsche Meldungen, echte Umlaute).
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  const vorname = str('vorname')
  const nachname = str('nachname')
  const telefon = str('telefon')
  const email = str('email')
  const kennzeichen = str('kennzeichen')
  const unfallort = str('unfallort')
  const fahrzeugHersteller = str('fahrzeug_hersteller')
  const fahrzeugModell = str('fahrzeug_modell')
  const schadenHergang = str('schadens_hergang')
  const betrag = Number(str('betrag').replace(',', '.'))
  const datei = formData.get('datei')

  if (!vorname || !nachname) return { ok: false, error: 'Bitte Vor- und Nachnamen des Kunden angeben.' }
  if (!telefon && !email) return { ok: false, error: 'Bitte Telefonnummer oder E-Mail-Adresse des Kunden angeben.' }
  if (!kennzeichen) return { ok: false, error: 'Bitte das Kennzeichen angeben.' }
  if (!(datei instanceof File) || datei.size === 0 || datei.type !== 'application/pdf') {
    return { ok: false, error: 'Bitte das fertige Gutachten als PDF hochladen.' }
  }
  if (!Number.isFinite(betrag) || betrag <= 0) {
    return { ok: false, error: 'Bitte eine gültige Schadenshöhe (netto) angeben.' }
  }

  const admin = createAdminClient()

  // 3. Lead anlegen (kanonischer Intake-Baustein; qualifizierungs_phase 'konvertiert' ist
  //    CHECK-gueltig, live verifiziert 30.07.).
  const leadRes = await createLead(
    admin,
    {
      source_channel: 'gutachter-vermittlung',
      status: 'neu',
      vorname,
      nachname,
      telefon: telefon || null,
      email: email || null,
    },
    {
      abrechnungsweg: 'haftpflicht',
      service_typ: 'komplett',
      kennzeichen: kennzeichen || null,
      fahrzeug_hersteller: fahrzeugHersteller || null,
      fahrzeug_modell: fahrzeugModell || null,
      unfallort: unfallort || null,
      schadens_art: 'haftpflicht',
      schadens_hergang: schadenHergang || null,
      qualifizierungs_phase: 'konvertiert',
    },
  )
  if (!leadRes.ok) return { ok: false, error: `Vorgang konnte nicht angelegt werden: ${leadRes.error}` }
  const leadId = leadRes.leadId

  // Team-WA (Audit 23.08.). intern:true — der SV legt den Vorgang selbst an;
  // der Ausloeser ist ein Partner, nicht der Endkunde.
  await notifyTeamNeuerLead({
    leadId,
    quelle: 'SV — Partner-Werkstatt vermittelt',
    intern: true,
    name: [vorname, nachname].filter(Boolean).join(' ').trim(),
    telefon: telefon || null,
    email: email || null,
    zusatz: [kennzeichen ? `🚗 ${kennzeichen}` : null],
  })

  // 4. Sofort-Claim (P4 T1: Direkt-INSERT in 'gutachten-eingegangen', Effekte aufgeschoben).
  const { convertLeadToClaim } = await import('@/lib/leads/convert-lead-to-claim')
  const conv = await convertLeadToClaim({
    leadId,
    gutachtenBereitsErstellt: true,
    svIdFromTermin: sv.id,
    triggerByUserId: user.id,
  })
  if (!conv.ok) {
    // Aufraeumen: der frisch angelegte Lead ohne Claim ist Muell (kein Kunde-Kontaktpunkt).
    // Rollback nach fehlgeschlagener Konversion. Scheitert er (typisch: ein
    // Fremdschluessel haengt am Lead), bleibt ein verwaister Lead zurueck — genau die
    // Konstellation, mit der der J2-Seed 88 Leads auf prod liegen liess.
    const { error: rollbackFehler } = await admin.from('leads').delete().eq('id', leadId)
    if (rollbackFehler) {
      console.error(`[vermittle-partner-werkstatt] Rollback-DELETE fehlgeschlagen — Lead ${leadId} bleibt verwaist:`, rollbackFehler.message)
    }
    return { ok: false, error: `Vorgang konnte nicht angelegt werden: ${conv.error}` }
  }

  // Netzwerk-Bindung (J8): der vermittelnde SV ist der Owner-Knoten dieses Claims. Der
  // P3-Seed in convertLeadToClaim greift hier NICHT (deriveVermittler kennt nur werkstatt/
  // firmen_flotte — der SV-Flow-Lead hat keinen Inbound-Vermittler) -> expliziter Seed,
  // write-once via IS-NULL-Guard (frischer Claim). Non-fatal wie alle Bindungs-Seeds.
  try {
    // Das try faengt diesen Write nicht. Ohne die Bindung fehlt dem vermittelnden
    // Gutachter sein eigener Vorgang im Netzwerk.
    const { error: bindungFehler } = await admin
      .from('claims')
      .update({ netzwerk_owner_id: user.id } as never)
      .eq('id', conv.claimId)
      .is('netzwerk_owner_id', null)
    if (bindungFehler) {
      console.error(`[vermittle-partner-werkstatt] Netzwerk-Bindung nicht gesetzt (Claim ${conv.claimId}):`, bindungFehler.message)
    }
  } catch (err) {
    console.warn('[vermittlePartnerWerkstatt] netzwerk_owner_id-Seed non-fatal:', err)
  }

  // 5. Gutachten anhaengen — OHNE Transition (der Claim ist schon 'gutachten-eingegangen').
  //    Non-fatal: der Vorgang existiert; ein Attach-Fehler wird geloggt, der SV kann das
  //    Gutachten in der Fallakte nachreichen.
  const attach = await attachGutachtenOhneTransition(admin, {
    claimId: conv.claimId,
    fallId: conv.fallId,
    svId: sv.id,
    file: datei,
    betrag,
    userId: user.id,
  })
  if (!attach.ok) {
    console.error('[vermittlePartnerWerkstatt] Gutachten-Attach non-fatal:', attach.error)
  }

  // 6. Pflichtdokumente aus dem Katalog (non-fatal, Muster anlegeFall).
  try {
    const { createPflichtdokumenteFromKatalog } = await import('@/lib/dokumente/create-pflicht')
    const { data: leadRow } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle()
    await createPflichtdokumenteFromKatalog(admin, conv.fallId, leadRow as Record<string, unknown> | null)
  } catch (err) {
    console.warn('[vermittlePartnerWerkstatt] Pflichtdokumente non-fatal:', err)
  }

  // 7. Kanonischer FlowLink (EIN Link pro Lead, idempotent).
  const { ensureCanonicalFlowLinkForLead } = await import('@/lib/start-link/ensure-flowlink-for-lead')
  const fl = await ensureCanonicalFlowLinkForLead(leadId, { serviceTyp: 'komplett', admin })
  if (!fl.ok) return { ok: false, error: `FlowLink konnte nicht erstellt werden: ${fl.error}` }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
  const flowLinkUrl = `${appUrl}/flow/${fl.token}`

  // 8. Versand an den Kunden (non-fatal; WA > SMS > Email — reused sendeInitialLink ohne
  //    gfa-Precheck). Test-Konten ohne Kontaktdaten senden nichts.
  try {
    const { sendeInitialLink } = await import('@/lib/start-link/issue-canonical-flowlink')
    await sendeInitialLink({
      leadId,
      telefon: telefon || null,
      email: email || null,
      vorname,
      url: flowLinkUrl,
    })
  } catch (err) {
    console.warn('[vermittlePartnerWerkstatt] Link-Versand non-fatal:', err)
  }

  revalidatePath('/gutachter/auftraege')
  return { ok: true, fallId: conv.fallId, flowLinkUrl }
}
