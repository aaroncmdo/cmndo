// AAR-444: Off-Topic-Preflight für den Kunden-FAQ-Bot.
//
// Fängt offensichtliche Claimondo-Interna- und Fremdfall-Fragen ab, bevor
// überhaupt ein Claude-Call passiert. Spart Latenz und Kosten und härtet
// den Bot zusätzlich zum System-Prompt (der trotzdem weiter die harte
// Linie zieht, weil Keyword-Matching nur offensichtliche Fälle erwischt).

export type OffTopicCheck =
  | { blocked: false }
  | { blocked: true; reason: string; kategorie: OffTopicKategorie; antwort: string }

export type OffTopicKategorie =
  | 'claimondo_interna'
  | 'fremd_fall'
  | 'meta_ki'

// Keyword-Listen bewusst klein gehalten — der System-Prompt übernimmt die
// Feinjustierung. Hier nur Fälle, wo das Wort schon eindeutig Off-Topic ist.
const CLAIMONDO_INTERNA_KEYWORDS: readonly string[] = [
  'claimondo',
  'euer unternehmen',
  'eure firma',
  'ihre firma',
  'ihr unternehmen',
  'provision',
  'provisionen',
  'wie verdient ihr',
  'was verdient ihr',
  'was kostet ihr',
  'was kostet claimondo',
  'geschäftsmodell',
  'investor',
  'investoren',
  'finanzierung',
  'gründer',
  'aaron sprafke',
  'mitarbeiter',
  'mitarbeiterliste',
  'organigramm',
  'partner-kanzlei',
  'partnerkanzlei',
  'partner-gutachter',
  'partnergutachter',
  'welche kanzlei',
  'welcher gutachter',
  'konkurrenz',
  'wettbewerb',
  'wettbewerber',
]

const FREMD_FALL_KEYWORDS: readonly string[] = [
  'andere kunden',
  'anderer kunde',
  'andere mandanten',
  'wie viele kunden',
  'wie viele fälle',
  'wie viele faelle',
  'bei anderen',
  'anderer fall',
  'anderen fall',
]

const META_KI_KEYWORDS: readonly string[] = [
  'bist du eine ki',
  'bist du ein bot',
  'bist du claude',
  'welches modell',
  'welches llm',
  'welche ki',
  'bist du ein mensch',
]

const ANTWORT_INTERNA =
  'Das sind interne Informationen, die ich nicht mit Ihnen teilen darf. ' +
  'Für Fragen dazu wenden Sie sich bitte an Ihren Kundenbetreuer.'

const ANTWORT_FREMD_FALL =
  'Ich kann ausschließlich Auskunft zu Ihrer eigenen Akte geben. ' +
  'Zu anderen Fällen habe ich keinerlei Informationen.'

const ANTWORT_META_KI =
  'Ja, ich bin ein KI-Assistent, der Ihnen bei Fragen zu Ihrer Akte hilft. ' +
  'Was möchten Sie wissen?'

/**
 * Preflight-Check auf offensichtliche Off-Topic-Fragen. Wenn blocked=true,
 * sollte der Caller die enthaltene Standard-Antwort zurückgeben, ohne
 * Claude anzusprechen.
 *
 * Nur für `rolle='kunde'` — KB darf alles fragen.
 */
export function checkOffTopic(frage: string): OffTopicCheck {
  const normalized = frage.toLowerCase()

  for (const kw of CLAIMONDO_INTERNA_KEYWORDS) {
    if (normalized.includes(kw)) {
      return {
        blocked: true,
        reason: `claimondo_interna:${kw}`,
        kategorie: 'claimondo_interna',
        antwort: ANTWORT_INTERNA,
      }
    }
  }

  for (const kw of FREMD_FALL_KEYWORDS) {
    if (normalized.includes(kw)) {
      return {
        blocked: true,
        reason: `fremd_fall:${kw}`,
        kategorie: 'fremd_fall',
        antwort: ANTWORT_FREMD_FALL,
      }
    }
  }

  for (const kw of META_KI_KEYWORDS) {
    if (normalized.includes(kw)) {
      return {
        blocked: true,
        reason: `meta_ki:${kw}`,
        kategorie: 'meta_ki',
        antwort: ANTWORT_META_KI,
      }
    }
  }

  return { blocked: false }
}
