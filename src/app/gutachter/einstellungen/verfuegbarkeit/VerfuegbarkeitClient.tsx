'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeftIcon, ClockIcon, CheckCircle2Icon } from 'lucide-react'
import { Button, Card } from '@/components/primitives'
import PageHeader from '@/components/shared/PageHeader'
import { updateVerfuegbarkeit } from './actions'

// AAR-SV-Verfuegbarkeit: Editor fuer Arbeitszeiten (pro Wochentag) + Urlaub.
// Modell: `arbeitszeiten` (jsonb) enthaelt NUR geoeffnete Tage — ein fehlender
// Tag = geschlossen (slots.ts liest az[key], undefined -> keine Slots). Zusaetzlich
// spiegeln wir geschlossene Wochentage in `blockierte_wochentage` (0=So..6=Sa).

type DayKey = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so'
type DayState = { open: boolean; von: string; bis: string }

const WEEKDAYS: { key: DayKey; label: string; getDay: number }[] = [
  { key: 'mo', label: 'Montag', getDay: 1 },
  { key: 'di', label: 'Dienstag', getDay: 2 },
  { key: 'mi', label: 'Mittwoch', getDay: 3 },
  { key: 'do', label: 'Donnerstag', getDay: 4 },
  { key: 'fr', label: 'Freitag', getDay: 5 },
  { key: 'sa', label: 'Samstag', getDay: 6 },
  { key: 'so', label: 'Sonntag', getDay: 0 },
]

// Muss zur Engine-Paritaet passen (slots.ts DEFAULT_SV_ARBEITSZEITEN).
const DEFAULT_ARBEITSZEITEN: Record<string, { von: string; bis: string }> = {
  mo: { von: '09:00', bis: '17:00' },
  di: { von: '09:00', bis: '17:00' },
  mi: { von: '09:00', bis: '17:00' },
  do: { von: '09:00', bis: '17:00' },
  fr: { von: '09:00', bis: '16:00' },
}

const INPUT_CLS =
  'rounded-ios-md border border-claimondo-border px-2.5 py-1.5 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30'

export default function VerfuegbarkeitClient({
  initial,
}: {
  initial: {
    arbeitszeiten: Record<string, { von: string; bis: string }> | null
    blockierteWochentage: number[]
    urlaubVon: string | null
    urlaubBis: string | null
  }
}) {
  const router = useRouter()
  const [saving, startTransition] = useTransition()

  const [days, setDays] = useState<Record<DayKey, DayState>>(() => {
    const az = initial.arbeitszeiten ?? DEFAULT_ARBEITSZEITEN
    const blocked = new Set(initial.blockierteWochentage)
    const out = {} as Record<DayKey, DayState>
    for (const d of WEEKDAYS) {
      const entry = az[d.key]
      out[d.key] = {
        // Offen = hat Arbeitszeit-Eintrag UND nicht als geschlossen markiert.
        open: !!entry && !blocked.has(d.getDay),
        von: entry?.von ?? '09:00',
        bis: entry?.bis ?? '17:00',
      }
    }
    return out
  })

  const [urlaubVon, setUrlaubVon] = useState(initial.urlaubVon ?? '')
  const [urlaubBis, setUrlaubBis] = useState(initial.urlaubBis ?? '')

  const offeneTage = useMemo(() => WEEKDAYS.filter((d) => days[d.key].open).length, [days])

  function toggleDay(key: DayKey) {
    setDays((p) => ({ ...p, [key]: { ...p[key], open: !p[key].open } }))
  }
  function setTime(key: DayKey, feld: 'von' | 'bis', wert: string) {
    setDays((p) => ({ ...p, [key]: { ...p[key], [feld]: wert } }))
  }

  function handleSave() {
    for (const d of WEEKDAYS) {
      const s = days[d.key]
      if (s.open && s.von >= s.bis) {
        toast.error(`${d.label}: Von-Zeit muss vor Bis-Zeit liegen`)
        return
      }
    }
    if ((urlaubVon && !urlaubBis) || (!urlaubVon && urlaubBis)) {
      toast.error('Bitte Urlaub-Start und -Ende angeben')
      return
    }
    if (urlaubVon && urlaubBis && urlaubVon > urlaubBis) {
      toast.error('Urlaub-Start muss vor dem Ende liegen')
      return
    }
    if (offeneTage === 0) {
      const ok = window.confirm(
        'Kein Wochentag ist geöffnet — es können dann keine Termine mehr vorgeschlagen werden. Trotzdem speichern?',
      )
      if (!ok) return
    }

    const arbeitszeiten: Record<string, { von: string; bis: string }> = {}
    const blockierteWochentage: number[] = []
    for (const d of WEEKDAYS) {
      const s = days[d.key]
      if (s.open) arbeitszeiten[d.key] = { von: s.von, bis: s.bis }
      else blockierteWochentage.push(d.getDay)
    }

    startTransition(async () => {
      const res = await updateVerfuegbarkeit({
        arbeitszeiten,
        blockierteWochentage,
        urlaubVon: urlaubVon || null,
        urlaubBis: urlaubBis || null,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Speichern fehlgeschlagen')
        return
      }
      toast.success('Verfügbarkeit gespeichert')
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <Link
        href="/gutachter/einstellungen"
        className="inline-flex items-center gap-1 text-body-sm text-claimondo-ondo hover:text-claimondo-navy transition-colors"
      >
        <ChevronLeftIcon className="w-4 h-4" /> Einstellungen
      </Link>

      <PageHeader
        title="Verfügbarkeit"
        description="Deine Arbeitszeiten, geschlossene Tage und Urlaub. Claimondo schlägt Termine nur innerhalb dieser Zeiten vor."
        size="lg"
        useBranding
        leadingSlot={
          <div className="w-10 h-10 rounded-full bg-[var(--brand-secondary)]/10 text-[var(--brand-primary)] flex items-center justify-center shrink-0">
            <ClockIcon className="w-5 h-5" />
          </div>
        }
      />

      {/* Arbeitszeiten */}
      <Card className="space-y-1">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">Arbeitszeiten</h2>
          <span className="text-body-xs text-claimondo-ondo">
            {offeneTage} {offeneTage === 1 ? 'Tag' : 'Tage'} geöffnet
          </span>
        </div>
        <div className="divide-y divide-claimondo-border">
          {WEEKDAYS.map((d) => {
            const s = days[d.key]
            return (
              <div key={d.key} className="flex items-center gap-3 py-2.5">
                <label className="flex items-center gap-2.5 w-32 shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={s.open}
                    onChange={() => toggleDay(d.key)}
                    className="w-4 h-4 accent-claimondo-navy"
                  />
                  <span
                    className={`text-body-sm font-medium ${s.open ? 'text-claimondo-navy' : 'text-claimondo-ondo/60'}`}
                  >
                    {d.label}
                  </span>
                </label>
                {s.open ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={s.von}
                      onChange={(e) => setTime(d.key, 'von', e.target.value)}
                      className={INPUT_CLS}
                      aria-label={`${d.label} von`}
                    />
                    <span className="text-claimondo-ondo/60">–</span>
                    <input
                      type="time"
                      value={s.bis}
                      onChange={(e) => setTime(d.key, 'bis', e.target.value)}
                      className={INPUT_CLS}
                      aria-label={`${d.label} bis`}
                    />
                  </div>
                ) : (
                  <span className="text-body-sm text-claimondo-ondo/50 italic">Geschlossen</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Urlaub */}
      <Card className="space-y-3">
        <div>
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">Urlaub</h2>
          <p className="text-body-xs text-claimondo-ondo mt-0.5">
            In diesem Zeitraum werden keine Termine vorgeschlagen.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-body-xs font-medium text-claimondo-ondo">Von</span>
            <input
              type="date"
              value={urlaubVon}
              onChange={(e) => setUrlaubVon(e.target.value)}
              className={INPUT_CLS}
              aria-label="Urlaub von"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-body-xs font-medium text-claimondo-ondo">Bis</span>
            <input
              type="date"
              value={urlaubBis}
              min={urlaubVon || undefined}
              onChange={(e) => setUrlaubBis(e.target.value)}
              className={INPUT_CLS}
              aria-label="Urlaub bis"
            />
          </label>
          {(urlaubVon || urlaubBis) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUrlaubVon('')
                setUrlaubBis('')
              }}
            >
              Urlaub entfernen
            </Button>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="navy"
          onClick={handleSave}
          loading={saving}
          iconLeft={<CheckCircle2Icon className="w-4 h-4" />}
        >
          Speichern
        </Button>
      </div>
    </div>
  )
}
