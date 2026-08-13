// Read-only Schaden-Cockpit fuer den Flottenmanager — bleibt eine SERVER-Komponente.
// (Der `stack`-Layoutzweig des Kerns traegt das: nur `FallAkteTabs` ist 'use client',
// weil es Tab-State haelt. Die interaktiven Teile — Upload-Widget, „Schaden
// vervollstaendigen" — sind wie bisher eigene Client-Komponenten.)
//
// C4/§9-#7 (Fundament „Eine Akte", 13.08.): haengt jetzt am gemeinsamen
// `<FallAkte layout='stack'>`-Kern statt an einer eigenen Shell. Die vier Bloecke sind
// dabei zu ZONEN geworden — was die bisherigen verschachtelten Ternaries im JSX ersetzt:
// welche Zone erscheint, entscheidet `zones(vm)` an einer Stelle, statt sich ueber das
// Markup zu verteilen. Inhaltlich ist jede Karte unveraendert.
// Vorbild: `components/makler/akte-detail/MaklerAkteDetail.tsx` (tabs) bzw. der SV-Stack.

import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FlottenDokumentUpload } from './FlottenDokumentUpload'
import { SchadenVervollstaendigenButton } from './SchadenVervollstaendigenButton'
import type { FlottenClaimView } from '@/lib/flotte/flotten-claim-detail'
import { FallAkte } from '@/components/fall-akte/FallAkte'
import type { FallAkteConfig } from '@/components/fall-akte/types'

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

/** Das vm traegt neben der View auch die Upload-Klammer — die Zonen bekommen nur `{ vm }`. */
type FlottenVm = {
  view: FlottenClaimView
  vehicleId: string
  onUpload: (
    vehicleId: string,
    claimId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
}

type ZoneKey = 'status' | 'ansprechpartner' | 'unfalldaten' | 'dokumente'

/** Hat der Schaden ueberhaupt Unfalldaten? Sonst bleibt die Karte weg (wie bisher). */
function hatUnfalldaten(view: FlottenClaimView): boolean {
  const u = view.unfalldaten
  return !!(u.gegnerName || u.gegnerKennzeichen || u.gegnerVersicherung || u.hergang || u.unfallort)
}

function StatusZone({ vm }: { vm: FlottenVm }) {
  const { view } = vm
  return (
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
  )
}

function AnsprechpartnerZone({ vm }: { vm: FlottenVm }) {
  const { view } = vm
  return (
    <SectionCard title="Ansprechpartner">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {view.kb ? <KontaktZeile label="Betreuer" name={view.kb.name} telefon={view.kb.telefon} /> : null}
        {view.sv ? (
          <KontaktZeile label="Gutachter" name={view.sv.anzeigename ?? view.sv.name} telefon={view.sv.telefon} />
        ) : null}
      </div>
    </SectionCard>
  )
}

function UnfalldatenZone({ vm }: { vm: FlottenVm }) {
  const u = vm.view.unfalldaten
  return (
    <SectionCard title="Unfalldaten">
      <dl className="space-y-2 text-sm">
        {u.unfallort ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-claimondo-ondo">Unfallort</dt>
            <dd className="text-right text-claimondo-navy">{u.unfallort}</dd>
          </div>
        ) : null}
        {u.gegnerName || u.gegnerKennzeichen ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-claimondo-ondo">Unfallgegner</dt>
            <dd className="text-right text-claimondo-navy">
              {[u.gegnerName, u.gegnerKennzeichen].filter(Boolean).join(' · ')}
            </dd>
          </div>
        ) : null}
        {u.gegnerVersicherung ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-claimondo-ondo">Gegner-Versicherung</dt>
            <dd className="text-right text-claimondo-navy">{u.gegnerVersicherung}</dd>
          </div>
        ) : null}
        {u.hergang ? (
          <div className="space-y-1 border-t border-claimondo-border/60 pt-2">
            <dt className="text-claimondo-ondo">Hergang</dt>
            <dd className="whitespace-pre-wrap text-claimondo-navy">{u.hergang}</dd>
          </div>
        ) : null}
      </dl>
    </SectionCard>
  )
}

function DokumenteZone({ vm }: { vm: FlottenVm }) {
  const { view, vehicleId, onUpload } = vm
  return (
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
  )
}

const CONFIG: FallAkteConfig<FlottenVm, ZoneKey> = {
  layout: 'stack',
  wrapperClassName: 'mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6',
  // Die Reihenfolge UND die Sichtbarkeit stehen jetzt an einer Stelle statt als
  // verschachtelte Ternaries im Markup.
  zones: (vm) => {
    const zonen: ZoneKey[] = ['status']
    if (vm.view.sv || vm.view.kb) zonen.push('ansprechpartner')
    if (hatUnfalldaten(vm.view)) zonen.push('unfalldaten')
    zonen.push('dokumente')
    return zonen
  },
  zoneComponents: {
    status: StatusZone,
    ansprechpartner: AnsprechpartnerZone,
    unfalldaten: UnfalldatenZone,
    dokumente: DokumenteZone,
  },
  header: (vm) => ({
    custom: (
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">{vm.view.claimNummer ?? 'Schaden'}</h1>
        <p className="mt-1 text-sm text-claimondo-shield">
          Schaden-Details ·{' '}
          {[vm.view.kennzeichen, vm.view.hersteller, vm.view.modell].filter(Boolean).join(' · ') || 'Fahrzeug'}
        </p>
        {/* §2d „Schaden vervollständigen": setzt DIESEN Claim db-driven ueber /flow fort
            (gutachter ODER werkstatt — nicht haftpflicht-spezifisch). Nur solange noch kein
            Gutachter zugewiesen ist (sonst zeigt „Ansprechpartner" den SV). */}
        {!vm.view.sv ? <SchadenVervollstaendigenButton claimId={vm.view.claimId} /> : null}
      </div>
    ),
  }),
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
  return <FallAkte config={CONFIG} vm={{ view, vehicleId, onUpload }} />
}
