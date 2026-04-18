'use client'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { X, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFlowStore, type FlowFoto } from '@/lib/flow/flow-store'
import {
  uploadFoto,
  deleteFoto,
  ALLOWED_FOTO_TYPES,
  MAX_FOTO_BYTES,
  MAX_FOTO_COUNT,
} from '@/lib/flow/upload-foto'
import { updateLeadFotos } from '@/lib/actions/update-lead-fotos'

// AAR-471 C5: Schritt 2a — Fahrzeug-Skizze + Foto-Upload.
// Links SVG mit 6 klickbaren Zonen, rechts Upload-Grid pro Bereich.
// Weiter-Button aktiviert ab 3 Fotos.

const BEREICHE = ['vorne', 'hinten', 'links', 'rechts', 'dach', 'innen'] as const
type Bereich = (typeof BEREICHE)[number]

const BEREICH_LABELS: Record<Bereich, string> = {
  vorne: 'Vorne',
  hinten: 'Hinten',
  links: 'Links',
  rechts: 'Rechts',
  dach: 'Dach',
  innen: 'Innen',
}

const MIN_FOTOS = 3

export function Schritt2aClient({ leadId }: { leadId: string }) {
  const router = useRouter()
  const fotos = useFlowStore((s) => s.fotos)
  const setFotos = useFlowStore((s) => s.setFotos)
  const setCurrentStep = useFlowStore((s) => s.setCurrentStep)
  const [activeBereich, setActiveBereich] = useState<Bereich>('vorne')
  const [pending, startTransition] = useTransition()
  const sectionRefs = useRef<Record<Bereich, HTMLElement | null>>({
    vorne: null,
    hinten: null,
    links: null,
    rechts: null,
    dach: null,
    innen: null,
  })

  const countsByBereich = useMemo(() => {
    const out: Record<Bereich, number> = {
      vorne: 0,
      hinten: 0,
      links: 0,
      rechts: 0,
      dach: 0,
      innen: 0,
    }
    for (const f of fotos) {
      if (isBereich(f.bereich)) out[f.bereich] += 1
    }
    return out
  }, [fotos])

  const scrollToBereich = useCallback((b: Bereich) => {
    setActiveBereich(b)
    sectionRefs.current[b]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const onSvgClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as Element
      const zone = target.closest('[data-bereich]') as SVGElement | null
      const b = zone?.getAttribute('data-bereich')
      if (b && isBereich(b)) scrollToBereich(b)
    },
    [scrollToBereich],
  )

  const onNext = () => {
    if (fotos.length < MIN_FOTOS) {
      toast.error(`Mindestens ${MIN_FOTOS} Fotos erforderlich`)
      return
    }
    startTransition(async () => {
      const result = await updateLeadFotos(leadId, fotos)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setCurrentStep(2)
      router.push('/schaden-melden/schritt-2/analyse')
    })
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
      {/* SVG links */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm text-slate-600">Klick auf einen Bereich:</p>
        <div
          onClick={onSvgClick}
          role="presentation"
          className="rounded-xl border border-claimondo-border bg-white p-4 [&_.zone:hover]:fill-[var(--claimondo-ondo)] [&_.zone:hover]:fill-opacity-20 [&_.zone]:cursor-pointer"
          dangerouslySetInnerHTML={{ __html: SVG_INLINE }}
          data-active-zone={activeBereich}
        />
        <p className="mt-3 text-center text-sm text-claimondo-navy">
          {fotos.length} / {MAX_FOTO_COUNT} Fotos insgesamt
        </p>
      </div>

      {/* Bereich-Sections */}
      <div className="space-y-6">
        {BEREICHE.map((b) => (
          <BereichSection
            key={b}
            bereich={b}
            leadId={leadId}
            count={countsByBereich[b]}
            fotos={fotos}
            setFotos={setFotos}
            sectionRef={(el) => {
              sectionRefs.current[b] = el
            }}
            isActive={activeBereich === b}
          />
        ))}

        <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-claimondo-border bg-white p-4 shadow-[var(--shadow-claimondo-sm)]">
          <p className="text-sm text-slate-600">
            {fotos.length < MIN_FOTOS
              ? `Noch ${MIN_FOTOS - fotos.length} Foto${MIN_FOTOS - fotos.length === 1 ? '' : 's'} bis zum nächsten Schritt`
              : 'Alles bereit für die KI-Analyse'}
          </p>
          <Button
            onClick={onNext}
            disabled={fotos.length < MIN_FOTOS || pending}
            className="bg-claimondo-ondo hover:bg-claimondo-shield"
          >
            {pending ? 'Wird gespeichert …' : 'Weiter zur Analyse'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BereichSection({
  bereich,
  leadId,
  count,
  fotos,
  setFotos,
  sectionRef,
  isActive,
}: {
  bereich: Bereich
  leadId: string
  count: number
  fotos: FlowFoto[]
  setFotos: (fotos: FlowFoto[]) => void
  sectionRef: (el: HTMLElement | null) => void
  isActive: boolean
}) {
  const [uploading, setUploading] = useState(0)

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (fotos.length + accepted.length > MAX_FOTO_COUNT) {
        toast.error(`Maximal ${MAX_FOTO_COUNT} Fotos insgesamt`)
        return
      }
      setUploading((n) => n + accepted.length)
      const newFotos: FlowFoto[] = []
      for (const file of accepted) {
        const r = await uploadFoto(leadId, bereich, file)
        if (r.success) {
          newFotos.push({ bereich, url: r.url })
        } else {
          toast.error(`${file.name}: ${r.error}`)
        }
        setUploading((n) => n - 1)
      }
      if (newFotos.length > 0) setFotos([...fotos, ...newFotos])
    },
    [fotos, setFotos, leadId, bereich],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: MAX_FOTO_BYTES,
    multiple: true,
    onDropRejected: (rejections) => {
      for (const r of rejections) {
        const reason = r.errors[0]?.code
        if (reason === 'file-invalid-type') {
          toast.error(
            `${r.file.name}: Dateityp nicht unterstützt${
              r.file.type === 'image/heic' || r.file.type === 'image/heif'
                ? ' (HEIC: bitte als JPG/PNG hochladen)'
                : ''
            }`,
          )
        } else if (reason === 'file-too-large') {
          toast.error(`${r.file.name}: Datei größer als 10 MB`)
        } else {
          toast.error(`${r.file.name}: Upload abgelehnt`)
        }
      }
    },
  })

  const bereichFotos = fotos.filter((f) => f.bereich === bereich)

  const onDelete = async (url: string) => {
    setFotos(fotos.filter((f) => f.url !== url))
    try {
      await deleteFoto(url)
    } catch {
      // Stille ignorieren — Lead-Update schreibt sowieso nur die übrige Liste
    }
  }

  return (
    <section
      ref={sectionRef}
      id={`bereich-${bereich}`}
      className={[
        'scroll-mt-6 rounded-xl border p-5 transition',
        isActive ? 'border-claimondo-ondo bg-claimondo-bg' : 'border-claimondo-border bg-white',
      ].join(' ')}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-claimondo-navy">
          {BEREICH_LABELS[bereich]}
        </h3>
        <span
          className={[
            'rounded-full px-3 py-1 text-xs font-semibold',
            count > 0
              ? 'bg-claimondo-ondo text-white'
              : 'bg-claimondo-border text-slate-600',
          ].join(' ')}
        >
          {count} Foto{count === 1 ? '' : 's'}
        </span>
      </div>

      <div
        {...getRootProps()}
        className={[
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition',
          isDragActive
            ? 'border-claimondo-ondo bg-claimondo-ondo/5'
            : 'border-claimondo-border bg-white hover:border-claimondo-ondo',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        <Upload className="h-6 w-6 text-claimondo-ondo" aria-hidden />
        <p className="mt-2 text-sm font-medium text-claimondo-navy">
          Fotos hier ablegen oder klicken
        </p>
        <p className="mt-1 text-xs text-slate-500">JPG, PNG oder WEBP · max. 10 MB</p>
      </div>

      {bereichFotos.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {bereichFotos.map((f) => (
            <div
              key={f.url}
              className="group relative aspect-square overflow-hidden rounded-lg border border-claimondo-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={`${BEREICH_LABELS[bereich]} Foto`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onDelete(f.url)}
                aria-label="Foto entfernen"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {uploading > 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-claimondo-ondo" />
          <span>{uploading} Datei{uploading === 1 ? '' : 'en'} werden hochgeladen …</span>
        </div>
      ) : null}
    </section>
  )
}

function isBereich(v: string): v is Bereich {
  return (BEREICHE as readonly string[]).includes(v)
}

// Inline-SVG — der Client brauch für data-bereich-Clicks direkten DOM-Zugriff.
// Alternativ via <object data=... /> aber dann sind Events gekapselt.
const SVG_INLINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 600" class="h-auto w-full" role="img" aria-label="Fahrzeug-Draufsicht">
  <rect x="40" y="40" width="240" height="520" rx="60" ry="60" fill="#f8f9fb" stroke="#0D1B3E" stroke-width="2" />
  <path data-bereich="vorne" class="zone" d="M 40 100 Q 40 40 100 40 L 220 40 Q 280 40 280 100 L 280 140 L 40 140 Z" fill="transparent" stroke="#0D1B3E" />
  <path data-bereich="hinten" class="zone" d="M 40 460 L 280 460 L 280 500 Q 280 560 220 560 L 100 560 Q 40 560 40 500 Z" fill="transparent" stroke="#0D1B3E" />
  <path data-bereich="links" class="zone" d="M 40 140 L 120 140 L 120 460 L 40 460 Z" fill="transparent" stroke="#0D1B3E" />
  <path data-bereich="rechts" class="zone" d="M 200 140 L 280 140 L 280 460 L 200 460 Z" fill="transparent" stroke="#0D1B3E" />
  <path data-bereich="dach" class="zone" d="M 120 140 L 200 140 L 200 300 L 120 300 Z" fill="transparent" stroke="#0D1B3E" />
  <path data-bereich="innen" class="zone" d="M 120 300 L 200 300 L 200 460 L 120 460 Z" fill="transparent" stroke="#0D1B3E" />
  <path d="M 120 150 L 200 150 L 190 200 L 130 200 Z" fill="#7BA3CC" fill-opacity="0.3" pointer-events="none" />
  <path d="M 130 400 L 190 400 L 200 450 L 120 450 Z" fill="#7BA3CC" fill-opacity="0.3" pointer-events="none" />
  <g font-family="system-ui,sans-serif" font-size="12" fill="#0D1B3E" pointer-events="none">
    <text x="160" y="95" text-anchor="middle">Vorne</text>
    <text x="160" y="525" text-anchor="middle">Hinten</text>
    <text x="80" y="305" text-anchor="middle">Links</text>
    <text x="240" y="305" text-anchor="middle">Rechts</text>
    <text x="160" y="225" text-anchor="middle">Dach</text>
    <text x="160" y="385" text-anchor="middle">Innen</text>
  </g>
</svg>`
