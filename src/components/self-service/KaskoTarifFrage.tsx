'use client'

// Kasko-Werkstattbindung Phase 1 (Spec 2026-09-04 §6): EINE Frage-Komponente fuer FlowLink, Embed-Werkstatt-Finder
// und Kunde-Portal. Drei Stufen: Marke -> Tarif (nur bei wb_status=optional mit Tarifen) -> Marker am Schein
// (Fallback). Die Entscheidung selbst rechnet leiteWerkstattbindungAb (pure); der Aufrufer persistiert.
// Texte hardcodiert Deutsch (wie der ersetzte FlowWerkstattbindungStep) — i18n ist Follow-up.

import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card } from '@/components/primitives'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import { ladeKaskoMarken, ladeKaskoTarife } from '@/lib/kasko-wb/actions'
import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import type { KaskoMarke, KaskoTarif, KaskoTarifAuswahl, MarkerAntwort, WbErgebnis } from '@/lib/kasko-wb/types'

export type KaskoTarifFrageProps = {
  onErgebnis: (auswahl: KaskoTarifAuswahl, ergebnis: WbErgebnis) => void
  /** Aufrufer speichert gerade -> Buttons sperren. */
  busy?: boolean
  /** Embed: kleinere Ueberschriften, kein Seitentitel. */
  kompakt?: boolean
  schadenIstGlas?: boolean
  /** Kundensicht im Portal duzt (seit 31.08.), FlowLink und Embed siezen. Default 'sie'. */
  anrede?: 'sie' | 'du'
}

type Stufe = 'laden' | 'marke' | 'freitext' | 'tarif' | 'marker' | 'bestaetigen'

const DISCLAIMER = 'Maßgeblich sind Ihr Versicherungsschein und Ihre Versicherungsbedingungen (AKB). Tarifstand: CHECK24-Liste vom 20.07.2026.'
const DISCLAIMER_DU = 'Maßgeblich sind dein Versicherungsschein und deine Versicherungsbedingungen (AKB). Tarifstand: CHECK24-Liste vom 20.07.2026.'

function TarifBadge({ tarif }: { tarif: KaskoTarif }) {
  if (!tarif.hatWerkstattbindung) return <Badge tone="success" size="sm">freie Werkstattwahl</Badge>
  if (tarif.bindungsumfang === 'nur_glas') return <Badge tone="info" size="sm">Bindung nur bei Glas</Badge>
  return <Badge tone="warning" size="sm">Werkstattbindung</Badge>
}

export function KaskoTarifFrage({ onErgebnis, busy = false, kompakt = false, schadenIstGlas = false, anrede = 'sie' }: KaskoTarifFrageProps) {
  const du = anrede === 'du'
  const disclaimer = du ? DISCLAIMER_DU : DISCLAIMER
  const [stufe, setStufe] = useState<Stufe>('laden')
  const [marken, setMarken] = useState<KaskoMarke[]>([])
  const [markeId, setMarkeId] = useState<string | null>(null)
  const [freitext, setFreitext] = useState('')
  const [tarife, setTarife] = useState<KaskoTarif[]>([])
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  // Abnahme 04.09.: Vor der BINDENDEN Entscheidung (Disqualifikation + Mail + Endseite, kein Weg zurueck) einmal
  // bestaetigen lassen — bei 408 teils gleichnamigen Tarifen („Classic" vs. „Classic SELECT") ist ein Fehlklick realistisch.
  // Freie und unklare Antworten laufen ohne Zwischenschritt weiter.
  const [pending, setPending] = useState<{ auswahl: KaskoTarifAuswahl; ergebnis: WbErgebnis; zurueck: Stufe } | null>(null)

  const marke = useMemo(() => marken.find((m) => m.id === markeId) ?? null, [marken, markeId])
  const h = kompakt ? 'text-body font-bold text-claimondo-navy' : 'text-2xl font-semibold text-claimondo-navy mb-2 text-center'
  const p = kompakt ? 'mt-0.5 text-body-sm text-claimondo-shield/80' : 'text-claimondo-navy/60 text-sm mb-6 text-center'

  useEffect(() => {
    let alive = true
    ladeKaskoMarken().then((r) => {
      if (!alive) return
      if (r.ok && r.marken.length > 0) {
        setMarken(r.marken)
        setStufe('marke')
      } else {
        // Wissensbasis leer/nicht erreichbar: generische Marker-Frage statt leerem Screen (Spec §8).
        setLadeFehler(r.ok ? null : r.error)
        setStufe('freitext')
      }
    })
    return () => {
      alive = false
    }
  }, [])

  function abschluss(auswahl: KaskoTarifAuswahl, ergebnis: WbErgebnis, zurueck: Stufe = 'tarif') {
    if (ergebnis.freieWerkstattwahl === false) {
      setPending({ auswahl, ergebnis, zurueck })
      setStufe('bestaetigen')
      return
    }
    onErgebnis(auswahl, ergebnis)
  }

  async function waehleMarke(id: string | null) {
    if (busy) return
    setMarkeId(id)
    if (!id) return
    const m = marken.find((x) => x.id === id)
    if (!m) return
    const basis: KaskoTarifAuswahl = { markeId: m.id, markeName: m.marke, tarifId: null, tarifName: null, markerAntwort: null }
    if (m.wbStatus === 'keine' || m.wbStatus === 'standard') {
      abschluss(basis, leiteWerkstattbindungAb({ wbStatus: m.wbStatus, tarif: null, markerAntwort: null, schadenIstGlas }), 'marke')
      return
    }
    if (m.tarifAnzahl === 0) {
      setStufe('marker')
      return
    }
    const r = await ladeKaskoTarife(m.id)
    setTarife(r.ok ? r.tarife : [])
    setStufe(r.ok && r.tarife.length > 0 ? 'tarif' : 'marker')
  }

  function waehleTarif(t: KaskoTarif) {
    if (!marke || busy) return
    abschluss(
      { markeId: marke.id, markeName: marke.marke, tarifId: t.id, tarifName: t.anzeigename, markerAntwort: null },
      leiteWerkstattbindungAb({
        wbStatus: marke.wbStatus,
        tarif: { hatWerkstattbindung: t.hatWerkstattbindung, bindungsumfang: t.bindungsumfang },
        markerAntwort: null,
        schadenIstGlas,
      }),
      'tarif',
    )
  }

  function antworteMarker(antwort: MarkerAntwort) {
    if (busy) return
    const auswahl: KaskoTarifAuswahl = {
      markeId: marke?.id ?? null,
      markeName: marke?.marke ?? (freitext.trim() || null),
      tarifId: null,
      tarifName: null,
      markerAntwort: antwort,
    }
    abschluss(auswahl, leiteWerkstattbindungAb({ wbStatus: marke?.wbStatus ?? null, tarif: null, markerAntwort: antwort, schadenIstGlas }), 'marker')
  }

  if (stufe === 'laden') {
    return <p className="text-body-sm text-claimondo-navy/60">Versicherer werden geladen …</p>
  }

  if (stufe === 'marke') {
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>{du ? 'Bei welcher Versicherung ist dein Fahrzeug kaskoversichert?' : 'Bei welcher Versicherung ist Ihr Fahrzeug kaskoversichert?'}</h2>
          <p className={p}>
            {du
              ? 'Ob wir dir eine Werkstatt vermitteln dürfen, hängt von deinem Kasko-Tarif ab. Manche Tarife schreiben eine Partnerwerkstatt des Versicherers vor.'
              : 'Ob wir Ihnen eine Werkstatt vermitteln dürfen, hängt von Ihrem Kasko-Tarif ab. Manche Tarife schreiben eine Partnerwerkstatt des Versicherers vor.'}
          </p>
        </div>
        <div data-testid="kasko-tarif-marke">
          <VersichererSelect
            value={markeId}
            onChange={(id) => void waehleMarke(id)}
            versicherer={marken.map((m) => ({ id: m.id, name: m.marke }))}
            placeholder="Versicherung suchen …"
            ariaLabel="Kaskoversicherung wählen"
          />
        </div>
        <Button variant="bare" size="sm" onClick={() => setStufe('freitext')} disabled={busy}>
          <span data-testid="kasko-tarif-nicht-dabei">Meine Versicherung ist nicht dabei</span>
        </Button>
        <p className="text-caption text-claimondo-navy/50">{disclaimer}</p>
      </div>
    )
  }

  if (stufe === 'freitext') {
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>{du ? 'Wie heißt deine Kaskoversicherung?' : 'Wie heißt Ihre Kaskoversicherung?'}</h2>
          <p className={p}>
            {ladeFehler ? 'Die Tarifliste ist gerade nicht erreichbar. ' : ''}
            {du ? 'Wir prüfen die Werkstattbindung dann anhand deines Versicherungsscheins.' : 'Wir prüfen die Werkstattbindung dann anhand Ihres Versicherungsscheins.'}
          </p>
        </div>
        <input
          data-testid="kasko-freitext-input"
          value={freitext}
          onChange={(e) => setFreitext(e.target.value)}
          placeholder="Name der Versicherung"
          className="rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none"
        />
        <div className="flex gap-2">
          {marken.length > 0 && (
            <Button variant="ghost" size="md" onClick={() => setStufe('marke')} disabled={busy}>
              Zurück zur Liste
            </Button>
          )}
          <Button variant="navy" size="md" onClick={() => setStufe('marker')} disabled={busy || freitext.trim().length < 2}>
            <span data-testid="kasko-freitext-weiter">Weiter</span>
          </Button>
        </div>
      </div>
    )
  }

  if (stufe === 'tarif' && marke) {
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>{du ? `Welchen Tarif hast du bei ${marke.marke}?` : `Welchen Tarif haben Sie bei ${marke.marke}?`}</h2>
          <p className={p}>
            {du ? 'Der Tarifname steht auf deinem Versicherungsschein.' : 'Der Tarifname steht auf Ihrem Versicherungsschein.'}
            {marke.variantenHinweis ? ` ${marke.variantenHinweis}` : ''}
          </p>
          {marke.hinweis && <p className="text-caption text-warning-strong">{marke.hinweis}</p>}
        </div>
        <div className="flex flex-col gap-2">
          {tarife.map((t) => (
            <Card key={t.id} onPress={() => waehleTarif(t)} p={3} radius="lg" className="text-left hover:border-claimondo-ondo">
              <span className="flex items-center justify-between gap-3" data-testid="kasko-tarif-option">
                <span className="text-body-sm font-semibold text-claimondo-navy">{t.anzeigename}</span>
                <TarifBadge tarif={t} />
              </span>
              {t.verlaesslichkeit !== 'belegt' && (
                <span className="mt-1 block text-caption text-claimondo-navy/50">
                  {t.verlaesslichkeit === 'abgeleitet' ? 'Bindung aus der Bezeichnung abgeleitet – bitte im Schein prüfen.' : 'Nicht öffentlich belegt – bitte im Schein prüfen.'}
                </span>
              )}
            </Card>
          ))}
        </div>
        <Button variant="bare" size="sm" onClick={() => setStufe('marker')} disabled={busy}>
          <span data-testid="kasko-tarif-unbekannt">Ich weiß es nicht / mein Tarif steht nicht dabei</span>
        </Button>
        <p className="text-caption text-claimondo-navy/50">{disclaimer}</p>
      </div>
    )
  }

  if (stufe === 'bestaetigen' && pending) {
    const pnd = pending
    const bezeichnung = [pnd.auswahl.markeName, pnd.auswahl.tarifName].filter(Boolean).join(' · ') || 'Werkstattbindung'
    return (
      <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
        <div>
          <h2 className={h}>Bitte kurz bestätigen</h2>
          <p className={p}>
            {du ? 'Du hast ' : 'Sie haben '}
            {pnd.auswahl.markeName ?? (du ? 'deine Versicherung' : 'Ihre Versicherung')}
            {pnd.auswahl.tarifName ? ` mit dem Tarif „${pnd.auswahl.tarifName}“` : ''}
            {du
              ? ' angegeben. Wenn das stimmt, vermitteln wir dir keine Werkstatt, denn deine Versicherung benennt sie. Du bekommst von uns eine E-Mail mit den nächsten Schritten. Im Zweifel gilt, was auf deinem Versicherungsschein steht.'
              : ' angegeben. Wenn das stimmt, vermitteln wir Ihnen keine Werkstatt, denn Ihre Versicherung benennt sie. Sie bekommen von uns eine E-Mail mit den nächsten Schritten. Im Zweifel gilt, was auf Ihrem Versicherungsschein steht.'}
          </p>
        </div>
        <Card p={4} radius="lg" accentColor="warning">
          <span className="flex items-center justify-between gap-3">
            <span className="text-body-sm font-semibold text-claimondo-navy">{bezeichnung}</span>
            <Badge tone="warning" size="sm">Werkstattbindung</Badge>
          </span>
        </Card>
        <div className="flex flex-col gap-2">
          <Button
            variant="navy"
            fullWidth
            onClick={() => {
              setPending(null)
              onErgebnis(pnd.auswahl, pnd.ergebnis)
            }}
            disabled={busy}
            loading={busy}
          >
            <span data-testid="kasko-bestaetigen-ja">Ja, das ist mein Tarif</span>
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => {
              setPending(null)
              setStufe(pnd.zurueck)
            }}
            disabled={busy}
          >
            <span data-testid="kasko-bestaetigen-zurueck">Nein, zurück zur Auswahl</span>
          </Button>
        </div>
        <p className="text-caption text-claimondo-navy/50">{disclaimer}</p>
      </div>
    )
  }

  // stufe === 'marker'
  const markerListe = marke?.wbMarker ?? []
  return (
    <div className="flex flex-col gap-3" data-testid="kasko-tarif-frage">
      <div>
        <h2 className={h}>
          {markerListe.length > 0
            ? du
              ? 'Steht auf deinem Versicherungsschein einer dieser Zusätze?'
              : 'Steht auf Ihrem Versicherungsschein einer dieser Zusätze?'
            : du
              ? 'Enthält dein Vertrag einen Werkstattbindungs-Baustein?'
              : 'Enthält Ihr Vertrag einen Werkstattbindungs-Baustein?'}
        </h2>
        <p className={p}>
          {markerListe.length > 0
            ? `Diese Zusätze kennzeichnen bei ${marke?.marke ?? 'Ihrer Versicherung'} die Werkstattbindung.`
            : 'Typische Bezeichnungen: „mit Werkstattbindung“, „Werkstattbonus“, „Werkstattservice“, „SELECT“.'}
        </p>
        {markerListe.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {markerListe.map((m) => (
              <Badge key={m} tone="navy">„{m}“</Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="navy" fullWidth onClick={() => antworteMarker('ja')} disabled={busy} loading={busy}>
          <span data-testid="kasko-marker-ja">Ja, das steht auf meinem Schein</span>
        </Button>
        <Button variant="ondo" fullWidth onClick={() => antworteMarker('nein')} disabled={busy}>
          <span data-testid="kasko-marker-nein">Nein, davon steht nichts drauf</span>
        </Button>
        <Button variant="ghost" fullWidth onClick={() => antworteMarker('unbekannt')} disabled={busy}>
          <span data-testid="kasko-marker-unbekannt">Ich kann das gerade nicht prüfen</span>
        </Button>
      </div>
      <p className="text-caption text-claimondo-navy/50">{disclaimer}</p>
    </div>
  )
}
