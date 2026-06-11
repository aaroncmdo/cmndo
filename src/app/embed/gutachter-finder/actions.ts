'use server'

// AAR-956 WS4 — Embed-Buchungs-Kern. Step-2/3-Submit des Finder-Wizards:
//   gfa anlegen (anon, source=NULL → passt gfa_insert_public-RLS)
//   → issueCanonicalFlowLinkForAnfrage(send:false) promotet gfa→lead→flow_link → token
//   → der Wizard reicht den token an <FlowSlotStep> (Inline-Termin via Engine).
//
// WICHTIG (Aaron 11.06.): der Besichtigungsort (wo steht das Auto) wird ZUERST
// abgefragt und MUSS in die Anfrage/DB, damit die Engine den SV findet. Wir
// schreiben ihn auf gfa.schadenort_lat/lng + schadenort; issueCanonical mappt das
// auf lead.fahrzeug_standort_lat/lng → ladeMatchingFlow hat die Koordinaten →
// Engine-Matching ohne ort_abfragen-Umweg.
//
// KEIN /api/anfrage-from-lp (cross-origin/origin-gated, Monikas Revier) — der
// Embed ist same-origin und nutzt den nativen Anon-Pfad.

import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'

export type EmbedBuchungInput = {
  vorname: string
  nachname: string
  telefon: string
  email: string
  schadentyp: string
  ort: { adresse: string; lat: number; lng: number }
}

export async function starteEmbedBuchung(
  input: EmbedBuchungInput,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  // 1) gfa (Anfrage) anlegen — Ort landet auf schadenort_* (→ lead.fahrzeug_standort_*).
  const gfa = await erstelleGutachterFinderAnfrage({
    vorname: input.vorname,
    nachname: input.nachname,
    email: input.email,
    telefon: input.telefon,
    schadentyp: input.schadentyp,
    schadenort: input.ort.adresse,
    schadenort_lat: input.ort.lat,
    schadenort_lng: input.ort.lng,
  })
  if (!gfa.ok) return { ok: false, error: gfa.error }

  // 2) gfa → lead → flow_link (Service-Role, idempotent). send:true = Flowlink-WA an den
  //    Kunden raus (Aaron 11.06.: beim Absenden des Kontaktformulars muss die WhatsApp raus)
  //    + Self-Service-Einstieg. Der Nutzer bucht zusätzlich inline weiter (FlowSlotStep).
  const issued = await issueCanonicalFlowLinkForAnfrage(gfa.id, { send: true })
  if (!issued.ok) return { ok: false, error: issued.error }

  return { ok: true, token: issued.token }
}
