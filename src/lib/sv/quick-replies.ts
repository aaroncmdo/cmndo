// AAR-383: Context-aware Quick-Replies für den Fokus-Chat.
// Erzeugt 3-5 situativ passende Quick-Reply-Templates abhängig vom
// Session-Status, der ETA und fehlenden Dokumenten. Templates enthalten
// Platzhalter die via `resolveTemplate` mit Kontext-Werten ersetzt werden.

import type { SessionStatus } from '@/lib/types/field-modus'

export interface QuickReplyContext {
  sessionStatus: SessionStatus
  etaMinutes: number | null
  /** Erwartete Termin-Startzeit, für „bin pünktlich"/„verspätet"-Logik. */
  terminStartTime?: Date
  terminAddress: string
  customerName: string
  /** Aus pflichtdokumente.status='ausstehend' + Katalog. Optional. */
  fehlendeDokumente?: string[]
}

export type QuickReplyCategory = 'status' | 'question' | 'polite' | 'urgent'

export interface QuickReply {
  id: string
  emoji: string
  label: string
  /** Roh-Template mit {placeholder}, wie es im Button erscheint. */
  template: string
  /** Bereits mit Kontext-Werten gefülltes finales Text-Message. */
  resolvedText: string
  category: QuickReplyCategory
}

/**
 * Ersetzt `{etaMinutes}`, `{terminAddress}`, `{customerName}`,
 * `{delay}`, `{fehlendeDokumente}` in Templates durch aktuelle Kontext-Werte.
 */
export function resolveTemplate(
  template: string,
  ctx: QuickReplyContext,
): string {
  const delay =
    ctx.etaMinutes != null && ctx.etaMinutes < 0
      ? Math.abs(ctx.etaMinutes)
      : 0
  const fehlende = (ctx.fehlendeDokumente ?? []).join(', ')
  return template
    .replace(/\{etaMinutes\}/g, String(ctx.etaMinutes ?? '?'))
    .replace(/\{terminAddress\}/g, ctx.terminAddress || '—')
    .replace(/\{customerName\}/g, ctx.customerName || 'Sie')
    .replace(/\{delay\}/g, String(delay))
    .replace(/\{fehlendeDokumente\}/g, fehlende || 'dem Fahrzeugschein')
}

function build(
  id: string,
  emoji: string,
  label: string,
  template: string,
  category: QuickReplyCategory,
  ctx: QuickReplyContext,
): QuickReply {
  return {
    id,
    emoji,
    label,
    template,
    resolvedText: resolveTemplate(template, ctx),
    category,
  }
}

/**
 * Gibt 3-5 kontextabhängig sortierte Quick-Replies zurück. „Eigene
 * Nachricht tippen" ist KEIN Eintrag hier — das Öffnen des Keyboards
 * passiert im UI direkt über einen separaten Button.
 */
export function getQuickReplies(ctx: QuickReplyContext): QuickReply[] {
  const { sessionStatus, etaMinutes } = ctx
  const replies: QuickReply[] = []

  // State: arrived (SV ist am Ort, Besichtigung startet / läuft)
  if (sessionStatus === 'arrived') {
    replies.push(
      build(
        'arrived-tuer',
        '🚪',
        'Bin vor der Tür',
        'Bin vor der Tür — können Sie öffnen?',
        'status',
        ctx,
      ),
      build(
        'arrived-geklingelt',
        '🔔',
        'Keiner zu Hause',
        'Haben geklingelt, keiner da — bitte rufen Sie mich kurz an.',
        'urgent',
        ctx,
      ),
      build(
        'arrived-los',
        '✅',
        'Kann losgehen',
        'Bin beim Fahrzeug, können loslegen.',
        'status',
        ctx,
      ),
    )
    if ((ctx.fehlendeDokumente?.length ?? 0) > 0) {
      replies.push(
        build(
          'arrived-foto',
          '📸',
          'Foto nötig',
          'Ich brauche noch ein Foto von {fehlendeDokumente}. Könnten Sie das bereitlegen?',
          'question',
          ctx,
        ),
      )
    }
  } else if (sessionStatus === 'finished') {
    // Besichtigung abgeschlossen — eher Abschluss-Kommunikation
    replies.push(
      build(
        'done-thanks',
        '🙏',
        'Danke!',
        'Danke für Ihre Zeit — Gutachten läuft bei uns, Sie hören von uns.',
        'polite',
        ctx,
      ),
      build(
        'done-eta',
        '⏱️',
        'Gutachten-ETA',
        'Das Gutachten liegt in 2–3 Werktagen bei Ihnen und der Versicherung.',
        'status',
        ctx,
      ),
    )
  } else {
    // Default: en_route / idle — abhängig von ETA
    if (etaMinutes == null) {
      replies.push(
        build(
          'en-route-unterwegs',
          '🚗',
          'Bin unterwegs',
          'Bin unterwegs zu Ihnen, melde mich wenn ich gleich da bin.',
          'status',
          ctx,
        ),
      )
    } else if (etaMinutes > 15) {
      replies.push(
        build(
          'eta-gt15-unterwegs',
          '🚗',
          `ETA ${etaMinutes} Min`,
          'Bin unterwegs, ETA ca. {etaMinutes} Minuten.',
          'status',
          ctx,
        ),
        build(
          'eta-gt15-15',
          '⏰',
          'In 15 Min da',
          'Bin in ca. 15 Minuten bei Ihnen.',
          'status',
          ctx,
        ),
        build(
          'eta-gt15-stau',
          '🚧',
          'Stau',
          'Stehe im Stau, komme ca. 10 Minuten später als geplant.',
          'urgent',
          ctx,
        ),
        build(
          'eta-gt15-adresse',
          '❓',
          'Adresse OK?',
          'Zur Sicherheit: Besichtigung {terminAddress} — stimmt das?',
          'question',
          ctx,
        ),
      )
    } else if (etaMinutes > 0) {
      // Endanflug
      replies.push(
        build(
          'eta-le5-5',
          '🎯',
          'In 5 Min da',
          'Bin in 5 Minuten bei Ihnen.',
          'status',
          ctx,
        ),
        build(
          'eta-le5-parken',
          '🅿️',
          'Parken?',
          'Wo kann ich bei Ihnen am besten parken?',
          'question',
          ctx,
        ),
        build(
          'eta-le5-anruf',
          '📱',
          'Anruf OK?',
          'Soll ich kurz klingeln oder Sie anrufen sobald ich da bin?',
          'question',
          ctx,
        ),
      )
    } else {
      // Überfällig (etaMinutes <= 0)
      replies.push(
        build(
          'overdue-gps',
          '🗺️',
          'Adresse nicht gefunden',
          'Ich finde die Adresse nicht — können Sie mir kurz Ihren Standort per WhatsApp schicken?',
          'urgent',
          ctx,
        ),
        build(
          'overdue-anruf',
          '📞',
          'Rückruf?',
          'Darf ich Sie kurz anrufen?',
          'question',
          ctx,
        ),
        build(
          'overdue-verspaetung',
          '⏰',
          'Verspätung',
          'Verspätung: ich bin in ca. {delay} Minuten bei Ihnen.',
          'urgent',
          ctx,
        ),
      )
    }
  }

  // Universelle höfliche Antworten ganz hinten (max. 5 insgesamt)
  const generics: QuickReply[] = [
    build(
      'generic-melde',
      '👋',
      'Melde mich gleich',
      'Melde mich gleich bei Ihnen.',
      'polite',
      ctx,
    ),
    build(
      'generic-danke',
      '🙏',
      'Danke',
      'Danke für die Info!',
      'polite',
      ctx,
    ),
  ]

  // Auffüllen bis 5, generische zuletzt
  const filler = generics.filter(
    (g) => !replies.some((r) => r.id === g.id),
  )
  return [...replies, ...filler].slice(0, 5)
}
