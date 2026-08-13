// C3 (§9-#6, Aaron-Entscheid 13.08.): `sendFallCommunication` wird durable — statt direkt
// zu senden schreibt sie in die Notification-Outbox (Dedup + Retry + Dead-Letter-Task).
// Diese Datei haelt die beiden ENTSCHEIDUNGEN, die dabei fallen, als pure Funktionen:
// welcher Dedup-Key, welcher Outbox-Kanal. Bewusst frei von DB/IO -> unit-testbar.

import type { CommunicationChannel } from './types'
import type { OutboxChannel } from '@/lib/notifications/outbox'

/**
 * Stabiler, kurzer Hash ueber die Payload (FNV-1a, 32 bit als hex).
 *
 * Kein crypto: der Wert muss nur deterministisch und kollisionsarm sein, nicht
 * kryptografisch. Schluessel werden sortiert, damit die Reihenfolge im Objekt
 * den Key nicht veraendert (sonst dedupt derselbe Anlass nicht mehr).
 */
export function payloadHash(payload: Record<string, string> | undefined): string {
  const norm = Object.entries(payload ?? {})
    .filter(([k]) => k !== 'telefon' && k !== 'email') // Empfaengerdaten: kein Teil des Anlasses
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  let h = 0x811c9dc5
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Der Default-Dedup-Key fuer einen Fall-Send: `<template>:<claimId>:<payloadHash>:<YYYY-MM-DD>`.
 *
 * ⚠ Die Tagesscheibe ist der Kern der Sicherheit, nicht Kosmetik. Ein Key OHNE sie
 * (`<template>:<claimId>`) wuerde jeden Trigger fuer die gesamte Lebenszeit des Claims
 * auf EINEN Versand begrenzen — jeder Reminder, jede zweite Mahnung, jeder erneute
 * Terminvorschlag verschwaende still. Das waere schlimmer als das Problem, das die
 * Outbox loest.
 *
 * Was der Key leistet: identischer Anlass (gleiches Template, gleiche Payload, gleicher
 * Tag) = **ein** Versand — also genau der Doppel-Submit-/Doppel-Klick-Fall. Ein Trigger
 * mit anderer Payload oder am Folgetag laeuft normal durch.
 *
 * Wer eine strengere Semantik braucht ("genau einmal ueberhaupt"), uebergibt einen
 * eigenen Key an `sendFallCommunication`.
 */
export function buildFallDedupKey(args: {
  template: string
  claimId: string
  payload?: Record<string, string>
  /** Tagesscheibe als YYYY-MM-DD; injizierbar, damit Tests nicht an der Uhr haengen. */
  tag: string
}): string {
  return [args.template, args.claimId, payloadHash(args.payload), args.tag].join(':')
}

/**
 * Registry-Kanal -> Outbox-Kanal. Der Wert ist ein LABEL fuer Reporting/Filter:
 * was tatsaechlich rausgeht, entscheidet weiterhin `sendCommunication` anhand der
 * Registry (`whatsapp+email` sendet beides). Deshalb wird der kombinierte Kanal auf
 * seinen primaeren abgebildet, statt eine Versand-Entscheidung vorwegzunehmen.
 */
export function mapToOutboxKanal(channel: CommunicationChannel | undefined): OutboxChannel {
  switch (channel) {
    case 'email':
      return 'email'
    case 'portal':
    case 'intern':
      return 'in_app'
    case 'whatsapp':
    case 'whatsapp+email':
    default:
      return 'whatsapp'
  }
}

/** Tagesscheibe in Europe/Berlin — der Kalendertag des Nutzers, nicht UTC. */
export function berlinTag(now: Date): string {
  // en-CA liefert YYYY-MM-DD (sortierbar); die Zeitzone macht die Tagesgrenze korrekt.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
