'use server'

// Server-action orchestrator for the opponent accident-report flow.
// Receives the karten_token + GegnerFormData, validates consent + name,
// resolves vehicle/firma context, then writes a draft Lead via createLead().
//
// Note: leads.firma_id does NOT exist as a column (only claim_parties has it).
// Instead we store firma_name (string) on the lead for reference, and the
// vehicle_id FK is the primary link back to the fleet. The flottenmanager
// query in fahrzeug-schaeden.ts uses vehicle_id exclusively to find drafts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveSchadenTokenContext } from '@/lib/schadenkarte/gegner-flow'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { notifyFlottenmanagerSchadenGemeldet } from '@/lib/flotte/fm-schaden-notif'
import {
  resolveSchadenkarteToFahrzeug,
  bindeSchadenkarteAnFahrzeug,
} from '@/lib/schadenkarte/schadenkarte'
import { inviteGegnerViaAirdrop } from '@/lib/airdrop/gegner-invite'
import { erstelleVsDispatchTask } from '@/lib/vs-meldung/dispatch-task'
import { normalizeE164 } from '@/lib/whatsapp/send-sms-plain'
import { findRecentGegnerLead } from '@/lib/api-v1/recent-lead-dedup'
import { createLead } from '@/lib/leads/create-lead'
import { convertLeadToClaim } from '@/lib/leads/convert-lead-to-claim'
import {
  gegnerPhoneWriteCapExceeded,
  globalWriteCapExceeded,
  recordGlobalWrite,
} from '@/lib/api-v1/write-abuse-guard'
import {
  speichereGegnerFoto,
  speichereGegnerUnterschrift,
} from '@/lib/schadenkarte/gegner-dokumente'
import type { GegnerFormData } from './gegner-form-types'

type SubmitResult =
  | { ok: true; leadId: string; vehicleId: string; claimId?: string }
  | { ok: false; error: string }

/**
 * Verarbeitet das Gegner-Formular des NFC-Schaden-Flows.
 * Legt einen Draft-Lead an, der auf der Fahrzeug-Detailseite des Flottenmanagers erscheint.
 *
 * @param token  karten_token der Schadenkarte (URL-Parameter)
 * @param data   Formularwerte des Unfallgegners
 */
export async function submitSchadenGegner(
  token: string,
  data: GegnerFormData,
): Promise<SubmitResult> {
  // 1. Guard: Consent muss gegeben sein (DSGVO-Pflicht)
  if (!data.consent) {
    return {
      ok: false,
      error: 'Bitte stimmen Sie der Datenverarbeitung zu, um fortzufahren.',
    }
  }

  // 2. Guard: Name ist Pflichtfeld
  if (!data.name?.trim()) {
    return { ok: false, error: 'Bitte geben Sie Ihren Namen an.' }
  }

  // 3. Token -> Fahrzeug/Firma-Kontext auflösen
  const db = createAdminClient()
  const ctx = await resolveSchadenTokenContext(db, token)

  if (!ctx.ok) {
    return {
      ok: false,
      error: 'Diese Netzwerkkarte ist ungültig oder keinem Fahrzeug zugewiesen.',
    }
  }

  // 3b. Abuse-Cap: Per-Telefon-Velocity (3/24h gegen leads.gegner_telefon + source_channel=
  // 'schaden-karte' — die MCP-Variante filtert auf telefon/'mcp' und greift hier NICHT)
  // + globaler Circuit-Breaker. Scharf, weil dieser Endpunkt oeffentlich + unauthentifiziert
  // ist UND (Slice 2c) eine SMS an eine frei waehlbare Nummer ausloest.
  // WICHTIG: auf E.164 normalisieren BEVOR wir cappen UND speichern — sonst umgeht ein
  // Angreifer den Cap trivial ueber Format-Varianten derselben Nummer (0170.../+49170...
  // /"0170 ..."), die alle zu getrennten Count-Buckets werden, aber dieselbe SMS ausloesen.
  const telefon = data.telefon?.trim() ? normalizeE164(data.telefon.trim()) : undefined
  if (telefon && (await gegnerPhoneWriteCapExceeded(telefon))) {
    return {
      ok: false,
      error: 'Von dieser Telefonnummer wurden zu viele Meldungen erfasst. Bitte später erneut versuchen.',
    }
  }
  if (globalWriteCapExceeded()) {
    return {
      ok: false,
      error: 'Der Dienst ist aktuell stark ausgelastet. Bitte in einigen Minuten erneut versuchen.',
    }
  }

  // 3c. Doppel-Submit-Dedup: der Submit-Button ist gegen Doppelklick geschuetzt, NICHT gegen
  //   Reload+Resubmit. Ohne diesen Guard entstuende ein zweiter Claim -> eine zweite
  //   Unfallmeldung an denselben Versicherer fuer denselben Unfall. Ein frischer Lead
  //   (gleiche Nummer, gleiches Fahrzeug, < 10 min) gilt als derselbe Vorgang -> idempotent
  //   zurueckgeben, KEIN neuer Claim, KEIN zweiter Invite.
  if (telefon) {
    const dup = await findRecentGegnerLead(ctx.context.fahrzeugId, telefon)
    if (dup) {
      return { ok: true, leadId: dup.leadId, vehicleId: ctx.context.fahrzeugId, claimId: dup.claimId ?? undefined }
    }
  }

  // 4. Draft-Lead anlegen
  // source_channel: 'schaden-karte' — neuer Kanal fuer NFC-Schadenkarten-Flows;
  //   source_channel ist typed as string (open union), kein Closed-Union-Fallback noetig.
  // status: 'neu' — gueltiger lead_status-Enum-Wert fuer unbearbeitete Eingangs-Leads.
  // firma_id: existiert NICHT auf leads (nur auf claim_parties) → nicht geschrieben;
  //   firma_name (string-Spalte auf leads) wird stattdessen gesetzt.
  // dsgvo_zustimmung_am: existiert NICHT auf leads (nur auf anfragen/sv_termine) →
  //   nicht geschrieben; Consent wird via guard Z.38 erzwungen + consent-Timestamp
  //   liegt im created_at des Leads implizit vor.
  const res = await createLead(
    db,
    {
      source_channel: 'schaden-karte',
      status: 'neu',
    },
    {
      vehicle_id: ctx.context.fahrzeugId,
      firma_name: ctx.context.firmaName,
      // gewerbe_flag: die Flotten-Firma IST der gewerbliche Geschaedigte. Ohne das Flag
      //   ueberspringt convertLeadToClaim das ensureFirma (gegated auf gewerbe_flag &&
      //   firma_name) -> die geschaedigter-Party bliebe identitaetslos (kein firma_id).
      //   firma_name kommt exakt aus firmen.name (via Token) -> ensureFirma findet die
      //   existierende Firma by-name -> firma_id landet auf der geschaedigter-Party.
      //   Wichtig fuer Task C (VS-Meldung braucht eine identifizierte geschaedigte Seite).
      gewerbe_flag: true,
      gegner_name: data.name.trim(),
      gegner_telefon: telefon ?? null,
      gegner_email: data.email || null,
      gegner_kennzeichen: data.kennzeichen || null,
      gegner_fahrzeugtyp: data.fahrzeugtyp || null,
      gegner_versicherung_id: data.versicherungId || null,
      // Policennummer (Mig 20260714144318) -> beim Convert in claim_parties.versicherungsnummer
      // -> Betreff + Body der Unfallmeldung an die Gegner-Haftpflicht. Vorher hatte der Lead
      // dafuer keine Quelle, der Platz im Mail-Template blieb strukturell leer.
      gegner_versicherungsnummer: data.versicherungsnummer || null,
      gegner_schadennummer: data.schadennummer || null,
      unfallhergang: data.hergang || null,
      // FU1 (operativer-schaden-flow): der Schadenkarte-Gegner-Flow ist per Definition
      // Haftpflicht (der Gegner hat die Karte getappt = Gegner verursacht) -> schuldfrage
      // 'gegner' fuer die /flow-Haftpflicht/Kasko-Weiche (leads_schuldfrage_check).
      schuldfrage: 'gegner',
      // FU2: Unfallort (Schadenlocation, GPS am Unfallort) — getrennt vom Fahrzeug-Standort
      //   (Aaron 22.07.). Best-effort erfasst; null wenn der Gegner Geolocation ablehnt.
      unfallort_lat: data.unfallortLat ?? null,
      unfallort_lng: data.unfallortLng ?? null,
    },
  )

  if (!res.ok) {
    return { ok: false, error: res.error ?? 'Fehler beim Speichern.' }
  }

  // Write akzeptiert -> globalen Rolling-Counter zaehlen (nur tatsaechlich erfolgte Writes).
  recordGlobalWrite()

  // 5. Claim-first: Lead sofort zu einem echten Claim konvertieren.
  //   convertLeadToClaim ist idempotent + kanonisch: mappt den Gegner-Lead auf
  //   claims + claim_parties (geschaedigter = Flotten-Fahrzeug via vehicle_id/firma_name,
  //   verursacher = Gegner via gegner_* — data-driven). Kein triggerByUserId (anon Gegner-Flow).
  //   FAIL-SOFT: schlaegt der Convert fehl, bleibt der Draft-Lead am Fahrzeug sichtbar und
  //   der Convert ist spaeter idempotent nachholbar — der Gegner-Submit darf deshalb NICHT
  //   hart fehlschlagen (seine Daten sind erfasst).
  //   HINWEIS (a6c863e2-koordiniert): der Gegner-Unfallhergang landet aktuell via Pipeline in
  //   claims.hergang_kunde_text; die saubere Trennung (claims.hergang_gegner_text) folgt, sobald
  //   die claim-dokumente-kanon-Lane die claims-DDL freigibt.
  let claimId: string | undefined
  let fallId: string | undefined
  try {
    const conv = await convertLeadToClaim({ leadId: res.leadId })
    if (conv.ok) {
      claimId = conv.claimId
      fallId = conv.fallId
    } else {
      console.error(
        '[schaden-gegner] convertLeadToClaim fehlgeschlagen (Draft bleibt, idempotent nachholbar):',
        conv.error,
      )
    }
  } catch (err) {
    console.error('[schaden-gegner] convertLeadToClaim warf (Draft bleibt):', err)
  }

  // 5b. Foto- + Unterschrift-Upload (fail-soft).
  //   Nur wenn der Convert erfolgreich war (fallId + claimId bekannt).
  //   Ein fehlgeschlagener Upload darf den Gesamt-Submit NICHT abbrechen —
  //   der Claim existiert bereits und ist idempotent nachholbar.
  if (fallId && claimId) {
    if (data.fotos?.length) {
      for (const foto of data.fotos) {
        try {
          const fotoRes = await speichereGegnerFoto(db, fallId, claimId, foto)
          if (!fotoRes.ok) {
            console.error('[schaden-gegner] Foto-Upload fehlgeschlagen:', fotoRes.error, foto.typ)
          }
        } catch (err) {
          console.error('[schaden-gegner] Foto-Upload warf:', err)
        }
      }
    }

    if (data.unterschrift) {
      try {
        const sigRes = await speichereGegnerUnterschrift(db, fallId, claimId, data.unterschrift)
        if (!sigRes.ok) {
          console.error('[schaden-gegner] Unterschrift-Upload fehlgeschlagen:', sigRes.error)
        }
      } catch (err) {
        console.error('[schaden-gegner] Unterschrift-Upload warf:', err)
      }
    }
  }

  // 6. Slice 2c: Der Gegner bestaetigt seine Handynummer per SMS-Magic-Link. Erst diese
  //    Bestaetigung loest die Unfallmeldung an seine Haftpflicht aus (Fraud-Gate). Ohne
  //    Nummer ist das unmoeglich -> Dispatch uebernimmt manuell.
  //    Fail-soft wie der Convert darueber: ein Fehler hier darf den Gegner-Submit nie brechen.
  if (claimId) {
    try {
      // telefon ist hier bereits E.164-normalisiert (s.o.) — inviteGegnerViaAirdrop
      // normalisiert idempotent nochmal, aber wir uebergeben den kanonischen Wert.
      if (telefon) {
        const invite = await inviteGegnerViaAirdrop(claimId, telefon, {
          email: data.email || null,
          name: data.name.trim(),
        })
        if (!invite.ok) {
          await erstelleVsDispatchTask({ claimId, grund: 'send_fehler', detail: invite.error })
        }
      } else {
        await erstelleVsDispatchTask({ claimId, grund: 'kein_telefon' })
      }
    } catch (err) {
      console.error('[schaden-gegner] Airdrop-Invite fehlgeschlagen:', err)
    }
  }

  // 6c. WS E (P6 T10): der Karten-Issuer (Flotte) wird zum netzwerk_owner dieses Claims —
  //   Attribution fuer den "Dein Netzwerk"-Finder-Boost (P2) + die Provisions-Suppression (P3).
  //   BACKSTOP zum INSERT-Pfad: convertLeadToClaim seedet netzwerk_owner_id bereits bei Anlage
  //   (write-once-Kontrakt) — hier wird NUR nachgezogen, wenn der Insert-Resolver leer ausging
  //   (IS-NULL-Guard haelt den write-once-Kontrakt). Fail-soft — darf den Submit nie brechen.
  if (claimId && ctx.context.firmaId) {
    try {
      const { resolveNetzwerkOwnerFuerFlotte } = await import('@/lib/schadenkarte/netzwerk-owner')
      const ownerId = await resolveNetzwerkOwnerFuerFlotte(db, ctx.context.firmaId)
      if (ownerId) {
        const { error } = await db
          .from('claims')
          .update({ netzwerk_owner_id: ownerId })
          .eq('id', claimId)
          .is('netzwerk_owner_id', null)
        if (error) console.error('[schaden-gegner] netzwerk_owner_id set:', error.message)
      }
    } catch (err) {
      console.error('[schaden-gegner] netzwerk-owner attribution warf:', err)
    }
  }

  // 6b. T4: Flottenmanager per WhatsApp ueber den via Karte gemeldeten Schaden informieren
  //   (Link zur Fahrzeug-Detail + Eckdaten). Fail-soft — darf den Gegner-Submit nie brechen.
  if (claimId) {
    try {
      const fahrzeugLabel = [ctx.context.hersteller, ctx.context.modell].filter(Boolean).join(' ') || null
      await notifyFlottenmanagerSchadenGemeldet({
        firmaId: ctx.context.firmaId,
        vehicleId: ctx.context.fahrzeugId,
        kennzeichen: ctx.context.kennzeichen,
        fahrzeug: fahrzeugLabel,
        gegnerName: data.name.trim(),
        gegnerKennzeichen: data.kennzeichen || null,
      })
    } catch (err) {
      console.error('[schaden-gegner] FM-WA-Notif fehlgeschlagen:', err)
    }
  }

  // 7. Fahrzeug-Detailseite revalidieren — dort erscheint der neue Schaden (Claim oder Draft)
  revalidatePath('/flotte/fahrzeug/' + ctx.context.fahrzeugId)

  return { ok: true, leadId: res.leadId, vehicleId: ctx.context.fahrzeugId, claimId }
}

/**
 * Bindet eine (ungebundene) Schadenkarte an ein Fahrzeug — aufgerufen vom
 * Flottenmanager, der die physische Karte antippt und ueber /schaden/[token]
 * im Bind-Zweig landet. Auth-Grenze: nur ein eingeloggter Flottenmanager,
 * dessen Firma die Karte gehoert, darf binden. bindeSchadenkarteAnFahrzeug
 * prueft zusaetzlich Fahrzeug-Ownership (flotten_fahrzeuge), firma_id der
 * Karte + Status-Guard (nur 'bestellt'/'frei').
 */
export async function bindeKarteAnFahrzeugPublic(
  token: string,
  fahrzeugId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bitte einloggen.' }

  const admin = createAdminClient()
  const firma = await getFlottenmanagerFirma(admin, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const karte = await resolveSchadenkarteToFahrzeug(admin, token)
  if (!karte || karte.firmaId !== firma.id) {
    return { ok: false, error: 'Karte gehört nicht zu Ihrer Flotte.' }
  }

  const res = await bindeSchadenkarteAnFahrzeug(admin, {
    token,
    fahrzeugId,
    firmaId: firma.id,
    userId: user.id,
  })
  if (res.ok) {
    revalidatePath(`/schaden/${token}`)
    revalidatePath('/flotte/karten')
    revalidatePath(`/flotte/fahrzeug/${fahrzeugId}`)
  }
  return res
}
