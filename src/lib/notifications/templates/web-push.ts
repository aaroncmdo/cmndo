// AAR-499 N4: Push-Payload-Builder. Pro Event-Typ × Rolle → Title + Body +
// URL + Tag. iOS schneidet Text stark ab (~30 Zeichen Title, ~100 Body) —
// deshalb kurz halten. Tag dient Deduplizierung: Ein neuer Push mit dem
// selben Tag ersetzt den alten auf dem Lockscreen.

import type { EventType, NotificationEvent, Role } from '../types'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
  priority?: 'normal' | 'urgent'
}

function portalPath(role: Role, fallId: string | null): string {
  switch (role) {
    case 'kunde':
      return fallId ? `/kunde/faelle/${fallId}` : '/kunde'
    case 'sachverstaendiger':
      return fallId ? `/gutachter/fall/${fallId}` : '/gutachter'
    case 'makler':
      return fallId ? `/makler/akten/${fallId}` : '/makler'
    case 'kundenbetreuer':
      return fallId ? `/faelle/${fallId}` : '/mitarbeiter'
    default:
      return fallId ? `/faelle/${fallId}` : '/admin'
  }
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function buildPushPayload(event: NotificationEvent, role: Role): PushPayload {
  const fallId = event.fall_id
  const url = portalPath(role, fallId)
  const tag = `${event.event_type}-${fallId ?? event.id}`
  const payload = event.payload as Record<string, unknown>

  const eventType = event.event_type as EventType
  switch (eventType) {
    case 'fall.created':
      return { title: 'Neuer Fall eröffnet', body: 'Ihr Schadensfall wurde angelegt.', url, tag }
    case 'fall.sv_assigned':
      return {
        title: 'Gutachter zugewiesen',
        body: `${s(payload.svName, 'Ihr Gutachter')} übernimmt Ihren Fall.`,
        url,
        tag,
      }
    case 'fall.status_changed':
      return {
        title: 'Status geändert',
        body: `Neuer Status: ${s(payload.newStatus, '—')}`,
        url,
        tag,
      }
    case 'fall.storniert':
      return {
        title: 'Fall storniert',
        body: s(payload.grund, 'Ihr Fall wurde storniert.'),
        url,
        tag,
        priority: 'urgent',
      }
    case 'sa.signed':
      return { title: 'Vollmacht unterzeichnet', body: 'Danke — wir legen direkt los.', url, tag }
    case 'termin.sv_bestaetigt':
      return {
        title: 'Termin bestätigt',
        body: `${s(payload.datum)} · ${s(payload.uhrzeit)} · ${s(payload.svName)}`,
        url,
        tag,
      }
    case 'termin.sv_abgelehnt':
      return {
        title: 'Termin abgelehnt',
        body: s(payload.grund, 'Der Gutachter hat den Termin abgelehnt.'),
        url,
        tag,
        priority: 'urgent',
      }
    case 'termin.sv_gegenvorschlag':
      return {
        title: 'Gegenvorschlag',
        body: `Neuer Vorschlag: ${s(payload.alt_datum)} · ${s(payload.alt_uhrzeit)}`,
        url,
        tag,
      }
    case 'termin.sv_storniert':
      return {
        title: 'Termin storniert',
        body: s(payload.grund, 'Der Termin wurde abgesagt.'),
        url,
        tag,
        priority: 'urgent',
      }
    case 'termin.erinnerung':
      return {
        title: 'Erinnerung: Termin',
        body: typeof payload.offset_hours === 'number' && payload.offset_hours === 2
          ? 'Ihr Termin beginnt in 2 Stunden.'
          : 'Ihr Termin ist morgen.',
        url,
        tag,
        priority: 'urgent',
      }
    case 'termin.sv_unterwegs':
      return {
        title: 'Gutachter ist unterwegs',
        body: `Ankunft in ca. ${typeof payload.etaMinuten === 'number' ? payload.etaMinuten : '—'} Minuten`,
        url,
        tag,
        priority: 'urgent',
      }
    case 'termin.sv_verspaetet':
      return {
        title: 'Verspätung',
        body: `Ankunft verzögert sich um ${typeof payload.verspaetungMinuten === 'number' ? payload.verspaetungMinuten : '—'} Minuten.`,
        url,
        tag,
        priority: 'urgent',
      }
    case 'termin.sv_angekommen':
      return { title: 'Gutachter ist da', body: 'Der Gutachter ist vor Ort.', url, tag }
    case 'videocall.geplant':
      return {
        title: 'Video-Termin vereinbart',
        body: `${s(payload.terminDatum)} · ${s(payload.kbName)}`,
        url,
        tag,
      }
    case 'videocall.erinnerung':
      return {
        title: 'Video-Termin gleich',
        body: 'Ihr Video-Termin startet in Kürze.',
        url,
        tag,
        priority: 'urgent',
      }
    case 'gutachten.fertig':
      return { title: 'Gutachten fertig', body: 'Das Gutachten ist bereit.', url, tag }
    case 'gutachten.nachbesserung':
      return {
        title: 'Nachbesserung nötig',
        body: 'Das Gutachten muss überarbeitet werden.',
        url,
        tag,
      }
    case 'kanzlei.uebergabe':
      return {
        title: 'Übergabe an Kanzlei',
        body: 'Ihr Fall wurde an unsere Partner-Kanzlei übergeben.',
        url,
        tag,
      }
    case 'kanzlei.as_gesendet':
      return {
        title: 'Anwaltsschreiben gesendet',
        body: `Versandt an ${s(payload.vsName, 'die Versicherung')}.`,
        url,
        tag,
      }
    case 'regulierung.ergebnis':
      return {
        title: 'Regulierung da',
        body: typeof payload.betragEur === 'number' ? `Ergebnis: ${payload.betragEur} €` : 'Regulierungs-Ergebnis liegt vor.',
        url,
        tag,
      }
    case 'regulierung.ruege_gesendet':
      return {
        title: 'Rüge gesendet',
        body: typeof payload.kuerzungBetragEur === 'number' ? `Wir rügen ${payload.kuerzungBetragEur} € Kürzung.` : 'Kürzung wurde gerügt.',
        url,
        tag,
      }
    case 'eskalation.vs_frist':
      return {
        title: 'Frist läuft ab',
        body: `Eskalationsstufe ${typeof payload.stufe === 'number' ? payload.stufe : '—'} Tage.`,
        url,
        tag,
        priority: 'urgent',
      }
    case 'auszahlung.veranlasst':
      return {
        title: 'Auszahlung veranlasst',
        body: typeof payload.betragEur === 'number' ? `${payload.betragEur} € unterwegs.` : 'Auszahlung läuft.',
        url,
        tag,
        priority: 'urgent',
      }
    case 'task.created':
      return {
        title: 'Neue Aufgabe',
        body: s(payload.taskTyp, 'Eine neue Aufgabe wartet auf Sie.'),
        url,
        tag,
      }
    case 'task.due':
      return {
        title: payload.state === 'overdue' ? 'Aufgabe überfällig' : 'Aufgabe wird fällig',
        body: s(payload.taskTyp, 'Bitte erledigen.'),
        url,
        tag,
        priority: 'urgent',
      }
    case 'dokument.fehlt':
      return {
        title: 'Dokument fehlt',
        body: s(payload.anforderungText, s(payload.dokumentTyp, 'Ein Dokument wird benötigt.')),
        url,
        tag,
      }
    case 'dokument.hochgeladen':
      return {
        title: 'Dokument hochgeladen',
        body: s(payload.typ, 'Neues Dokument verfügbar.'),
        url,
        tag,
      }
    case 'nachricht.received':
      return {
        title: 'Neue Nachricht',
        body: s(payload.inhaltPreview, '').slice(0, 120),
        url,
        tag,
      }
    case 'makler.lead_eingegangen':
      return { title: 'Neuer Lead', body: 'Ein neuer Lead wurde Ihnen zugewiesen.', url, tag }
    case 'makler.provision_status':
      return {
        title: 'Provisions-Update',
        body: `Status: ${s(payload.status, '—')}`,
        url,
        tag,
      }
    // AAR-840: Manuelle Endzustände
    case 'claim.in_kommunikation_vs':
      return { title: 'In Kommunikation mit VS', body: 'Wir vertreten gerade Ihre Forderung.', url, tag, priority: 'normal' }
    case 'claim.reguliert': {
      const betrag = payload.betragEur as number | undefined
      return {
        title: 'Schaden reguliert',
        body: betrag ? `Ihr Anspruch von ${betrag.toFixed(2)} € wurde reguliert.` : 'Ihr Anspruch wurde reguliert.',
        url,
        tag,
        priority: 'urgent',
      }
    }
    case 'claim.abgelehnt':
      return { title: 'Schaden abgelehnt', body: 'Bitte öffnen Sie das Portal für Details.', url, tag, priority: 'urgent' }
    case 'claim.storniert':
      return { title: 'Schaden storniert', body: 'Ihr Schadensfall wurde storniert.', url, tag, priority: 'normal' }
    case 'claim.an_externe_kanzlei_uebergeben': {
      const kanzlei = payload.kanzleiName as string | undefined
      return {
        title: 'An Kanzlei übergeben',
        body: kanzlei ? `Ihr Fall liegt jetzt bei ${kanzlei}.` : 'Ihr Fall liegt jetzt bei einer Kanzlei.',
        url,
        tag,
        priority: 'urgent',
      }
    }
    case 'sa.flow_sent':
    case 'termin.sv_abgeschlossen':
    default:
      return {
        title: 'Claimondo',
        body: 'Es gibt ein Update zu Ihrem Fall.',
        url,
        tag,
      }
  }
}
