'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPinIcon, MailIcon, PlusIcon, UploadIcon, RefreshCwIcon, XIcon, SearchIcon } from 'lucide-react'
import { Drawer, Button } from '@/components/primitives'
import type { DeadPin, LiveOpsRole } from '@/lib/live-ops'
import {
  createSvLead,
  sendeSvLeadEinladung,
  sendeAlleOffenenEinladungen,
  importSvLeadsAction,
  datSyncAusfuehren,
} from '@/app/admin/sv-leads/actions'

// ─── Status-Hilfsfunktionen ─────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  offen: 'Offen',
  beansprucht_pending: 'Beansprucht (ausstehend)',
  beansprucht: 'Beansprucht',
  konvertiert: 'Konvertiert',
  abgelehnt: 'Abgelehnt',
}

const STATUS_TOKEN_CLASSES: Record<string, string> = {
  offen: 'bg-info-soft text-info-strong',
  beansprucht_pending: 'bg-warning-soft text-warning-strong',
  beansprucht: 'bg-info-soft text-info-strong',
  konvertiert: 'bg-success-soft text-success-strong',
  abgelehnt: 'bg-danger-soft text-danger-strong',
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s
}

function statusTokenClass(s: string): string {
  return STATUS_TOKEN_CLASSES[s] ?? 'bg-claimondo-bg text-claimondo-navy'
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DeadPinDrawerProps {
  pins: DeadPin[]
  openId: string | null
  onClose: () => void
  role: LiveOpsRole
  neuerCoord?: { lng: number; lat: number } | null
  onAnlegeModus: (on: boolean) => void
}

// ─── Anlege-Formular ─────────────────────────────────────────────────────────

interface AnlegeFormProps {
  coord: { lng: number; lat: number }
  onSuccess: () => void
  onAbbrechen: () => void
}

function AnlegeForm({ coord, onSuccess, onAbbrechen }: AnlegeFormProps) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('adresse', `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`)
    fd.set('lat', String(coord.lat))
    fd.set('lng', String(coord.lng))

    startTransition(async () => {
      const result = await createSvLead(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Dead-Pin angelegt.')
      onSuccess()
    })
  }

  return (
    <div className="border border-claimondo-border rounded-ios-md p-4 bg-claimondo-bg mb-4">
      <h3 className="text-body font-semibold text-claimondo-navy mb-1">Neuer Dead-Pin</h3>
      <p className="text-caption text-claimondo-ondo mb-3">
        Koordinate: {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <label className="text-caption text-claimondo-ondo block mb-0.5">
            Name <span className="text-danger-strong">*</span>
          </label>
          <input
            name="name"
            required
            placeholder="z.B. Max Mustermann"
            className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-1.5 text-body-sm text-claimondo-navy placeholder:text-claimondo-border focus:outline-none focus:ring-1 focus:ring-claimondo-navy"
          />
        </div>
        <div>
          <label className="text-caption text-claimondo-ondo block mb-0.5">Firma (optional)</label>
          <input
            name="firma"
            placeholder="z.B. Muster Gutachten GmbH"
            className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-1.5 text-body-sm text-claimondo-navy placeholder:text-claimondo-border focus:outline-none focus:ring-1 focus:ring-claimondo-navy"
          />
        </div>
        <div>
          <label className="text-caption text-claimondo-ondo block mb-0.5">Quelle</label>
          <input
            name="quelle"
            defaultValue="karte"
            className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-1.5 text-body-sm text-claimondo-navy placeholder:text-claimondo-border focus:outline-none focus:ring-1 focus:ring-claimondo-navy"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAbbrechen}
            disabled={isPending}
            type="button"
          >
            Abbrechen
          </Button>
          <Button variant="navy" size="sm" type="submit" loading={isPending}>
            Anlegen
          </Button>
        </div>
      </form>
    </div>
  )
}

// ─── Pin-Detail-Panel ────────────────────────────────────────────────────────

interface PinDetailProps {
  pin: DeadPin
  onBack: () => void
  role: LiveOpsRole
}

function PinDetail({ pin, onBack, role }: PinDetailProps) {
  const router = useRouter()
  const [einladenPending, startEinladen] = useTransition()
  const [bulkPending, startBulk] = useTransition()
  const [datPending, startDat] = useTransition()

  function handleEinladen() {
    startEinladen(async () => {
      const result = await sendeSvLeadEinladung(pin.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.gesendet) {
        toast.success('Einladung gesendet.')
      } else {
        toast.info('Kein Kontaktweg vorhanden — Einladung nicht gesendet.')
      }
      router.refresh()
    })
  }

  function handleAlleEinladen() {
    startBulk(async () => {
      const result = await sendeAlleOffenenEinladungen()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.gesendet} eingeladen, ${result.uebersprungen} übersprungen.`)
      router.refresh()
    })
  }

  function handleDatSync() {
    startDat(async () => {
      const result = await datSyncAusfuehren()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`DAT-Sync: ${result.importiert} importiert.`)
      router.refresh()
    })
  }

  const canInvite = role === 'admin' || role === 'dispatch'

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-caption text-claimondo-ondo hover:text-claimondo-navy mb-4 transition-colors"
        type="button"
      >
        ← Zurück zur Liste
      </button>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">{pin.name}</h2>
          <span className={`shrink-0 px-2 py-0.5 rounded-ios-sm text-caption font-medium ${statusTokenClass(pin.status)}`}>
            {statusLabel(pin.status)}
          </span>
        </div>
        {pin.firma && (
          <p className="text-body-sm text-claimondo-ondo">{pin.firma}</p>
        )}
        {pin.region && (
          <p className="text-caption text-claimondo-ondo flex items-center gap-1 mt-1">
            <MapPinIcon className="w-3 h-3" />
            {pin.region}
          </p>
        )}
        {pin.quelle && (
          <p className="text-caption text-claimondo-ondo mt-0.5">
            Quelle: {pin.quelle}
          </p>
        )}
      </div>

      {/* Primäre Aktionen */}
      {canInvite && (
        <div className="space-y-2 mb-6">
          <Button
            variant="navy"
            fullWidth
            onClick={handleEinladen}
            loading={einladenPending}
            iconLeft={<MailIcon className="w-4 h-4" />}
          >
            Einladen
          </Button>
          <a
            href="/admin/vertrieb/sachverstaendige/leads"
            className="flex items-center justify-center w-full rounded-ios-md border border-claimondo-border py-2 text-body-sm text-claimondo-navy hover:bg-claimondo-bg transition-colors"
          >
            In SV-Leads öffnen →
          </a>
        </div>
      )}

      {/* Sekundäre Aktionen (Admin only) */}
      {role === 'admin' && (
        <div className="border-t border-claimondo-border pt-4 space-y-2">
          <p className="text-caption text-claimondo-ondo mb-2">Weitere Aktionen</p>
          <Button
            variant="ghost"
            fullWidth
            onClick={handleAlleEinladen}
            loading={bulkPending}
            iconLeft={<MailIcon className="w-4 h-4" />}
          >
            Alle offenen einladen
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={handleDatSync}
            loading={datPending}
            iconLeft={<RefreshCwIcon className="w-4 h-4" />}
          >
            DAT-Sync ausführen
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Status-Filter-Typ ───────────────────────────────────────────────────────

type FilterStatus = 'alle' | 'offen' | 'beansprucht' | 'beansprucht_pending' | 'konvertiert' | 'abgelehnt'

// ─── Haupt-Drawer ────────────────────────────────────────────────────────────

export default function DeadPinDrawer({
  pins,
  openId,
  onClose,
  role,
  neuerCoord,
  onAnlegeModus,
}: DeadPinDrawerProps) {
  const router = useRouter()
  const [suche, setSuche] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('alle')
  // selectedPinId: für Klicks auf Pins in der Liste (nicht vom Karten-Klick)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [importPending, startImport] = useTransition()

  const isOpen = openId !== null || neuerCoord != null

  // Aktiver Pin: erstmal aus openId (Karten-Klick), dann aus selectedPinId (Listen-Klick)
  const effectiveId = openId ?? selectedPinId
  const activePin = effectiveId ? pins.find((p) => p.id === effectiveId) ?? null : null

  const showDetail = activePin !== null
  const showAnlegeForm = neuerCoord != null && !showDetail

  // Gefilterte Pins für die Liste
  const gefiltert = pins.filter((p) => {
    const matchStatus = filterStatus === 'alle' || p.status === filterStatus
    const q = suche.toLowerCase()
    const matchSuche =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.firma && p.firma.toLowerCase().includes(q)) ||
      (p.region && p.region.toLowerCase().includes(q))
    return matchStatus && matchSuche
  })

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    startImport(async () => {
      const result = await importSvLeadsAction(text)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.importiert > 0) {
        toast.success(
          `${result.importiert} importiert.${result.fehler.length > 0 ? ` ${result.fehler.length} übersprungen.` : ''}`
        )
      } else {
        toast.warning(`0 importiert — ${result.fehler.length} übersprungen.`)
      }
      router.refresh()
    })
  }

  function handleBack() {
    setSelectedPinId(null)
    onClose()
  }

  function handleListPinBack() {
    setSelectedPinId(null)
  }

  return (
    <Drawer
      open={isOpen}
      onClose={() => {
        setSelectedPinId(null)
        onClose()
      }}
      side="right"
      width={460}
      ariaLabel="Dead-Pin-Verwaltung"
      noPadding
      hideCloseButton
    >
      <div className="flex flex-col h-full">
        {/* ── Drawer-Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border shrink-0">
          <div className="flex items-center gap-2">
            <MapPinIcon className="w-5 h-5 text-claimondo-navy" />
            <h2 className="text-heading-sm font-semibold text-claimondo-navy">Dead-Pins</h2>
            <span className="text-caption text-claimondo-ondo">({pins.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Anlege-Modus-Button: Admin klickt auf Karte */}
            {role === 'admin' && !showDetail && !showAnlegeForm && (
              <Button
                variant="navy"
                size="sm"
                onClick={() => {
                  onAnlegeModus(true)
                  onClose()
                }}
                iconLeft={<PlusIcon className="w-3.5 h-3.5" />}
              >
                Karte anklicken
              </Button>
            )}
            <button
              onClick={() => {
                setSelectedPinId(null)
                onClose()
              }}
              className="p-1 rounded-ios-sm hover:bg-claimondo-bg text-claimondo-ondo transition-colors"
              aria-label="Schließen"
              type="button"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Drawer-Body ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Anlege-Formular (Koordinate vom Karten-Klick) */}
          {showAnlegeForm && neuerCoord && (
            <AnlegeForm
              coord={neuerCoord}
              onSuccess={() => {
                router.refresh()
                onAnlegeModus(false)
                onClose()
              }}
              onAbbrechen={() => {
                onAnlegeModus(false)
                onClose()
              }}
            />
          )}

          {/* Detail-Ansicht */}
          {showDetail && activePin && (
            <PinDetail
              pin={activePin}
              onBack={openId ? handleBack : handleListPinBack}
              role={role}
            />
          )}

          {/* Listen-Ansicht */}
          {!showDetail && !showAnlegeForm && (
            <>
              {/* Suche */}
              <div className="relative mb-3">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo pointer-events-none" />
                <input
                  type="search"
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                  placeholder="Name, Firma, Region…"
                  className="w-full rounded-ios-md border border-claimondo-border bg-white pl-8 pr-3 py-1.5 text-body-sm text-claimondo-navy placeholder:text-claimondo-border focus:outline-none focus:ring-1 focus:ring-claimondo-navy"
                />
              </div>

              {/* Status-Filter */}
              <div className="flex gap-1.5 flex-wrap mb-4">
                {(['alle', 'offen', 'beansprucht_pending', 'beansprucht', 'konvertiert', 'abgelehnt'] as FilterStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilterStatus(s)}
                    className={`px-2 py-0.5 rounded-ios-sm text-caption font-medium border transition-colors ${
                      filterStatus === s
                        ? 'bg-claimondo-navy text-white border-claimondo-navy'
                        : 'bg-white text-claimondo-ondo border-claimondo-border hover:bg-claimondo-bg'
                    }`}
                  >
                    {s === 'alle' ? 'Alle' : statusLabel(s)}
                  </button>
                ))}
              </div>

              {/* Pin-Liste */}
              {gefiltert.length === 0 ? (
                <p className="text-center text-body-sm text-claimondo-ondo py-8">
                  Keine Dead-Pins gefunden.
                </p>
              ) : (
                <ul className="space-y-1">
                  {gefiltert.map((pin) => (
                    <li key={pin.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPinId(pin.id)}
                        className="w-full text-left px-3 py-2.5 rounded-ios-md hover:bg-claimondo-bg transition-colors border border-transparent hover:border-claimondo-border"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-body-sm font-medium text-claimondo-navy truncate">{pin.name}</p>
                            {pin.firma && (
                              <p className="text-caption text-claimondo-ondo truncate">{pin.firma}</p>
                            )}
                            {pin.region && (
                              <p className="text-caption text-claimondo-ondo flex items-center gap-1 mt-0.5">
                                <MapPinIcon className="w-2.5 h-2.5 shrink-0" />
                                {pin.region}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded-ios-sm text-caption font-medium ${statusTokenClass(pin.status)}`}>
                            {statusLabel(pin.status)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* ── Drawer-Footer: Bulk-Import ────────────────────────── */}
        {role === 'admin' && !showDetail && !showAnlegeForm && (
          <div className="border-t border-claimondo-border px-5 py-3 shrink-0">
            <label
              className={`flex items-center gap-2 cursor-pointer text-body-sm text-claimondo-ondo hover:text-claimondo-navy transition-colors ${importPending ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <UploadIcon className="w-4 h-4" />
              Bulk-Import (CSV)
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportFile}
                disabled={importPending}
                className="sr-only"
              />
            </label>
          </div>
        )}
      </div>
    </Drawer>
  )
}
