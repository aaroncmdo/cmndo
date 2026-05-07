// AAR-497 N6 (2026-05-07): In-App-Channel schreibt jetzt in die mitteilungen-
// Tabelle. Vorher Stub („kommt in Folge-Ticket N6"). Folge: UpdatesNav-Popover
// in allen Portalen zeigt Termin-/Status-/Dispatch-Events live an, sobald
// emitEvent() durch fan-out → channel.in_app.dispatch() läuft.
//
// Mapping-Logik:
//   - Kategorie: 'nachricht' nur für nachricht.received, sonst 'update'.
//     'task' und 'anruf' sind UpdatesNav-Tabs; Tasks fließen über AAR-723
//     TasksPill (separater Pfad), Anruf-Events existieren in der Event-
//     Taxonomie noch nicht — daher 'update' als Default.
//   - Titel/Inhalt: kompakte Beschreibung aus Event-Type + Payload-Snippets.
//     Generischer Fallback für alle Events ohne Custom-Mapping.
//   - Kontext-ID: fallId/leadId/terminId aus Payload — UpdatesNav nutzt das
//     für jumpTo() und auto-route-url-Resolution.

import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import { EVENT_MATRIX } from '../channel-matrix'
import type { ChannelHandler } from './types'
import type {
  EmpfaengerRolle,
  KontextTyp,
  MitteilungKategorie,
  MitteilungPrioritaet,
} from '@/lib/mitteilungen/types'
import type { EventType } from '../types'

const ROLE_MAP: Record<string, EmpfaengerRolle> = {
  kunde: 'kunde',
  sachverstaendiger: 'sachverstaendiger',
  makler: 'makler',
  kundenbetreuer: 'kundenbetreuer',
  admin: 'admin',
}

const PRIO_MAP: Record<string, MitteilungPrioritaet> = {
  low: 'normal',
  normal: 'normal',
  urgent: 'dringend',
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

// Liefert (titel, inhalt, kontext_typ, kontext_id) aus EventType + Payload.
function mapEventToMitteilung(
  eventType: EventType,
  payload: Record<string, unknown>,
): {
  titel: string
  inhalt: string | null
  kategorie: MitteilungKategorie
  kontext_typ: KontextTyp | null
  kontext_id: string | null
} {
  const fallId = asString(payload.fallId)
  const leadId = asString(payload.leadId)
  const terminId = asString(payload.terminId)
  const claimId = asString(payload.claimId)

  // Kontext-Priorisierung (Variante C, 2026-05-07):
  // Wenn claimId im Payload — speichern wir claim als SSoT. autoRouteUrl
  // löst beim Routing per faelle.claim_id-Lookup auf die fall-basierte UI-
  // Route auf. Sonst Standard-Hierarchie: fall > lead > termin.
  const kontext: { typ: KontextTyp | null; id: string | null } = claimId
    ? { typ: 'claim', id: claimId }
    : fallId
      ? { typ: 'fall', id: fallId }
      : leadId
        ? { typ: 'lead', id: leadId }
        : terminId
          ? { typ: 'termin', id: terminId }
          : { typ: null, id: null }

  // Custom-Titles für die häufigsten Events. Fallback weiter unten ist
  // generisch genug, dass das System auch ohne Pflege neuer Events
  // sinnvoll rendert.
  switch (eventType) {
    case 'nachricht.received': {
      const sender = asString(payload.senderRolle) ?? 'Jemand'
      const preview = asString(payload.inhaltPreview) ?? ''
      return {
        titel: `Neue Nachricht von ${sender}`,
        inhalt: preview.slice(0, 140),
        kategorie: 'nachricht',
        kontext_typ: kontext.typ,
        kontext_id: kontext.id,
      }
    }
    case 'fall.created':
      return { titel: 'Neuer Fall', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'fall.sv_assigned':
      return { titel: 'Sachverständiger zugewiesen', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'fall.status_changed': {
      const newStatus = asString(payload.newStatus)
      return { titel: 'Fall-Status geändert', inhalt: newStatus ? `Neuer Status: ${newStatus}` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'fall.storniert':
      return { titel: 'Fall storniert', inhalt: asString(payload.grund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'sa.flow_sent':
      return { titel: 'Schadenanzeige verschickt', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'sa.signed':
      return { titel: 'Schadenanzeige unterschrieben', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.sv_bestaetigt': {
      const datum = asString(payload.datum)
      const uhrzeit = asString(payload.uhrzeit)
      return {
        titel: 'Termin bestätigt',
        inhalt: datum && uhrzeit ? `${datum} um ${uhrzeit}` : null,
        kategorie: 'update',
        kontext_typ: kontext.typ,
        kontext_id: kontext.id,
      }
    }
    case 'termin.sv_abgelehnt':
      return { titel: 'Termin abgelehnt', inhalt: asString(payload.grund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.sv_gegenvorschlag': {
      const alt = `${asString(payload.alt_datum) ?? ''} ${asString(payload.alt_uhrzeit) ?? ''}`.trim()
      return { titel: 'Gegenvorschlag erhalten', inhalt: alt || null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'termin.sv_storniert':
      return { titel: 'Termin storniert', inhalt: asString(payload.grund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.erinnerung': {
      const offset = asNumber(payload.offset_hours)
      return { titel: 'Termin-Erinnerung', inhalt: offset ? `In ${offset} Stunden` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'termin.sv_unterwegs': {
      const eta = asNumber(payload.etaMinuten)
      return { titel: 'SV ist unterwegs', inhalt: eta ? `Ankunft in ca. ${eta} Min` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'termin.sv_verspaetet': {
      const min = asNumber(payload.verspaetungMinuten)
      return { titel: 'SV verspätet', inhalt: min ? `${min} Min später als geplant` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'termin.sv_angekommen':
      return { titel: 'SV vor Ort', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.sv_abgeschlossen':
      return { titel: 'Termin abgeschlossen', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.verlegung_vorgeschlagen': {
      const sv = asString(payload.svVorname) ?? 'Der SV'
      const neu = `${asString(payload.neuesDatum) ?? ''} ${asString(payload.neuesUhrzeit) ?? ''}`.trim()
      return { titel: 'Terminverlegung vorgeschlagen', inhalt: `${sv} schlägt vor: ${neu}`, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'termin.verlegung_bestaetigt':
      return { titel: 'Verlegung bestätigt', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.verlegung_abgelehnt':
      return { titel: 'Verlegung abgelehnt', inhalt: asString(payload.grund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.verlegung_eskalation':
      return { titel: 'Verlegungs-Eskalation — Aktion nötig', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'termin.verschoben_durch_kunde':
      return { titel: 'Kunde hat Termin verschoben', inhalt: `Neu: ${asString(payload.neuesDatum) ?? ''} ${asString(payload.neuesUhrzeit) ?? ''}`.trim(), kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'gutachten.fertig':
      return { titel: 'Gutachten fertig', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'gutachten.nachbesserung': {
      const list = Array.isArray(payload.fehlerListe) ? (payload.fehlerListe as string[]).join(', ') : null
      return { titel: 'Gutachten-Nachbesserung erforderlich', inhalt: list, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'kanzlei.uebergabe':
      return { titel: 'Übergabe an Kanzlei', inhalt: asString(payload.kanzleiKontakt) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'kanzlei.as_gesendet':
      return { titel: 'Anschlussschreiben verschickt', inhalt: asString(payload.vsName) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'regulierung.ergebnis':
      return { titel: `Regulierung: ${asString(payload.typ) ?? 'Ergebnis'}`, inhalt: asNumber(payload.betragEur) ? `${asNumber(payload.betragEur)} €` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'regulierung.ruege_gesendet':
      return { titel: 'Rüge an Versicherung verschickt', inhalt: asNumber(payload.kuerzungBetragEur) ? `Kürzung: ${asNumber(payload.kuerzungBetragEur)} €` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'eskalation.vs_frist':
      return { titel: `VS-Frist Stufe ${asNumber(payload.stufe) ?? '?'}`, inhalt: asString(payload.vsName) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'auszahlung.veranlasst': {
      const betrag = asNumber(payload.betragEur)
      return { titel: 'Auszahlung veranlasst', inhalt: betrag ? `${betrag} € — Gutschrift in ca. ${asNumber(payload.erwarteteGutschriftTage) ?? '?'} Tagen` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'task.created':
      return { titel: 'Neue Aufgabe', inhalt: asString(payload.taskTyp) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'task.due':
      return { titel: asString(payload.state) === 'overdue' ? 'Aufgabe überfällig' : 'Aufgabe demnächst fällig', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'dokument.fehlt':
      return { titel: 'Dokument fehlt', inhalt: asString(payload.anforderungText) ?? asString(payload.dokumentTyp) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'dokument.hochgeladen':
      return { titel: 'Dokument hochgeladen', inhalt: asString(payload.typ) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'makler.lead_eingegangen':
      return { titel: 'Neuer Lead eingegangen', inhalt: asString(payload.promoCode) ? `Promo: ${asString(payload.promoCode)}` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'makler.provision_status': {
      const st = asString(payload.status)
      const betrag = asNumber(payload.betragEur)
      return { titel: `Provision ${st ?? ''}`.trim(), inhalt: betrag ? `${betrag} €` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'mietwagen.rechnung_ausstehend':
      return { titel: 'Mietwagen-Rechnung ausstehend', inhalt: asNumber(payload.seit_tage) ? `Seit ${asNumber(payload.seit_tage)} Tagen` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'mietwagen.abgabe_naht':
      return { titel: 'Mietwagen-Abgabe naht', inhalt: asNumber(payload.tage_rest) ? `Noch ${asNumber(payload.tage_rest)} Tage` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'mietwagen.ueber_limit':
      return { titel: 'Mietwagen über Limit', inhalt: asNumber(payload.tage_ueber) ? `${asNumber(payload.tage_ueber)} Tage drüber` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'gutachten.ocr_succeeded':
      return { titel: 'Gutachten-OCR erfolgreich', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'gutachten.ocr_failed':
      return { titel: 'Gutachten-OCR fehlgeschlagen', inhalt: asString(payload.reason) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.in_kommunikation_vs':
      return { titel: 'In Kommunikation mit Versicherung', inhalt: asString(payload.grund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.reguliert': {
      const betrag = asNumber(payload.betragEur)
      return { titel: 'Fall reguliert', inhalt: betrag ? `${betrag} €` : null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    }
    case 'claim.abgelehnt':
      return { titel: 'Versicherung hat abgelehnt', inhalt: asString(payload.vsAblehnungsGrund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.storniert':
      return { titel: 'Fall storniert', inhalt: asString(payload.grund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.an_externe_kanzlei_uebergeben':
      return { titel: 'An externe Kanzlei übergeben', inhalt: asString(payload.kanzleiName) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.kanzlei_paket_versendet':
      return { titel: 'Kanzlei-Paket versendet', inhalt: asString(payload.kanzleiName) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.kanzlei_re_frage_due':
      return { titel: 'Kanzlei-Rückfrage fällig', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.kanzlei_paket_pending':
      return { titel: 'Kanzlei-Paket wartet auf Versand', inhalt: asString(payload.kanzleiWunsch) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.gegner_eingeladen':
      return { titel: 'Gegnerische Partei eingeladen', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.gegner_hat_geoeffnet':
      return { titel: 'Gegnerische Partei hat Einladung geöffnet', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.gegner_hat_geantwortet':
      return { titel: 'Gegnerische Partei hat geantwortet', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.gegner_konvertiert_zu_voll':
      return { titel: 'Gegnerische Partei → Voll-Mitglied', inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    case 'claim.einladung_abgelaufen':
      return { titel: 'Gegner-Einladung abgelaufen', inhalt: asString(payload.ablaufGrund) ?? null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
    default:
      // Generischer Fallback — Event-Type als Title (lesbar genug:
      // „termin.verlegung_eskalation"), kein Inhalt.
      return { titel: eventType, inhalt: null, kategorie: 'update', kontext_typ: kontext.typ, kontext_id: kontext.id }
  }
}

export const inAppHandler: ChannelHandler = async (input) => {
  const empfaengerRolle = ROLE_MAP[input.recipientRole]
  if (!empfaengerRolle) {
    return { success: false, errorMessage: `unknown role: ${input.recipientRole}` }
  }

  const matrixPrio = EVENT_MATRIX[input.eventType]?.priority
  const prioritaet = PRIO_MAP[matrixPrio ?? 'normal']

  const mapped = mapEventToMitteilung(input.eventType, input.payload)

  const result = await createMitteilung({
    empfaenger_id: input.recipientUserId,
    empfaenger_rolle: empfaengerRolle,
    kategorie: mapped.kategorie,
    titel: mapped.titel,
    inhalt: mapped.inhalt ?? undefined,
    kontext_typ: mapped.kontext_typ ?? undefined,
    kontext_id: mapped.kontext_id ?? undefined,
    prioritaet,
  })

  if (!result) {
    return { success: false, errorMessage: 'createMitteilung returned null' }
  }
  return { success: true, externalId: result.id }
}
