'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type MitteilungTyp =
  | 'neuer_auftrag'
  | 'termin_bestaetigt'
  | 'termin_geaendert'
  | 'kunde_dokument_hochgeladen'
  | 'kunde_chat_nachricht'
  | 'vorschaden_warnung'
  | 'gutachten_erinnerung'
  | 'qc_bestanden'
  | 'qc_nachbesserung'
  | 'kanzlei_as_gesendet'
  | 'kanzlei_regulierung'
  | 'kanzlei_zahlung'
  | 'paket_fast_voll'
  | 'guthaben_niedrig'

interface MitteilungExtras {
  kunde_name?: string
  schadentyp?: string
  adresse?: string
  datum?: string
  uhrzeit?: string
  dokument_name?: string
  nachricht_vorschau?: string
  vorschaden_anzahl?: number
  kommentar?: string
  betrag?: number
  faelle_genutzt?: number
  faelle_gesamt?: number
  guthaben?: number
  fall_nummer?: string | number
}

const DRINGEND_TYPEN: MitteilungTyp[] = [
  'vorschaden_warnung',
  'qc_nachbesserung',
]

/**
 * Erstellt eine Gutachter-Mitteilung.
 * Verwendet den Admin-Client (service role) da RLS Inserts fuer
 * normale User blockiert.
 */
export async function createGutachterMitteilung(
  sv_id: string,
  typ: MitteilungTyp,
  fall_id: string | null,
  extras: MitteilungExtras = {},
) {
  const supabase = createAdminClient()

  const { titel, nachricht } = buildMessage(typ, extras)
  const link = fall_id ? `/gutachter/fall/${fall_id}` : null

  const { error } = await supabase.from('gutachter_mitteilungen').insert({
    sv_id,
    fall_id,
    typ,
    titel,
    nachricht,
    gelesen: false,
    dringend: DRINGEND_TYPEN.includes(typ),
    link,
  })

  if (error) {
    console.error('[Mitteilung] Fehler:', error.message, { sv_id, typ, fall_id })
  }
}

function buildMessage(
  typ: MitteilungTyp,
  e: MitteilungExtras,
): { titel: string; nachricht: string } {
  const fallRef = e.fall_nummer ? ` (Fall #${e.fall_nummer})` : ''

  switch (typ) {
    case 'neuer_auftrag':
      return {
        titel: 'Neuer Auftrag',
        nachricht: `Neuer Auftrag: ${e.kunde_name ?? 'Kunde'}${fallRef}. ${e.schadentyp ?? ''} ${e.adresse ? `in ${e.adresse}` : ''}.`.trim(),
      }

    case 'termin_bestaetigt':
      return {
        titel: 'Termin bestätigt',
        nachricht: `Termin bestätigt${fallRef}: ${e.datum ?? ''} ${e.uhrzeit ?? ''}. ${e.kunde_name ?? ''} ${e.adresse ? `in ${e.adresse}` : ''}.`.trim(),
      }

    case 'termin_geaendert':
      return {
        titel: 'Termin geändert',
        nachricht: `Termin wurde geändert${fallRef}: Neuer Termin ${e.datum ?? ''} ${e.uhrzeit ?? ''}.`.trim(),
      }

    case 'kunde_dokument_hochgeladen':
      return {
        titel: 'Neues Dokument',
        nachricht: `${e.kunde_name ?? 'Kunde'} hat ${e.dokument_name ?? 'ein Dokument'} hochgeladen${fallRef}.`,
      }

    case 'kunde_chat_nachricht':
      return {
        titel: `Neue Nachricht von ${e.kunde_name ?? 'Kunde'}`,
        nachricht: e.nachricht_vorschau
          ? `${e.nachricht_vorschau.slice(0, 120)}${e.nachricht_vorschau.length > 120 ? '...' : ''}`
          : `Neue Chat-Nachricht${fallRef}.`,
      }

    case 'vorschaden_warnung':
      return {
        titel: 'VORSCHADEN GEFUNDEN',
        nachricht: `${e.vorschaden_anzahl ?? 'Mehrere'} Vorschäden gefunden${fallRef}. Bitte vor Gutachtenerstellung berücksichtigen!`,
      }

    case 'gutachten_erinnerung':
      return {
        titel: 'Gutachten ausstehend',
        nachricht: `Bitte laden Sie das Gutachten für ${e.kunde_name ?? 'den Kunden'} hoch${fallRef}. Die Besichtigung liegt bereits zurück.`,
      }

    case 'qc_bestanden':
      return {
        titel: 'QC bestanden',
        nachricht: `Qualitätsprüfung bestanden${fallRef}. Die Akte wurde an die Kanzlei übergeben.`,
      }

    case 'qc_nachbesserung':
      return {
        titel: 'Nachbesserung erforderlich',
        nachricht: `Nachbesserung erforderlich${fallRef}${e.kommentar ? `: ${e.kommentar}` : '.'}`,
      }

    case 'kanzlei_as_gesendet':
      return {
        titel: 'Anspruchsschreiben gesendet',
        nachricht: `Anspruchsschreiben wurde gesendet${fallRef}. 14-Tage-Frist laeuft.`,
      }

    case 'kanzlei_regulierung':
      return {
        titel: 'Regulierung angekuendigt',
        nachricht: `Versicherung hat Regulierung angekuendigt${fallRef}. Fall wird bald abgeschlossen.`,
      }

    case 'kanzlei_zahlung':
      return {
        titel: 'Zahlung eingegangen',
        nachricht: `Zahlung${e.betrag ? ` von ${e.betrag.toLocaleString('de-DE')} EUR` : ''} eingegangen${fallRef}.`,
      }

    case 'paket_fast_voll':
      return {
        titel: 'Paket fast ausgeschoepft',
        nachricht: `${e.faelle_genutzt ?? '?'} von ${e.faelle_gesamt ?? '?'} Faellen genutzt. Bitte Paket upgraden oder Kontakt aufnehmen.`,
      }

    case 'guthaben_niedrig':
      return {
        titel: 'Guthaben niedrig',
        nachricht: `Aktuelles Guthaben nur noch ${e.guthaben?.toLocaleString('de-DE') ?? '?'} EUR. Bitte aufstocken.`,
      }

    default:
      return { titel: 'Benachrichtigung', nachricht: 'Neue Mitteilung.' }
  }
}
