// Read-only Schaden-Cockpit fuer den flottenmanager (Server-Komponente).
// Ersetzt die frueheren 2 kargen Karten (nur Status/Betrag) durch: Status, Ansprechpartner
// (Betreuer/Gutachter), Dokumente (sichtbar-gefiltert) inkl. Upload-Widget.
// Aktionen ausser Upload bewusst NICHT (read-only-Cockpit, v1) — die Kunde-Mutationen
// (Bank/Slot) gelten fuer den Flottenmanager nicht.

import Link from 'next/link'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/primitives'
import { FlottenDokumentUpload } from './FlottenDokumentUpload'
import type { FlottenClaimView } from '@/lib/flotte/flotten-claim-detail'

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function KontaktZeile({
  label,
  name,
  telefon,
}: {
  label: string
  name: string | null
  telefon: string | null
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-claimondo-ondo/60">{label}</span>
      <span className="text-sm font-medium text-claimondo-navy">{name ?? 'noch nicht zugewiesen'}</span>
      {telefon ? (
        <a href={`tel:${telefon}`} className="text-body-xs text-claimondo-ondo underline">
          {telefon}
        </a>
      ) : null}
    </div>
  )
}

export function FlottenClaimDetailView({
  view,
  vehicleId,
  onUpload,
}: {
  view: FlottenClaimView
  vehicleId: string
  onUpload: (
    vehicleId: string,
    claimId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const fahrzeugLabel =
    [view.kennzeichen, view.hersteller, view.modell].filter(Boolean).join(' · ') || 'Fahrzeug'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">{view.claimNummer ?? 'Schaden'}</h1>
        <p className="mt-1 text-sm text-claimondo-shield">Schaden-Details · {fahrzeugLabel}</p>
        {/* Gutachter finden: FM startet den Finder direkt AUS dem Claim (Aaron: „extra button im claim").
            typ=haftpflicht als Vorbelegung — die Haftpflicht/Kasko-Weiche laeuft db-driven weiter IM
            FlowLink (identisch zu FahrzeugMiniAktionen, dort dokumentiert). Nur solange noch kein
            Gutachter zugewiesen ist (sonst zeigt „Ansprechpartner" den SV). */}
        {!view.sv ? (
          <Link href={`/flotte/schaden/${view.claimId}/gutachter?typ=haftpflicht`} className="mt-3 inline-block">
            <Button variant="ondo" size="sm">
              Gutachter finden
            </Button>
          </Link>
        ) : null}
      </div>

      <SectionCard title="Status">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-claimondo-ondo">Aktueller Status</dt>
            <dd>
              <StatusBadge domain="fall-status" code={view.status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-claimondo-ondo">Schadentag</dt>
            <dd className="text-claimondo-navy">{formatDatum(view.schadentag)}</dd>
          </div>
          {view.schadensHoeheNetto != null ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-claimondo-ondo">Schadenshöhe (netto)</dt>
              <dd className="text-claimondo-navy">
                {view.schadensHoeheNetto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>

      {view.sv || view.kb ? (
        <SectionCard title="Ansprechpartner">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {view.kb ? <KontaktZeile label="Betreuer" name={view.kb.name} telefon={view.kb.telefon} /> : null}
            {view.sv ? (
              <KontaktZeile label="Gutachter" name={view.sv.anzeigename ?? view.sv.name} telefon={view.sv.telefon} />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {view.unfalldaten.gegnerName ||
      view.unfalldaten.gegnerKennzeichen ||
      view.unfalldaten.gegnerVersicherung ||
      view.unfalldaten.hergang ||
      view.unfalldaten.unfallort ? (
        <SectionCard title="Unfalldaten">
          <dl className="space-y-2 text-sm">
            {view.unfalldaten.unfallort ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-claimondo-ondo">Unfallort</dt>
                <dd className="text-right text-claimondo-navy">{view.unfalldaten.unfallort}</dd>
              </div>
            ) : null}
            {view.unfalldaten.gegnerName || view.unfalldaten.gegnerKennzeichen ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-claimondo-ondo">Unfallgegner</dt>
                <dd className="text-right text-claimondo-navy">
                  {[view.unfalldaten.gegnerName, view.unfalldaten.gegnerKennzeichen].filter(Boolean).join(' · ')}
                </dd>
              </div>
            ) : null}
            {view.unfalldaten.gegnerVersicherung ? (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-claimondo-ondo">Gegner-Versicherung</dt>
                <dd className="text-right text-claimondo-navy">{view.unfalldaten.gegnerVersicherung}</dd>
              </div>
            ) : null}
            {view.unfalldaten.hergang ? (
              <div className="space-y-1 border-t border-claimondo-border/60 pt-2">
                <dt className="text-claimondo-ondo">Hergang</dt>
                <dd className="whitespace-pre-wrap text-claimondo-navy">{view.unfalldaten.hergang}</dd>
              </div>
            ) : null}
          </dl>
        </SectionCard>
      ) : null}

      <SectionCard title={`Dokumente (${view.dokumente.length})`}>
        {view.dokumente.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/60">Noch keine Dokumente für diesen Schaden.</p>
        ) : (
          <ul className="divide-y divide-claimondo-border">
            {view.dokumente.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-claimondo-navy">
                  {d.dateiname ?? d.typ ?? 'Dokument'}
                </span>
                <span className="shrink-0 text-body-xs text-claimondo-shield">{formatDatum(d.hochgeladenAm)}</span>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-body-xs font-medium text-claimondo-ondo underline"
                  >
                    Öffnen
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <FlottenDokumentUpload vehicleId={vehicleId} claimId={view.claimId} onUpload={onUpload} />
      </SectionCard>
    </div>
  )
}
