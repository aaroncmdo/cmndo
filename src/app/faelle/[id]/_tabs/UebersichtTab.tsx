'use client'

// AAR-162 / W2: Übersicht-Tab — Status + Stammdaten-Sections.
// AAR-169: Videotermin-Buchen-Button für KB (Video solo, nicht mit LexDrive).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { VideoIcon } from 'lucide-react'
import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'
import { useFall } from '../FallContext'
import { createKbVideoterminByKb } from '../_actions/termine'
// AAR-377 / AAR-772: Shared BriefingCard (SV-Briefing) + StrukturBriefingCard (intern).
import BriefingCard from '@/components/fall/BriefingCard'
import StrukturBriefingCard from '@/components/fall/StrukturBriefingCard'
import type { StammdatenSection } from '@/lib/fall/phase-config'
// AAR-759: Shared Mietwagen-Status-Card (read-only in Phase 1)
import { MietwagenStatusCard } from '@/components/shared/mietwagen'
// AAR-759 Phase 2: Admin/KB-Edit-UI (ersetzt read-only Card im Admin-Kontext)
import { MietwagenEditCard } from '@/components/admin/fallakte/mietwagen'
import {
  KundendatenSection,
  FahrzeugdatenSection,
  UnfallSection,
  GegnerSection,
  VorschaedenSection,
  BesichtigungSection,
  KernwerteSection,
  VsStatusSection,
  // AAR-313: Self-gating Section, rendert nur bei mietwagen_flag/nutzungsausfall
  NutzungsausfallSection,
  // AAR-633: Notizen + Zeugen-Kontakte (immer sichtbar)
  NotizenSection,
  ZeugenKontakteSection,
} from '../_stammdaten/Sections'

const SECTION_COMPONENTS: Partial<Record<StammdatenSection, () => React.JSX.Element>> = {
  kunde: KundendatenSection,
  fahrzeug: FahrzeugdatenSection,
  unfall: UnfallSection,
  gegner: GegnerSection,
  vorschaeden: VorschaedenSection,
  besichtigung: BesichtigungSection,
  kernwerte: KernwerteSection,
  'as-status': VsStatusSection,
  // kuerzung/ruege/stellungnahme/nachbesichtigung/regulierung/klage/auszahlung
  // → werden im ProzessTab (W4) gerendert, nicht in der Übersicht
}

export default function UebersichtTab() {
  const { fall, visibleSections, refreshFall, userRolle } = useFall()
  const status = fall.status ?? 'ersterfassung'
  // AAR-377: Regenerate-Button nur für Admin + Kundenbetreuer.
  const canRegenerateBriefing = userRolle === 'admin' || userRolle === 'kundenbetreuer'
  const briefingText = (fall.sv_briefing_text as string | null) ?? null
  const briefingGeneratedAt = (fall.sv_briefing_generated_at as string | null) ?? null
  const briefingModel = (fall.sv_briefing_model as string | null) ?? null
  const briefingVersion = (fall.sv_briefing_version as number | null) ?? null
  // AAR-385: Struktur-Briefing aus jsonb-Feld — generated_by ist optional im Blob.
  const strukturRaw = fall.sv_briefing_struktur as
    | (Record<string, unknown> & { generated_by?: 'ai' | 'fallback' })
    | null
    | undefined
  const briefingStruktur =
    strukturRaw && typeof strukturRaw.kurzversion === 'string'
      ? {
          kurzversion: strukturRaw.kurzversion,
          hinweise: Array.isArray(strukturRaw.hinweise)
            ? (strukturRaw.hinweise as string[])
            : [],
          warnungen: Array.isArray(strukturRaw.warnungen)
            ? (strukturRaw.warnungen as string[])
            : [],
          checkliste_vor_ort: Array.isArray(strukturRaw.checkliste_vor_ort)
            ? (strukturRaw.checkliste_vor_ort as string[])
            : [],
        }
      : null
  const strukturGeneratedBy = strukturRaw?.generated_by ?? null
  const statusLabel = FALL_STATUS_LABELS[status] ?? status
  const statusCls =
    FALL_STATUS_COLORS[status] ?? 'bg-[#f8f9fb] text-claimondo-ondo border-claimondo-border'

  // AAR-169: KB-Videotermin-Buchen
  const [showBuchen, setShowBuchen] = useState(false)
  const [buchenDatum, setBuchenDatum] = useState('')
  const [buchenUhrzeit, setBuchenUhrzeit] = useState('')
  const [buchenKanal, setBuchenKanal] = useState<'video' | 'telefon'>('video')
  const [buchenNotiz, setBuchenNotiz] = useState('')
  const [pending, startTransition] = useTransition()

  function buchen() {
    if (!buchenDatum || !buchenUhrzeit) {
      toast.error('Datum und Uhrzeit erforderlich')
      return
    }
    const iso = new Date(`${buchenDatum}T${buchenUhrzeit}:00`).toISOString()
    startTransition(async () => {
      const r = await createKbVideoterminByKb(
        fall.id,
        iso,
        buchenKanal,
        buchenNotiz.trim() || undefined,
      )
      if (r.success) {
        toast.success(
          buchenKanal === 'video'
            ? `Videotermin gebucht${r.videoLink ? ` — Link: ${r.videoLink}` : ''}`
            : 'Telefontermin gebucht',
        )
        setShowBuchen(false)
        setBuchenDatum('')
        setBuchenUhrzeit('')
        setBuchenNotiz('')
        refreshFall()
      } else {
        toast.error(r.error ?? 'Buchung fehlgeschlagen')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* AAR-377: SV-Briefing (AI) — was der Gutachter sieht */}
      <BriefingCard
        fallId={fall.id}
        briefing={briefingText}
        generatedAt={briefingGeneratedAt}
        model={briefingModel}
        version={briefingVersion}
        canRegenerate={canRegenerateBriefing}
      />

      {/* AAR-772: Struktur-Briefing — intern für Admin/KB */}
      {canRegenerateBriefing && (
        <StrukturBriefingCard
          fallId={fall.id}
          struktur={briefingStruktur}
          generatedBy={strukturGeneratedBy}
          canRegenerate={canRegenerateBriefing}
        />
      )}

      {/* Status-Header */}
      <div className="bg-white border border-claimondo-border rounded-xl p-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">Fall-Nummer</p>
          <h1 className="text-xl font-bold text-claimondo-navy">{fall.fall_nummer ?? fall.id.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium px-2 py-1 rounded-full border ${statusCls}`}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowBuchen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-claimondo-ondo text-white hover:bg-claimondo-navy"
          >
            <VideoIcon className="w-3.5 h-3.5" /> Videotermin buchen
          </button>
        </div>
      </div>

      {/* AAR-169: Videotermin-Buchen-Dialog (KB solo) */}
      {showBuchen && (
        <div className="bg-white border border-claimondo-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-4 h-4 text-[#4573A2]" />
            <h3 className="text-sm font-semibold text-claimondo-navy">Videotermin mit Kunde buchen</h3>
          </div>
          <p className="text-[11px] text-claimondo-ondo">
            KB-solo-Termin (nicht mit LexDrive). Kunde bekommt WA-Einladung mit Link.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                Datum
              </label>
              <input
                type="date"
                value={buchenDatum}
                onChange={(e) => setBuchenDatum(e.target.value)}
                className="w-full text-sm border-b border-claimondo-border focus:border-[#4573A2] outline-none py-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                Uhrzeit
              </label>
              <input
                type="time"
                value={buchenUhrzeit}
                onChange={(e) => setBuchenUhrzeit(e.target.value)}
                className="w-full text-sm border-b border-claimondo-border focus:border-[#4573A2] outline-none py-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                Kanal
              </label>
              <div className="flex gap-2">
                {(['video', 'telefon'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setBuchenKanal(k)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                      buchenKanal === k
                        ? 'bg-[#4573A2] text-white border-[#4573A2]'
                        : 'bg-white text-claimondo-ondo border-claimondo-border hover:bg-[#f8f9fb]'
                    }`}
                  >
                    {k === 'video' ? 'Video' : 'Telefon'}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                Notiz (intern)
              </label>
              <input
                type="text"
                value={buchenNotiz}
                onChange={(e) => setBuchenNotiz(e.target.value)}
                placeholder="Optional — worum geht's im Termin?"
                className="w-full text-sm border-b border-claimondo-border focus:border-[#4573A2] outline-none py-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBuchen(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-claimondo-border text-claimondo-ondo hover:bg-[#f8f9fb]"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={buchen}
              disabled={pending}
              className="px-3 py-1.5 rounded-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
            >
              {pending ? 'Buche ...' : 'Buchen'}
            </button>
          </div>
        </div>
      )}

      {/* Stammdaten — phase-abhängige Reihenfolge */}
      {visibleSections.map((id) => {
        const Comp = SECTION_COMPONENTS[id]
        if (!Comp) return null
        return <Comp key={id} />
      })}

      {/* AAR-759 Phase 2: Mietwagen — Admin/KB bekommt Edit-Card, andere Rollen read-only */}
      {userRolle === 'admin' || userRolle === 'kundenbetreuer' ? (
        <MietwagenEditCard
          fallId={fall.id as string}
          fall={{
            mietwagen_hat: (fall.mietwagen_hat as boolean | null) ?? null,
            mietwagen_seit_datum: (fall.mietwagen_seit_datum as string | null) ?? null,
            mietwagen_limit_tage: (fall.mietwagen_limit_tage as number | null) ?? null,
            mietwagen_limit_grund: (fall.mietwagen_limit_grund as string | null) ?? null,
            mietwagen_rechnung_vorhanden:
              (fall.mietwagen_rechnung_vorhanden as boolean | null) ?? null,
            mietwagen_argumentations_puffer:
              (fall.mietwagen_argumentations_puffer as number | null) ?? null,
            mietwagen_vermieter: (fall.mietwagen_vermieter as string | null) ?? null,
            nutzungsausfall_tage: (fall.nutzungsausfall_tage as number | null) ?? null,
          }}
        />
      ) : (
        <MietwagenStatusCard
          rolle="kb"
          fall={{
            mietwagen_hat: (fall.mietwagen_hat as boolean | null) ?? null,
            mietwagen_seit_datum: (fall.mietwagen_seit_datum as string | null) ?? null,
            mietwagen_limit_tage: (fall.mietwagen_limit_tage as number | null) ?? null,
            mietwagen_limit_grund: (fall.mietwagen_limit_grund as string | null) ?? null,
            mietwagen_rechnung_vorhanden:
              (fall.mietwagen_rechnung_vorhanden as boolean | null) ?? null,
            mietwagen_argumentations_puffer:
              (fall.mietwagen_argumentations_puffer as number | null) ?? null,
            mietwagen_vermieter: (fall.mietwagen_vermieter as string | null) ?? null,
            nutzungsausfall_tage: (fall.nutzungsausfall_tage as number | null) ?? null,
          }}
        />
      )}

      {/* AAR-313: Nutzungsausfall — self-gating, immer rendern wenn relevant */}
      <NutzungsausfallSection />

      {/* AAR-633: Zeugen + Notizen am Ende der Übersicht */}
      <ZeugenKontakteSection />
      <NotizenSection />
    </div>
  )
}
