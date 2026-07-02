// Server-only Teil des Vermittlungs-Kerns: Write (assignReparaturWerkstatt) +
// Anker-Resolver (findReparaturWerkstaettenForTarget, 5 naechste) + Kunde-/
// Werkstatt-Benachrichtigungen. Nutzt intern den service-role Admin-Client (wie
// finder.ts). Der Caller MUSS Rolle/Token/Ownership VOR dem Aufruf geprueft haben
// (Authz am Rand — createAdminClient bypasst RLS). NICHT client-importierbar.
// Pure Gate/Patch liegen in ./vermittlung-core (dort client-safe).

import { createAdminClient } from '@/lib/supabase/admin'
import { findWerkstaetten, type WerkstattFinderRow } from '@/lib/werkstatt/finder'
import {
  buildZuweisungPatch,
  type VermittlungQuelle,
  type VermittlungTarget,
} from '@/lib/werkstatt/vermittlung-core'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Die 5 naechsten aktiven Partner-Werkstaetten zum Standort-Anker eines Lead/Claim.
 * Anker: Lead -> besichtigungsort_lat/lng, sonst unfallort_lat/lng, sonst
 * kunde_plz/halter_plz. Claim -> schadenort_lat/lng, sonst schadenort_plz.
 */
export async function findReparaturWerkstaettenForTarget(
  input: VermittlungTarget,
): Promise<WerkstattFinderRow[]> {
  const admin = createAdminClient()
  let lat: number | undefined
  let lng: number | undefined
  let plz: string | undefined

  if (input.target === 'lead') {
    const { data } = await admin
      .from('leads')
      .select('besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_plz, halter_plz')
      .eq('id', input.id)
      .maybeSingle()
    const l = (data ?? null) as {
      besichtigungsort_lat: number | null
      besichtigungsort_lng: number | null
      unfallort_lat: number | null
      unfallort_lng: number | null
      kunde_plz: string | null
      halter_plz: string | null
    } | null
    if (l) {
      if (l.besichtigungsort_lat != null && l.besichtigungsort_lng != null) {
        lat = l.besichtigungsort_lat
        lng = l.besichtigungsort_lng
      } else if (l.unfallort_lat != null && l.unfallort_lng != null) {
        lat = l.unfallort_lat
        lng = l.unfallort_lng
      }
      plz = l.kunde_plz ?? l.halter_plz ?? undefined
    }
  } else {
    const { data } = await admin
      .from('claims')
      .select('schadenort_lat, schadenort_lng, schadenort_plz')
      .eq('id', input.id)
      .maybeSingle()
    const c = (data ?? null) as {
      schadenort_lat: number | null
      schadenort_lng: number | null
      schadenort_plz: string | null
    } | null
    if (c) {
      if (c.schadenort_lat != null && c.schadenort_lng != null) {
        lat = c.schadenort_lat
        lng = c.schadenort_lng
      }
      plz = c.schadenort_plz ?? undefined
    }
  }

  return findWerkstaetten({ lat, lng, plz, limit: 5 })
}

/**
 * Weist einem Lead/Claim eine Reparatur-Werkstatt zu (setzt die 4
 * reparatur_werkstatt_* + status='vermittelt') und benachrichtigt Kunde +
 * Werkstatt. Kein revalidatePath (surface-spezifisch — der Caller revalidiert).
 */
export async function assignReparaturWerkstatt(
  input: VermittlungTarget & {
    werkstattId: string
    quelle: VermittlungQuelle
    actorUserId: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const table = input.target === 'lead' ? 'leads' : 'claims'
  const patch = buildZuweisungPatch(input.werkstattId, input.actorUserId ?? '', input.quelle)
  const { error } = await admin.from(table).update(patch as never).eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  // Non-critical: Benachrichtigungen. Ein Send-Fehler nimmt die Zuweisung NICHT zurueck.
  try {
    await notifyAfterAssign(admin, input)
  } catch (err) {
    console.warn('[assignReparaturWerkstatt] Benachrichtigung fehlgeschlagen (non-fatal):', err)
  }
  return { ok: true }
}

async function notifyAfterAssign(
  admin: AdminClient,
  input: VermittlungTarget & { werkstattId: string; quelle: VermittlungQuelle },
): Promise<void> {
  const { data: werkstatt } = await admin
    .from('werkstaetten')
    .select('name, adresse_strasse, adresse_plz, adresse_ort, telefon, email, user_id')
    .eq('id', input.werkstattId)
    .maybeSingle()
  const w = (werkstatt ?? null) as {
    name: string | null
    adresse_strasse: string | null
    adresse_plz: string | null
    adresse_ort: string | null
    telefon: string | null
    email: string | null
    user_id: string | null
  } | null
  if (!w?.name) return

  // Kunde-Account (In-App) + Kontakt (WhatsApp/Email). Lead: kunde_id + Direktkontakt
  // (frischer Lead hat oft KEINEN Account). Claim: geschaedigter_user_id + Profil.
  let kundeUserId: string | null = null
  let kundeKontakt: { vorname: string | null; telefon: string | null; email: string | null } = {
    vorname: null,
    telefon: null,
    email: null,
  }
  if (input.target === 'lead') {
    const { data: lead } = await admin
      .from('leads')
      .select('kunde_id, vorname, telefon, email')
      .eq('id', input.id)
      .maybeSingle()
    const l = (lead ?? null) as {
      kunde_id: string | null
      vorname: string | null
      telefon: string | null
      email: string | null
    } | null
    kundeUserId = l?.kunde_id ?? null
    kundeKontakt = { vorname: l?.vorname ?? null, telefon: l?.telefon ?? null, email: l?.email ?? null }
  } else {
    const { data: claim } = await admin
      .from('claims')
      .select('geschaedigter_user_id')
      .eq('id', input.id)
      .maybeSingle()
    kundeUserId = (claim as { geschaedigter_user_id: string | null } | null)?.geschaedigter_user_id ?? null
    if (kundeUserId) {
      const { data: profile } = await admin
        .from('profiles')
        .select('vorname, telefon, email')
        .eq('id', kundeUserId)
        .maybeSingle()
      const p = (profile ?? null) as {
        vorname: string | null
        telefon: string | null
        email: string | null
      } | null
      kundeKontakt = { vorname: p?.vorname ?? null, telefon: p?.telefon ?? null, email: p?.email ?? null }
    }
  }

  const adresse = [w.adresse_strasse, [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

  // (a) In-App-Mitteilung an den Kunden — nur wenn ein Account existiert.
  if (kundeUserId) {
    const inhalt = [
      `Deine Werkstatt: ${w.name}`,
      adresse ? `Adresse: ${adresse}` : null,
      w.telefon ? `Telefon: ${w.telefon}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
    await createMitteilung({
      empfaenger_id: kundeUserId,
      empfaenger_rolle: 'kunde',
      kategorie: 'update',
      titel: 'Deine Reparatur-Werkstatt steht fest',
      inhalt,
      kontext_typ: input.target === 'lead' ? 'lead' : 'fall',
      kontext_id: input.id,
    })
  }

  // (b) WhatsApp + Email an den Kunden — einziger Kanal fuer accountlose Leads.
  // Wording bei Fremd-Vermittlung (Gutachter) "fuer dich organisiert".
  if (kundeKontakt.telefon || kundeKontakt.email) {
    const { notifyKundeWerkstattVermittlung } = await import('@/lib/werkstatt/notify-kunde-vermittlung')
    await notifyKundeWerkstattVermittlung({
      kunde: kundeKontakt,
      werkstatt: { name: w.name, adresse, telefon: w.telefon },
      fallId: input.target === 'claim' ? input.id : null,
      imAuftragVon: input.quelle === 'kunde' ? null : input.quelle,
    })
  }

  // (c) Werkstatt-Notify: In-App-Mitteilung (empfaenger_rolle 'werkstatt' — die Rolle ist
  // in staging bereits vorhanden) + Email. Die dedizierte Portal-Inbox-Seite
  // (/werkstatt/auftraege, RPC get_werkstatt_reparatur_auftraege ist bereits in der DB)
  // liefert der werkstatt-freigabe-followups-Branch; hier bewusst NICHT dupliziert.
  if (w.user_id) {
    const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
    await createMitteilung({
      empfaenger_id: w.user_id,
      empfaenger_rolle: 'werkstatt',
      kategorie: 'update',
      titel: 'Neuer Reparaturauftrag',
      inhalt:
        'Dir wurde über Claimondo ein Reparaturauftrag zugewiesen. Der Kunde meldet sich zur Terminabstimmung bei Dir.',
      kontext_typ: input.target === 'claim' ? 'fall' : 'lead',
      kontext_id: input.id,
    })
  }
  let werkstattEmail = w.email
  if (!werkstattEmail && w.user_id) {
    const { data: wp } = await admin.from('profiles').select('email').eq('id', w.user_id).maybeSingle()
    werkstattEmail = (wp as { email: string | null } | null)?.email ?? null
  }
  if (werkstattEmail) {
    const { notifyWerkstattNeuerAuftrag } = await import('@/lib/werkstatt/notify-werkstatt-auftrag')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'
    await notifyWerkstattNeuerAuftrag({
      werkstatt: { email: werkstattEmail, name: w.name },
      kunde: { name: kundeKontakt.vorname },
      portalUrl: `${appUrl}/werkstatt/auftraege`,
      fallId: input.target === 'claim' ? input.id : null,
    })
  }
}
