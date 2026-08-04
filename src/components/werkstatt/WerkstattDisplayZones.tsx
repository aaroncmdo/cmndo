// C4c (Fundament „Eine Akte"): die Werkstatt-Display-Cards als <FallAkte layout='columns'>-Zonen.
// 1:1 aus WerkstattAuftragDetail extrahiert (behavior-preserving) — je Card eine Zone, damit die
// lg:columns-2-Masonry sie wie bisher ueber 2 Spalten verteilt (eine Sammel-Zone waere 1 Spalte).
// Das interaktive Segment (KVA/Reparaturtermin/Modals) + Copilot + Chat bleiben full-width im
// footer-Slot (WerkstattAuftragDetail), NICHT hier.

import { SectionCard } from '@/components/shared/SectionCard'
import type { WerkstattAuftrag, WerkstattAuftragExtra } from '@/lib/werkstatt/queries'
import type { FallAkteZone } from '@/components/fall-akte/types'

export type WerkstattVm = {
  auftrag: WerkstattAuftrag
  extra: WerkstattAuftragExtra | null
  kundeName: string
}

const fmtDatum = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '–'

function FallCardZone({ vm }: { vm: WerkstattVm }) {
  const { auftrag, kundeName } = vm
  return (
    <SectionCard title="Fall">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
        <div>
          <dt className="text-body-xs text-claimondo-ondo">Kunde</dt>
          <dd className="text-claimondo-navy font-medium">{kundeName}</dd>
        </div>
        <div>
          <dt className="text-body-xs text-claimondo-ondo">Schaden</dt>
          <dd className="text-claimondo-navy">{auftrag.schadenart ?? '–'}</dd>
        </div>
        <div>
          <dt className="text-body-xs text-claimondo-ondo">Gutachter</dt>
          <dd className="text-claimondo-navy">{auftrag.gutachter_firmenname ?? '–'}</dd>
        </div>
      </dl>
    </SectionCard>
  )
}

function FahrzeugCardZone({ vm }: { vm: WerkstattVm }) {
  const { extra } = vm
  if (!extra) return null
  return (
    <SectionCard title="Fahrzeug & Unfall">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
        {extra.fahrzeug_baujahr != null && (
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Baujahr</dt>
            <dd className="text-claimondo-navy">{String(extra.fahrzeug_baujahr)}</dd>
          </div>
        )}
        {extra.erstzulassung && (
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Erstzulassung</dt>
            <dd className="text-claimondo-navy">{fmtDatum(extra.erstzulassung)}</dd>
          </div>
        )}
        {extra.kilometerstand != null && (
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Kilometerstand</dt>
            <dd className="text-claimondo-navy">{String(extra.kilometerstand)} km</dd>
          </div>
        )}
        {extra.fahrzeug_farbe && (
          <div>
            <dt className="text-body-xs text-claimondo-ondo">Farbe</dt>
            <dd className="text-claimondo-navy">{extra.fahrzeug_farbe}</dd>
          </div>
        )}
      </dl>
      {extra.hergang && (
        <div className="mt-2">
          <p className="text-body-xs text-claimondo-ondo">Unfallhergang</p>
          <p className="text-body-sm text-claimondo-navy">{extra.hergang}</p>
        </div>
      )}
    </SectionCard>
  )
}

function SchadensfotosZone({ vm }: { vm: WerkstattVm }) {
  const { extra } = vm
  if (!extra || extra.schadensfotos.length === 0) return null
  return (
    <SectionCard title="Schadensfotos">
      <p className="text-body-xs text-claimondo-ondo mb-2">
        Vom Kunden gemeldete Schadensbilder — Grundlage für den Kostenvoranschlag.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {extra.schadensfotos.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-square overflow-hidden rounded-ios-md border border-claimondo-border"
          >
            <img src={url} alt={`Schadensfoto ${i + 1}`} className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    </SectionCard>
  )
}

function VorschaedenZone({ vm }: { vm: WerkstattVm }) {
  const { extra } = vm
  if (!extra) return null
  return (
    <SectionCard title="Vorschäden">
      {extra.hat_vorschaeden || extra.vorschaden_anzahl ? (
        <div className="text-body-sm text-claimondo-navy space-y-1">
          <p className="font-medium text-warning-strong">
            Vorschäden gemeldet{extra.vorschaden_anzahl ? ` (${extra.vorschaden_anzahl})` : ''}
          </p>
          {extra.vorschaden_erkannt && <p>Erkannt/dokumentiert: {extra.vorschaden_erkannt}</p>}
          {extra.vorschaden_letzter_datum && (
            <p>Letzter Vorschaden: {fmtDatum(extra.vorschaden_letzter_datum)}</p>
          )}
        </div>
      ) : (
        <p className="text-body-sm text-claimondo-ondo">Keine Vorschäden gemeldet.</p>
      )}
    </SectionCard>
  )
}

function AnsprechpartnerZone({ vm }: { vm: WerkstattVm }) {
  const { extra, auftrag, kundeName } = vm
  if (!extra) return null
  return (
    <SectionCard title="Ansprechpartner">
      <div className="space-y-3 text-body-sm">
        <div>
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo">Kunde</p>
          <p className="text-claimondo-navy font-medium">
            {[extra.kunde_vorname, extra.kunde_nachname].filter(Boolean).join(' ') || kundeName}
          </p>
          {extra.kunde_telefon && (
            <a
              href={`tel:${extra.kunde_telefon}`}
              className="text-claimondo-ondo hover:text-claimondo-navy"
            >
              {extra.kunde_telefon}
            </a>
          )}
          {extra.kunde_email && (
            <a
              href={`mailto:${extra.kunde_email}`}
              className="block text-claimondo-ondo hover:text-claimondo-navy truncate"
            >
              {extra.kunde_email}
            </a>
          )}
        </div>
        {extra.betreuer && (
          <div>
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo">
              Claimondo-Betreuer
            </p>
            <p className="text-claimondo-navy font-medium">
              {[extra.betreuer.vorname, extra.betreuer.nachname].filter(Boolean).join(' ') ||
                'Betreuer'}
            </p>
            {extra.betreuer.telefon && (
              <a
                href={`tel:${extra.betreuer.telefon}`}
                className="text-claimondo-ondo hover:text-claimondo-navy"
              >
                {extra.betreuer.telefon}
              </a>
            )}
          </div>
        )}
        {auftrag.gutachter_firmenname && (
          <div>
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo">
              Gutachter
            </p>
            <p className="text-claimondo-navy font-medium">{auftrag.gutachter_firmenname}</p>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

export type WerkstattZoneKey = 'fall' | 'fahrzeug' | 'fotos' | 'vorschaeden' | 'ansprechpartner'

/** Phasen-/daten-adaptive Zonen-Reihenfolge — spiegelt die alten `{extra && …}`-Gates 1:1
 *  (Fall immer; Fahrzeug/Fotos konditional; Vorschaeden/Ansprechpartner sobald `extra`). */
export function werkstattZonen(vm: WerkstattVm): WerkstattZoneKey[] {
  const { extra } = vm
  const keys: WerkstattZoneKey[] = ['fall']
  if (extra) {
    const zeigtFahrzeug =
      extra.fahrzeug_baujahr != null ||
      !!extra.erstzulassung ||
      extra.kilometerstand != null ||
      !!extra.fahrzeug_farbe ||
      !!extra.hergang
    if (zeigtFahrzeug) keys.push('fahrzeug')
    if (extra.schadensfotos.length > 0) keys.push('fotos')
    keys.push('vorschaeden')
    keys.push('ansprechpartner')
  }
  return keys
}

export const werkstattZoneComponents: Record<WerkstattZoneKey, FallAkteZone<WerkstattVm>> = {
  fall: FallCardZone,
  fahrzeug: FahrzeugCardZone,
  fotos: SchadensfotosZone,
  vorschaeden: VorschaedenZone,
  ansprechpartner: AnsprechpartnerZone,
}
