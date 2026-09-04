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
import { ermittleReparaturbedarf } from '@/lib/werkstatt/bedarf/ermittle-bedarf'
import { qualifiziereWerkstaetten, type Qualifiziert } from '@/lib/werkstatt/bedarf/qualifiziere'
import { ensureReparaturTerminAngefragt } from '@/lib/werkstatt/ensure-reparatur-termin'
import type { Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import { advanceReparaturCursorTo, fallIdForClaim } from '@/lib/faelle/reparatur-cursor'
import { applyNetzwerkPraeferenz } from '@/lib/netzwerk/apply-netzwerk-praeferenz'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'
import { kundeHatBestaetigt } from '@/lib/faelle/onboarding-gate'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Die 5 naechsten aktiven Partner-Werkstaetten zum Standort-Anker eines Lead/Claim.
 * Anker: Lead -> besichtigungsort_lat/lng, sonst unfallort_lat/lng, sonst
 * kunde_plz/halter_plz. Claim -> schadenort_lat/lng, sonst schadenort_plz.
 * nurEchte=true (Kunde-/Flow-Caller) blendet Test-/interne Werkstaetten aus der
 * Kundensicht aus; Dispatch/SV rufen ohne nurEchte und sehen weiterhin alle.
 */
export async function findReparaturWerkstaettenForTarget(
  input: VermittlungTarget & { nurEchte?: boolean },
): Promise<WerkstattFinderRow[]> {
  const admin = createAdminClient()
  let lat: number | undefined
  let lng: number | undefined
  let plz: string | undefined

  let kategorie: string | null | undefined
  if (input.target === 'lead') {
    const { data } = await admin
      .from('leads')
      .select('besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_plz, unfallort_plz, halter_plz, schadenskategorie')
      .eq('id', input.id)
      .maybeSingle()
    const l = (data ?? null) as {
      besichtigungsort_lat: number | null
      besichtigungsort_lng: number | null
      unfallort_lat: number | null
      unfallort_lng: number | null
      kunde_plz: string | null
      unfallort_plz: string | null
      halter_plz: string | null
      schadenskategorie: string | null
    } | null
    if (l) {
      if (l.besichtigungsort_lat != null && l.besichtigungsort_lng != null) {
        lat = l.besichtigungsort_lat
        lng = l.besichtigungsort_lng
      } else if (l.unfallort_lat != null && l.unfallort_lng != null) {
        lat = l.unfallort_lat
        lng = l.unfallort_lng
      }
      // unfallort_plz mit in die Kette: die Marketing-Formulare sortieren ihre Ortsangabe
      // seit Mig 20260830215041 nach Format ein — eine echte PLZ landet dort (und beim
      // /check-Weg zusaetzlich in unfallort_plz), ein Stadtname NICHT in kunde_plz.
      // Bewusst nur PLZ-Felder: kunde_stadt/unfallort_ort waeren Ortsnamen, und diese
      // Kette fuettert eine PLZ-Umkreissuche.
      plz = l.kunde_plz ?? l.unfallort_plz ?? l.halter_plz ?? undefined
      kategorie = l.schadenskategorie
    }
  } else {
    const { data } = await admin
      .from('claims')
      .select('schadenort_lat, schadenort_lng, schadenort_plz, schadenskategorie')
      .eq('id', input.id)
      .maybeSingle()
    const c = (data ?? null) as {
      schadenort_lat: number | null
      schadenort_lng: number | null
      schadenort_plz: string | null
      schadenskategorie: string | null
    } | null
    if (c) {
      if (c.schadenort_lat != null && c.schadenort_lng != null) {
        lat = c.schadenort_lat
        lng = c.schadenort_lng
      }
      plz = c.schadenort_plz ?? undefined
      kategorie = c.schadenskategorie
    }
  }

  return findWerkstaetten({ lat, lng, plz, kategorie, limit: 5, nurEchte: input.nurEchte })
}

export type QualifizierteWerkstaettenResult = {
  // imNetzwerk (P2-T6, additiv): von applyNetzwerkPraeferenz gesetzt, wenn ein ownerProfilId
  // durchgereicht wurde — true = Freund-Werkstatt des Owners, nach oben partitioniert.
  werkstaetten: (Qualifiziert<WerkstattFinderRow> & { imNetzwerk?: boolean })[]
  keineSpezialisierte: boolean
  bedarf: Reparaturbedarf
}

/**
 * Wrapper ueber findReparaturWerkstaettenForTarget: ermittelt den Reparaturbedarf
 * per Resolver, holt distanz-sortierte Rows OHNE Kategorie-Filter (Qualifier uebernimmt
 * das), und qualifiziert die Rows (fit-Annotation + optionales Hart-Filtern).
 *
 * Gedacht fuer Claim-facing Surfaces (Kunde-Portal, Dispatch, SV). Der Caller erhaelt
 * eine { werkstaetten, keineSpezialisierte, bedarf }-Shape statt eines rohen Arrays.
 * Nur diese Funktion importieren statt findReparaturWerkstaettenForTarget wenn der
 * Caller das fit-Flag anzeigen oder keineSpezialisierte ausweisen moechte.
 */
export async function findQualifizierteReparaturWerkstaetten(
  input: VermittlungTarget & { nurEchte?: boolean; ownerProfilId?: string | null },
): Promise<QualifizierteWerkstaettenResult> {
  const admin = createAdminClient()

  // 1. Bedarf ermitteln (Resolver: gutachten > schadenbild > manuell > unbekannt)
  const bedarf = await ermittleReparaturbedarf(admin, {
    claimId: input.target === 'claim' ? input.id : undefined,
    leadId: input.target === 'lead' ? input.id : undefined,
  })

  // 2. Distanz-sortierte Rows OHNE kategorie-Filter (Qualifier owns qualification)
  const rows = await findReparaturWerkstaettenForTarget(input)

  // 3. Qualifier annotiert fit + hart-filtert bei hoher confidence
  const { werkstaetten, keineSpezialisierte } = qualifiziereWerkstaetten(rows, bedarf)

  // 4. P2-T6 (Netzwerk, K12): relationale Partition als ALLERLETZTER Schritt — NACH dem
  //    #4101/#4125-Reorder, damit Freunde ueber die Extra-Reorderings floaten, ohne sie zu
  //    zerstoeren. K10: EIN Freund-Batch pro Aufruf. 'passt_nicht' zaehlt NICHT als
  //    qualifiziert (Engine-Qualifikation schlaegt Freundschaft, Design §5.2).
  let final: QualifizierteWerkstaettenResult['werkstaetten'] = werkstaetten
  if (input.ownerProfilId) {
    const freundIds = await ladeFreundKandidatIds(admin, input.ownerProfilId, 'werkstatt')
    final = applyNetzwerkPraeferenz(
      werkstaetten.map((w) => ({ ...w, qualifiziert: w.fit !== 'passt_nicht' })),
      freundIds,
    )
  }

  return { werkstaetten: final, keineSpezialisierte, bedarf }
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
    /**
     * Ops-Test 12.08. (Aaron-Entscheid): Der Vermittelnde bestaetigt per Checkbox, dass
     * die Sicherungsabtretung dem Sachverstaendigen bereits OFFLINE vorliegt. Damit ist
     * die P4-Invariante erfuellt, ohne dass der Kunde ein zweites Mal digital
     * unterschreiben muss. Wird auf dem Claim mit Zeitpunkt + Urheber protokolliert.
     */
    saLiegtBereitsVor?: boolean
  },
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  // P4 (Invariante Spec 3 §4): keine Werkstatt-Zuweisung vor Kunden-Bestaetigung — GESCOPED auf
  // abrechnungsweg='haftpflicht' (dort ist die SA/Abtretung die Legitimationsgrundlage; der
  // SV-Vermittlungs-Sofort-Claim wird haftpflicht + sa_unterschrieben=false geboren). Kasko/
  // Selbstzahler waehlen die Werkstatt LEGITIM vor jeder SA (partieller Quali-Claim aus
  // erzeugeSelbstzahlerClaim — live verifiziert 30.07.: kasko/selbstzahler-Zuweisungen mit
  // sa!=true existieren, haftpflicht ausnahmslos sa=true) -> dort KEIN Gate, sonst braeche der
  // FlowLink-Werkstatt-Step. Der Claim-Read wird unten im LEAD-CLAIM-SYNC wiederverwendet.
  type GateClaim = {
    id: string
    sa_unterschrieben?: boolean | null
    abrechnungsweg?: string | null
    sa_extern_bestaetigt_am?: string | null
  }
  let gateClaim: GateClaim | null = null
  {
    const q = admin.from('claims').select('id, sa_unterschrieben, abrechnungsweg, sa_extern_bestaetigt_am')
    const { data } =
      input.target === 'claim'
        ? await q.eq('id', input.id).maybeSingle()
        : await q.eq('lead_id', input.id).maybeSingle()
    gateClaim = (data as GateClaim | null) ?? null
  }

  // Ops-Test 12.08.: Hakt der Vermittelnde "SA liegt bereits vor" an, protokollieren wir
  // das VOR dem Gate-Check auf dem Claim (Zeitpunkt + Urheber = Nachweiskette) und
  // spiegeln es in den lokalen gateClaim, damit der Check unten sofort greift.
  // Idempotent: eine bestehende Bestaetigung wird nicht ueberschrieben.
  if (input.saLiegtBereitsVor && gateClaim && !gateClaim.sa_extern_bestaetigt_am) {
    const nowIso = new Date().toISOString()
    const { error: saErr } = await admin
      .from('claims')
      .update({ sa_extern_bestaetigt_am: nowIso, sa_extern_bestaetigt_von: input.actorUserId } as never)
      .eq('id', gateClaim.id)
    if (saErr) return { ok: false, error: `SA-Bestätigung konnte nicht gespeichert werden: ${saErr.message}` }
    gateClaim = { ...gateClaim, sa_extern_bestaetigt_am: nowIso }
  }

  if (gateClaim && gateClaim.abrechnungsweg === 'haftpflicht' && !kundeHatBestaetigt(gateClaim)) {
    return {
      ok: false,
      error:
        'Der Kunde hat den Auftrag noch nicht bestätigt. Liegt Ihnen die Sicherungsabtretung bereits vor, bestätigen Sie das bitte mit der Checkbox.',
    }
  }

  // Kasko-WB Phase 1 (Spec §6): gebundener Kunde -> keine Zuweisung, egal wer sie versucht (Dispatch/KB/SV/Kunde).
  {
    const zielTabelle = input.target === 'lead' ? 'leads' : 'claims'
    const { data: ziel } = await admin.from(zielTabelle).select('freie_werkstattwahl').eq('id', input.id).maybeSingle()
    if ((ziel as { freie_werkstattwahl?: boolean | null } | null)?.freie_werkstattwahl === false) {
      return {
        ok: false,
        error: 'Kasko mit Werkstattbindung — der Versicherer benennt die Werkstatt. Eine Vermittlung ist hier nicht möglich.',
      }
    }
  }

  const table = input.target === 'lead' ? 'leads' : 'claims'
  const patch = buildZuweisungPatch(input.werkstattId, input.actorUserId, input.quelle)
  const { error } = await admin.from(table).update(patch as never).eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  // ⚠ Aaron 15.07. — LEAD-CLAIM-SYNC (Regression aus dem neuen Kasko/Selbstzahler-Flow):
  // Beim target='lead' kann BEREITS ein Claim existieren. Genau das ist bei Kasko/Selbstzahler der
  // Normalfall: erzeugeSelbstzahlerClaim legt den (partiellen) Claim schon im QUALI-Step an — also
  // VOR der Werkstatt-Wahl. Ohne diesen Sync bekaeme nur der Lead die Werkstatt, der Claim bliebe
  // leer, und das Kunde-Portal wuerde dem Kunden den Werkstatt-FINDER zeigen: er soll die Werkstatt
  // ein zweites Mal waehlen, obwohl er sie im FlowLink laengst gewaehlt hat.
  // (Frueher fiel das nicht auf, weil Kasko/Selbstzahler den Werkstatt-Step im Flow nie erreichten.)
  //
  // Nebenwirkung, die das mitrepariert: die Werkstatt-Mitteilung verlinkt auf /werkstatt/auftraege,
  // und v_werkstatt_auftrag ist CLAIM-gekeyt — ohne die Zuordnung am Claim landete die Werkstatt auf
  // einer leeren Liste.
  // (P4: der Claim-Read ist in den Gate-Block oben vorgezogen — gateClaim wird hier wiederverwendet.)
  let effectiveClaimId: string | null = input.target === 'claim' ? input.id : (gateClaim?.id ?? null)
  if (input.target === 'lead' && effectiveClaimId) {
    const { error: syncErr } = await admin
      .from('claims')
      .update(patch as never)
      .eq('id', effectiveClaimId)
    // Non-critical: die Lead-Zuweisung steht bereits; ein Sync-Fehler darf sie nicht zuruecknehmen.
    if (syncErr) console.error('[assignReparaturWerkstatt] Claim-Sync fehlgeschlagen:', syncErr.message)
  }

  // Reparatur-Cursor: Werkstatt zugewiesen -> reparatur-angefragt (nur reduced-repair,
  // non-fatal, forward-only; abrechnungsweg-Gate + Bridge-Resolve im Helper). Vor den
  // Benachrichtigungen, damit die Timeline-Reihenfolge stimmt (Zuweisung -> Info).
  if (effectiveClaimId) {
    const fid = await fallIdForClaim(effectiveClaimId)
    if (fid) {
      await advanceReparaturCursorTo(fid, 'reparatur-angefragt', {
        user_id: input.actorUserId,
        grund: 'werkstatt_vermittelt',
      })
    }
  }

  // Tranche W (Spec §4.9, W2): idempotente reparatur_termine-Row anlegen, damit die
  // Werkstatt-Auftrag-Sektion sichtbar wird. Deckt alle Claim-facing Bindungspfade (Akte-
  // Finder/Dispatch/KB/Lead-Sync) — bisher legten die kunde-/dispatch-Pfade KEINE Row an
  // (live-DB 08.08.: Quelle 'kunde' 2/2 ohne Row -> toter Werkstatt-Auftrag). Non-fatal:
  // die Zuweisung steht bereits, ein Row-Fehler darf sie nicht zuruecknehmen.
  if (effectiveClaimId) {
    try {
      const ensureRes = await ensureReparaturTerminAngefragt(admin, {
        claimId: effectiveClaimId,
        werkstattId: input.werkstattId,
        erstelltVon: input.actorUserId,
      })
      if (!ensureRes.ok) {
        console.error('[assignReparaturWerkstatt] ensureReparaturTermin fehlgeschlagen (non-fatal):', ensureRes.error)
      }
    } catch (err) {
      console.error('[assignReparaturWerkstatt] ensureReparaturTermin fehlgeschlagen (non-fatal):', err)
    }
  }

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
    await notifyWerkstattNeuerAuftrag({
      werkstatt: { email: werkstattEmail, name: w.name },
      kunde: { name: kundeKontakt.vorname },
      // W1.7: Deep-Link in die Auftrag-Detail-View wenn ein Claim vorliegt (sonst Liste).
      portalUrl: `${appUrl}/werkstatt/auftraege${input.target === 'claim' ? `/${input.id}` : ''}`,
      fallId: input.target === 'claim' ? input.id : null,
    })
  }
}
