// AAR-939 · Monika-A-Flow · PURE Answers → AnfragePayload (kein DOM, vitest-testbar).
import type { Answers } from './flow-script'
import type { AnfragePayload, MonikaConfig, Attribution } from './types'

export interface SubmitMeta {
  page_url?: string
  consent_ts?: string
  honeypot?: string
  attribution?: Attribution
}

export function buildPayloadFromAnswers(answers: Answers, cfg: MonikaConfig, meta: SubmitMeta): AnfragePayload {
  const name = [answers.vorname?.trim(), answers.nachname?.trim()].filter(Boolean).join(' ')
  return {
    name,
    telefon: (answers.telefon ?? '').trim(),
    source: cfg.source,
    cluster: cfg.cluster ?? undefined,
    stadt_slug: cfg.stadtSlug ?? undefined,
    embed_site_slug: cfg.embedSiteSlug ?? undefined,
    site_token: cfg.siteToken ?? undefined,
    page_url: meta.page_url,
    consent_ts: meta.consent_ts,
    honeypot: meta.honeypot ?? '',
    anliegen: answers.anliegen,
    unfalltyp: answers.unfalltyp,
    schuld_einschaetzung: answers.schuld_einschaetzung,
    bewertungsgrund: answers.bewertungsgrund,
    wunsch_tag: answers.wunsch_tag,
    wunsch_zeit: answers.wunsch_zeit,
    ...(meta.attribution ?? {}),
  }
}
