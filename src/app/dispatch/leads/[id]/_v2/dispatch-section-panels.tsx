'use client'

// P2d-3 (dispatch-config-unify): Sektion-Injektion (Mechanismus B) — bespoke
// Panels NACH den Feldern einer Sektion im flachen DispatchLeadForm. Anders als
// die Field-Overrides (ein Feld -> eine Rich-Komponente) hängen diese Panels an
// einer SEKTION, nicht an einem einzelnen Feld. Der geteilte FieldRenderer bleibt
// rein (Kunden-Flow!); die Panels sind Dispatcher-only und self-saven jeweils.

import type { ReactNode } from 'react'
import { UnfallskizzeCard } from '../_phases/UnfallskizzeCard'
import { ZeugenKontakteEditor, type ZeugenKontakt } from '../_components/ZeugenKontakteEditor'
import { DispatchWunschterminPanel } from './DispatchWunschterminPanel'
import Phase1PersonenForm from '../_phases/Phase1PersonenForm'
import BkatAnalysePanel from '../_phases/BkatAnalysePanel'
import type { DispatchSectionPanelKey } from './dispatch-section-panel-keys'
import { ParkplatzKameraToggle } from './ParkplatzKameraToggle'
import { SectionCard } from '@/components/shared/SectionCard'
import { CardentityButton } from '@/components/cardentity/CardentityButton'
import { requestCardentityTypBForLead } from '../_actions/cardentity'
import { EigentuemerTypPanel } from './EigentuemerTypPanel'
import { DispatchGrueneKartePanel } from './DispatchGrueneKartePanel'

export type DispatchSectionCtx = {
  leadId: string
  // Volle Lead-Row als Quelle der Initialwerte für die Panels.
  lead: Record<string, unknown>
  // Live-Formwerte (segmented liegen als 'true'/'false'-String vor) — für
  // bedingte Panels wie den Zeugen-Editor (nur wenn zeugen === 'true').
  values: Record<string, unknown>
}

function zeugenKontakteAus(lead: Record<string, unknown>): ZeugenKontakt[] {
  const raw = lead.zeugen_kontakte
  return Array.isArray(raw) ? (raw as ZeugenKontakt[]) : []
}

// Quelle B — Anzeige der unverbindlichen Selbst-Auswertung.
// tier-Klartext spiegelt resolveTier() aus claimondo-marketing/lib/check/result-model.ts;
// die Paragraphen stehen dort im Kommentar (voll = §249, quote = §254).
const TIER_LABEL: Record<string, string> = {
  voll: 'Vollanspruch gegen die Gegenseite (§ 249)',
  quote: 'Anteiliger Anspruch — Teilschuld angegeben (§ 254)',
  pruefen: 'Schuldfrage offen — Prüfung nötig',
  kasko: 'Eigenverschulden — Kasko-Weg',
}

const ANTWORT_LABEL: Record<string, Record<string, string>> = {
  schuld: {
    gegner: 'Schuld: der Unfallgegner',
    teils: 'Schuld: teils ich, teils der Gegner',
    unklar: 'Schuld: noch unklar',
    selbst: 'Schuld: ich selbst',
  },
  unfall_her: {
    unter_woche: 'Unfall: vor weniger als 1 Woche',
    bis_monat: 'Unfall: vor 1–4 Wochen',
    ueber_monat: 'Unfall: vor über einem Monat',
  },
  gutachten: {
    nein: 'Gutachten: noch keins',
    versicherung: 'Gutachten: die gegnerische Versicherung will eins schicken',
    ja: 'Gutachten: liegt vor',
  },
}

type AuswertungAnzeige = { tier: string; antwortZeilen: string[]; erstelltAm: string | null }

/** Liest leads.auswertung_unverbindlich defensiv — das Feld ist jsonb und kann alles enthalten. */
function auswertungAus(lead: Record<string, unknown>): AuswertungAnzeige | null {
  const roh = lead.auswertung_unverbindlich
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null
  const obj = roh as Record<string, unknown>
  const tier = typeof obj.tier === 'string' ? obj.tier : null
  if (!tier) return null

  const antworten =
    obj.antworten && typeof obj.antworten === 'object' && !Array.isArray(obj.antworten)
      ? (obj.antworten as Record<string, unknown>)
      : {}
  const antwortZeilen = Object.entries(antworten)
    .map(([feld, wert]) => (typeof wert === 'string' ? ANTWORT_LABEL[feld]?.[wert] : undefined))
    .filter((z): z is string => Boolean(z))

  // timeZone explizit: ohne sie rendert Server (UTC) und Client (lokal) verschieden
  // -> Hydration-Mismatch (React #418).
  let erstelltAm: string | null = null
  if (typeof obj.erstellt_am === 'string') {
    const d = new Date(obj.erstellt_am)
    if (!Number.isNaN(d.getTime())) {
      erstelltAm = d.toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    }
  }
  return { tier, antwortZeilen, erstelltAm }
}

// Record<DispatchSectionPanelKey, …> erzwingt: Map-Keys == Liste im keys-Modul.
const SEKTION_PANELS: Record<DispatchSectionPanelKey, (ctx: DispatchSectionCtx) => ReactNode[]> = {
  // Unfallhergang: KI-Unfallskizze + (bedingt) Zeugen-Kontakte.
  unfall: (ctx) => {
    const panels: ReactNode[] = [
      <UnfallskizzeCard
        key="unfallskizze"
        leadId={ctx.leadId}
        unfallhergang={(ctx.lead.unfallhergang as string | null) ?? null}
        initialSvg={(ctx.lead.unfallskizze_svg as string | null) ?? null}
        initialBestaetigt={(ctx.lead.unfallskizze_bestaetigt as boolean | null) ?? false}
        initialGeneriertAm={(ctx.lead.unfallskizze_generiert_am as string | null) ?? null}
      />,
    ]
    // Zeugen-Editor nur wenn das (Live-)zeugen-Feld auf Ja steht.
    if (ctx.values.zeugen === 'true') {
      panels.push(
        <ZeugenKontakteEditor
          key="zeugen"
          leadId={ctx.leadId}
          initialKontakte={zeugenKontakteAus(ctx.lead)}
        />,
      )
    }
    // P4-D: Grüne-Karte-Anfrage nur bei Auslandskennzeichen (Live-Feld).
    if (ctx.values.auslandskennzeichen === 'true') {
      panels.push(
        <DispatchGrueneKartePanel
          key="gruene-karte"
          leadId={ctx.leadId}
          initialAngefragtAm={(ctx.lead.gegner_versicherung_anfrage_datum as string | null) ?? null}
        />,
      )
    }
    // Quelle B: die unverbindliche Selbst-Auswertung aus der Anspruchsprüfung.
    // Read-only wie das Werkstatt-KVA-Panel — was hier steht, sind drei Klicks des
    // Kunden, kein Gutachten. Der Hinweis MUSS mitlaufen (Auftrag: "in jeder Ansicht,
    // die den Wert zeigt, muss erkennbar bleiben, dass er unverbindlich ist").
    // Bewusst OHNE Eurobetrag: die im Funnel gezeigten Spannen sind statisch.
    // Conditional-render: ohne Auswertung erscheint gar nichts.
    const auswertung = auswertungAus(ctx.lead)
    if (auswertung) {
      panels.push(
        <SectionCard
          key="auswertung-unverbindlich"
          title="Selbst-Einschätzung des Kunden (unverbindlich)"
          subtitle="Aus der Anspruchsprüfung — drei angeklickte Antworten, kein Gutachten und keine Zusage"
        >
          <p className="text-body font-semibold text-claimondo-navy">
            {TIER_LABEL[auswertung.tier] ?? auswertung.tier}
          </p>
          {auswertung.antwortZeilen.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {auswertung.antwortZeilen.map((z) => (
                <li key={z} className="text-body-sm text-claimondo-shield">
                  {z}
                </li>
              ))}
            </ul>
          ) : null}
          {auswertung.erstelltAm ? (
            <p className="text-caption text-claimondo-ondo/70 mt-2">
              Angegeben am {auswertung.erstelltAm} — eine Einschätzung von damals, nicht von heute
            </p>
          ) : null}
        </SectionCard>,
      )
    }
    return panels
  },
  // Termin & Besichtigung: Wunschtag-Pills (SV-Slot-Filter).
  termin_sv: (ctx) => [
    <DispatchWunschterminPanel
      key="wunschtermin-wochentage"
      leadId={ctx.leadId}
      initialWochentage={
        Array.isArray(ctx.lead.wunschtermin_wochentage)
          ? (ctx.lead.wunschtermin_wochentage as number[])
          : []
      }
    />,
  ],
  // Schaden: bei Personenschaden -> verletzte Personen erfassen (reuse Phase1PersonenForm).
  // BKAT-Analyse: immer angeboten, autoStart=false — kein Auto-Fire beim Mount
  // (Spec §9 / Cardentity-Lehre: paid LLM/OCR-Call nur auf Button-Klick).
  schaden: (ctx) => {
    const nodes: ReactNode[] = []
    if (ctx.values.personenschaden_flag === 'true') {
      nodes.push(<Phase1PersonenForm key="personen" leadId={ctx.leadId} />)
    }
    nodes.push(
      <BkatAnalysePanel
        key="bkat"
        leadId={ctx.leadId}
        autoStart={false}
        polizeiVorOrt={ctx.values.polizei_vor_ort === 'true' ? true : ctx.values.polizei_vor_ort === 'false' ? false : null}
        initialUnfallart={(ctx.lead.bkat_unfallart as string | null) ?? null}
      />,
    )
    if (ctx.values.schadentyp === 'parkplatz') {
      nodes.push(
        <ParkplatzKameraToggle
          key="parkplatz-kamera"
          leadId={ctx.leadId}
          initial={(ctx.lead.parkplatz_kamera as boolean | null) ?? null}
        />,
      )
    }
    // Werkstatt-KVA: read-only Anzeige des Kostenvoranschlags (Werkstatt-Schaetzung).
    // Brutto hat Vorrang; wenn beide null -> nichts rendern (conditional-render).
    const kvaBrutto = (ctx.lead.kostenvoranschlag_brutto as number | null) ?? null
    const kvaNetto = (ctx.lead.kostenvoranschlag_netto as number | null) ?? null
    const kvaBetrag = kvaBrutto ?? kvaNetto
    if (kvaBetrag !== null) {
      const kvaFormatiert = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(kvaBetrag)
      nodes.push(
        <SectionCard
          key="werkstatt-kva"
          title="Kostenvoranschlag (Werkstatt)"
          subtitle="Schätzung der Werkstatt vor SV-Gutachten — kein Ersatz für den Gutachtenwert"
        >
          <p className="text-body font-semibold text-claimondo-navy">
            {kvaFormatiert}
          </p>
          <p className="text-caption text-claimondo-ondo/70 mt-1">
            {kvaBrutto !== null ? 'Bruttobetrag (inkl. MwSt.)' : 'Nettobetrag (ohne MwSt.)'}
            {' — '}Schätzung
          </p>
        </SectionCard>,
      )
    }
    return nodes
  },
  // Fahrzeug: Cardentity-Abruf (manuell, ~15-EUR-Confirm, idempotent).
  // Task 6b (Eigentuemer-Typ) haengt hier ebenfalls rein.
  fahrzeug: (ctx) => [
    <SectionCard key="cardentity" title="Fahrzeugdaten & Vorschäden (Cardentity)">
      <CardentityButton
        action={() => requestCardentityTypBForLead(ctx.leadId)}
        finVorhanden={!!ctx.lead.fin}
        initial={{
          fetchedAt: (ctx.lead.cardentity_enriched_at as string | null) ?? null,
          vorschadenVorhanden: (ctx.lead.hat_vorschaeden as boolean | null) ?? null,
          vorschadenAnzahl: (ctx.lead.vorschaden_anzahl as number | null) ?? null,
          letzterVorschadenDatum: (ctx.lead.vorschaden_letzter_datum as string | null) ?? null,
        }}
      />
    </SectionCard>,
    <EigentuemerTypPanel
      key="eigentuemer"
      leadId={ctx.leadId}
      initialFinanzierungLeasing={(ctx.lead.finanzierung_leasing as string | null) ?? null}
      initialVorsteuer={(ctx.lead.vorsteuerabzugsberechtigt as boolean | null) ?? null}
    />,
  ],
}

export function renderDispatchSectionPanels(phaseKey: string, ctx: DispatchSectionCtx): ReactNode[] {
  const fn = SEKTION_PANELS[phaseKey as DispatchSectionPanelKey]
  return fn ? fn(ctx) : []
}
