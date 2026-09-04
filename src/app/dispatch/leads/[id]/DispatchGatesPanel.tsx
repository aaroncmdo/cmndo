'use client'

// P2c (dispatch-config-unify): Gates -> nicht-blockierende Flags.
// Die heutige Auto-Disqualifikation (hard-gate.ts) + Qualifizierung (q1-q8)
// werden NICHT mehr zum UI-Lock. Stattdessen: Warn-Badges (der Dispatcher
// entscheidet selbst) + ein read-only Vollstaendigkeits-Indikator (welche
// Bedingungen fuer Flowlink/Convert noch offen sind). Liest die LIVE-Form-Werte,
// damit sich Badges/Indikator beim Tippen aktualisieren. Spec §6.

import { computeQualificationStatus, type LeadLike } from './_lib/qualification-engine'

type Vals = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const bool = (v: unknown): boolean | undefined => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined)

// Live-Form-Werte (segmented = 'true'/'false'-Strings) + DB-Lead (nicht-Form-Felder
// wie fahrerflucht/parkplatz_kamera) -> LeadLike fuer die Qualifizierungs-Engine.
function toLeadLike(values: Vals, lead: Vals): LeadLike {
  return {
    ...(lead as LeadLike),
    unfallhergang: str(values.unfallhergang),
    schuldfrage: str(values.schuldfrage),
    aufklaerung_teilschuld_bestaetigt: bool(values.aufklaerung_teilschuld_bestaetigt),
    schaden_sichtbar: bool(values.schaden_sichtbar),
    personenschaden_flag: bool(values.personenschaden_flag),
    mietwagen_flag: bool(values.mietwagen_flag),
    nutzungsausfall: bool(values.nutzungsausfall),
    polizei_vor_ort: bool(values.polizei_vor_ort),
    schadentyp: str(values.schadentyp),
    gegner_kennzeichen: str(values.gegner_kennzeichen),
    kennzeichen: str(values.kennzeichen),
    fahrzeug_hersteller: str(values.fahrzeug_hersteller),
    fahrzeug_modell: str(values.fahrzeug_modell),
    fahrzeug_fahrbereit: bool(values.fahrzeug_fahrbereit),
    besichtigungsort_adresse: str(values.besichtigungsort_adresse),
  }
}

const Q_LABELS: Record<string, string> = {
  q1_schuldfrage: 'Schuldfrage geklärt',
  q2_schaden: 'Schaden erfasst',
  q3_polizei: 'Polizei-Frage beantwortet',
  q4_schadentyp: 'Schadentyp gewählt',
  q5_svTermin: 'SV-Termin reserviert',
  q6_gegnerKz: 'Gegner-KZ / Fahrerflucht geklärt',
  q7_fahrzeug: 'Fahrzeug-Stammdaten',
  q8_schadenhergang: 'Schadenshergang (bei fahrbereit)',
}

export default function DispatchGatesPanel({ values, lead }: { values: Vals; lead: Vals }) {
  const leadLike = toLeadLike(values, lead)
  // SV-Termin (q5) ownt der DispatchShell/SvDispatchPanel (P2d) — hier nicht live;
  // null = q5 zeigt sich als offen, blockt aber nichts.
  const qual = computeQualificationStatus(leadLike, null)

  // Warn-Badges = die frueheren Hard-Gate-Disqualifikations-Fakten, jetzt nur Hinweis.
  const warnings: string[] = []
  // Kasko-WB Phase 1: Bindungsstatus sichtbar machen (Scan: der Dispatcher sah den Grund nie).
  const kaskoTarif = [str(lead.eigene_versicherung_name), str(lead.eigene_kasko_tarif_name)].filter(Boolean).join(' · ')
  const istKasko = values.schuldfrage === 'eigenverantwortung' && str(lead.eigene_versicherung) === 'ja'
  // Abnahme 04.09. (Prod-Lauf, Nebenbefund): ein Kasko-Kunde mit FREIER Werkstattwahl ist ein legitimer
  // Reparaturkunde — die Eigenverschulden-Warnung ("ggf. manuell disqualifizieren") laedt dort zum falschen Klick ein.
  const kaskoFrei = istKasko && lead.freie_werkstattwahl === true
  if (values.schuldfrage === 'eigenverantwortung' && !kaskoFrei)
    warnings.push('Eigenverschulden — i.d.R. kein Haftpflicht-Anspruch. Prüfen / ggf. manuell disqualifizieren.')
  if (istKasko && lead.freie_werkstattwahl === false)
    warnings.push(`Kasko mit Werkstattbindung${kaskoTarif ? ` (${kaskoTarif})` : ''} — keine Werkstatt-Vermittlung, der Versicherer benennt die Werkstatt.`)
  if (istKasko && lead.freie_werkstattwahl == null)
    warnings.push(`Kasko — Werkstattbindung noch nicht geklärt${kaskoTarif ? ` (${kaskoTarif})` : ''}. Bitte Tarif erfassen oder mit dem Kunden klären.`)
  if (
    values.schaden_sichtbar === 'false' &&
    values.personenschaden_flag !== 'true' &&
    values.mietwagen_flag !== 'true' &&
    values.nutzungsausfall !== 'true'
  )
    warnings.push('Kein sichtbarer Schaden und keine Personenschaden-/Mietwagen-/Nutzungsausfall-Flags.')

  const manuellDisqualifiziert = values.disqualifiziert === 'true'

  const offene = (Object.keys(Q_LABELS) as Array<keyof typeof Q_LABELS>).filter(
    (k) => !qual[k as keyof typeof qual],
  )

  return (
    <div className="mb-4 flex flex-col gap-2 max-w-3xl">
      {manuellDisqualifiziert && (
        <div className="rounded-ios-lg bg-danger-soft border border-danger/30 px-3 py-2 text-sm font-semibold text-danger-strong">
          Manuell disqualifiziert
        </div>
      )}
      {lead.disqualifiziert === true && str(lead.disqualifiziert_grund_key) && (
        <div className="rounded-ios-lg bg-warning-soft border border-warning/30 px-3 py-2 text-sm text-warning-strong">
          Disqualifiziert: {lead.disqualifiziert_grund_key === 'werkstattbindung' ? 'Kasko mit Werkstattbindung' : lead.disqualifiziert_grund_key === 'eigenverschulden' ? 'Eigenverschulden' : String(lead.disqualifiziert_grund_key)}
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="rounded-ios-lg bg-warning-soft border border-warning/30 px-3 py-2 text-sm text-warning-strong">
          <span className="font-semibold">Achtung:</span> {w}
        </div>
      ))}

      {/* Vollstaendigkeits-Indikator — INFO, kein Block */}
      <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-claimondo-navy">
            Vollständigkeit: {qual.completedCount}/8
          </span>
          <span className={qual.canSendFlowLink ? 'text-success font-medium' : 'text-claimondo-ondo/60'}>
            {qual.canSendFlowLink ? 'Flowlink-bereit ✓' : 'Flowlink: noch offen'}
          </span>
        </div>
        {offene.length > 0 && (
          <div className="mt-1 text-xs text-claimondo-ondo/70">
            Offen: {offene.map((k) => Q_LABELS[k]).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
