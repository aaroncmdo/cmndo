// AAR-498 N3: Event→Template-Mapping für WhatsApp-Channel. Quelle:
// Notion-Taxonomie §5 × template-sids.ts (bestehende Twilio-Content-Templates).
// Der Channel-Handler schlägt hier nach welches Template für welches Event×Rolle
// verwendet wird und wie die ContentVariables aus dem Payload gebaut werden.
//
// Nicht alle Events haben (noch) ein Template — z. B. nachricht.received fällt
// auf chat_fallback_kunde zurück, task.* nutzt Legacy-Text-Fallback. Wenn hier
// nichts passt, returnen wir null → der Channel-Handler marked die Delivery
// als skipped (skip_reason='no_template_mapping').

import { createAdminClient } from '@/lib/supabase/admin'
import type { TemplateName } from '@/lib/whatsapp/template-sids'
import type { EventType, Role } from '../types'

export type TemplateMapping = {
  template: TemplateName
  variables: Record<string, string>
}

type Resolver = (
  payload: Record<string, unknown>,
  ctx: { vorname?: string; portalLink: string },
) => Record<string, string>

type EventTemplate = { template: TemplateName; resolve: Resolver }

// Portal-Link pro Rolle (wird für Template-Variable 'Portal-Link' verwendet).
function portalLinkForRole(role: Role, fallId: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  switch (role) {
    case 'kunde':
      return fallId ? `${base}/kunde/faelle/${fallId}` : `${base}/kunde`
    case 'sachverstaendiger':
      return fallId ? `${base}/gutachter/fall/${fallId}` : `${base}/gutachter`
    case 'makler':
      return fallId ? `${base}/makler/akten/${fallId}` : `${base}/makler`
    case 'kundenbetreuer':
      return fallId ? `${base}/faelle/${fallId}` : `${base}/mitarbeiter`
    default:
      return fallId ? `${base}/faelle/${fallId}` : `${base}/admin`
  }
}

// Hilfsfunktion: String-Safe aus unknown-Feld.
function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

// ── Event × Rolle → Template + Variable-Resolver ─────────────────────────
// Lücken sind Absicht: Manche Events haben kein WA-Template (task.due an SV
// nutzt ggf. einen künftigen Template, chat-Events fallen auf Legacy zurück).
const MAPPING: Partial<Record<EventType, Partial<Record<Role, EventTemplate>>>> = {
  'fall.created': {
    kunde: {
      template: 'fall_eroeffnet',
      resolve: (_p, c) => ({ '1': c.vorname ?? '', '2': c.portalLink }),
    },
  },
  'fall.sv_assigned': {
    kunde: {
      template: 'sv_beauftragt',
      resolve: (p, c) => ({ '1': c.vorname ?? '', '2': s(p.svName), '3': c.portalLink }),
    },
  },
  'sa.flow_sent': {
    kunde: {
      template: 'flowlink_versand',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.svVorname),
        '3': s(p.svNachname),
        '4': s(p.datum),
        '5': s(p.uhrzeit),
        '6': s(p.flowLinkUrl),
      }),
    },
  },
  'sa.signed': {
    kunde: {
      template: 'info_nach_sa',
      resolve: (_p, c) => ({ '1': c.vorname ?? '', '2': c.portalLink }),
    },
  },
  'termin.sv_bestaetigt': {
    kunde: {
      template: 'termin_bestaetigt',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.datum),
        '3': s(p.uhrzeit),
        '4': s(p.svName),
        '5': s(p.ort),
        '6': c.portalLink,
      }),
    },
  },
  'termin.sv_storniert': {
    kunde: {
      template: 'termin_storniert',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.svName),
        '3': s(p.datum),
        '4': c.portalLink,
      }),
    },
  },
  'termin.erinnerung': {
    kunde: {
      template: 'reminder_24h',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.svName),
        '3': s(p.uhrzeit),
        '4': c.portalLink,
      }),
    },
  },
  'termin.sv_unterwegs': {
    kunde: {
      template: 'sv_losgefahren',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.svName),
        '3': String(typeof p.etaMinuten === 'number' ? p.etaMinuten : ''),
        '4': s(p.adresse),
        '5': s(p.trackingLink, c.portalLink),
      }),
    },
  },
  'termin.sv_verspaetet': {
    kunde: {
      template: 'sv_verspaetet',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.svName),
        '3': String(typeof p.verspaetungMinuten === 'number' ? p.verspaetungMinuten : ''),
        '4': c.portalLink,
      }),
    },
  },
  'termin.sv_angekommen': {
    kunde: {
      template: 'sv_angekommen',
      resolve: (p, c) => ({ '1': c.vorname ?? '', '2': s(p.svName) }),
    },
  },
  'videocall.geplant': {
    kunde: {
      template: 'kb_termin_bestaetigt',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.terminDatum),
        '3': s(p.uhrzeit),
        '4': 'Video',
        '5': s(p.meetLink),
        '6': c.portalLink,
      }),
    },
  },
  'videocall.erinnerung': {
    kunde: {
      template: 'kb_termin_reminder_1h',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.uhrzeit),
        '3': s(p.meetLink),
      }),
    },
  },
  'gutachten.fertig': {
    kunde: {
      template: 'gutachten_fertig',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.betrag, '—'),
        '3': c.portalLink,
      }),
    },
  },
  'kanzlei.uebergabe': {
    kunde: {
      template: 'kanzlei_uebergabe',
      resolve: (_p, c) => ({ '1': c.vorname ?? '', '2': c.portalLink }),
    },
  },
  'kanzlei.as_gesendet': {
    kunde: {
      template: 'as_gesendet',
      resolve: (_p, c) => ({ '1': c.vorname ?? '', '2': c.portalLink }),
    },
  },
  'regulierung.ergebnis': {
    kunde: {
      template: 'regulierung_angekuendigt',
      resolve: (_p, c) => ({ '1': c.vorname ?? '', '2': c.portalLink }),
    },
  },
  'regulierung.ruege_gesendet': {
    kunde: {
      template: 'kuerzung_eingetragen',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': String(typeof p.kuerzungBetragEur === 'number' ? p.kuerzungBetragEur : ''),
        '3': s(p.originalBetrag, '—'),
        '4': c.portalLink,
      }),
    },
  },
  'eskalation.vs_frist': {
    kunde: {
      template: 'eskalation_tag14',
      resolve: (_p, c) => ({ '1': c.vorname ?? '', '2': c.portalLink }),
    },
  },
  'auszahlung.veranlasst': {
    kunde: {
      template: 'zahlung_eingegangen',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': String(typeof p.betragEur === 'number' ? p.betragEur : ''),
        '3': c.portalLink,
      }),
    },
  },
  'dokument.fehlt': {
    kunde: {
      template: 'dokumente_upload_anfrage',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.uploadLink, c.portalLink),
      }),
    },
  },
  'nachricht.received': {
    kunde: {
      template: 'chat_fallback_kunde',
      resolve: (p, c) => ({
        '1': c.vorname ?? '',
        '2': s(p.inhaltPreview, '').slice(0, 200),
        '3': c.portalLink,
      }),
    },
  },
}

/**
 * Lädt Vorname des Empfängers (für Template-Variable '1') aus profiles.
 */
async function lookupVorname(userId: string): Promise<string | undefined> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('profiles')
      .select('anzeigename, vorname')
      .eq('id', userId)
      .maybeSingle()
    return (data?.anzeigename ?? data?.vorname) as string | undefined
  } catch {
    return undefined
  }
}

export async function resolveWhatsAppTemplate(
  eventType: EventType,
  role: Role,
  payload: Record<string, unknown>,
  recipientUserId: string,
  fallId: string | null,
): Promise<TemplateMapping | null> {
  const forEvent = MAPPING[eventType]
  if (!forEvent) return null
  const forRole = forEvent[role]
  if (!forRole) return null

  const [vorname] = await Promise.all([lookupVorname(recipientUserId)])
  const portalLink = portalLinkForRole(role, fallId)
  const variables = forRole.resolve(payload, { vorname, portalLink })
  return { template: forRole.template, variables }
}
