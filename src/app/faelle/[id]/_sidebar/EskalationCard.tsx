'use client'

// Eskalations-Card in der Fallakten-Sidebar (KB-Sicht). Zeigt aktuellen
// Status, oeffnet Modal mit Admin-Auswahl. Eskalation = Admin uebernimmt
// mit, erscheint als read-only Card beim Kunden + chattet im KB-/Grupp-
// chat mit. Fuer Haertfaelle gedacht, nicht Standardablauf.

import { useEffect, useState, useTransition } from 'react'
import { ShieldAlertIcon, XIcon, CheckIcon } from 'lucide-react'
import {
  listAdminsFuerEskalation,
  eskaliereFallAnAdmin,
  eskalationZuruecknehmen,
} from './eskalation-actions'

type Props = {
  fallId: string
  /** Aktuell eskaliert? Wenn ja: adminId + Name fuer Anzeige */
  initialAdminId: string | null
  initialAdminName: string | null
}

type AdminOption = { id: string; vorname: string | null; nachname: string | null; email: string | null }

export default function EskalationCard({ fallId, initialAdminId, initialAdminName }: Props) {
  const [adminId, setAdminId] = useState<string | null>(initialAdminId)
  const [adminName, setAdminName] = useState<string | null>(initialAdminName)
  const [open, setOpen] = useState(false)
  const [admins, setAdmins] = useState<AdminOption[]>([])
  const [grund, setGrund] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void listAdminsFuerEskalation().then((res) => {
      if (res.ok) setAdmins(res.admins)
      else setError(res.error)
    })
  }, [open])

  // Wenn nur die ID vorliegt aber kein Name, einmalig die Admin-Liste
  // im Hintergrund laden um den Namen aufzuloesen.
  useEffect(() => {
    if (!adminId || adminName) return
    void listAdminsFuerEskalation().then((res) => {
      if (!res.ok) return
      const match = res.admins.find((a) => a.id === adminId)
      if (match) {
        setAdminName(
          [match.vorname, match.nachname].filter(Boolean).join(' ') || match.email || adminId.slice(0, 8),
        )
      }
    })
  }, [adminId, adminName])

  function handleEskalieren(targetAdminId: string, name: string) {
    startTransition(async () => {
      const res = await eskaliereFallAnAdmin(fallId, targetAdminId, grund.trim() || null)
      if (res.ok) {
        setAdminId(targetAdminId)
        setAdminName(name)
        setOpen(false)
        setGrund('')
      } else {
        setError(res.error ?? 'Eskalieren fehlgeschlagen')
      }
    })
  }

  function handleZuruecknehmen() {
    if (!window.confirm('Eskalation zuruecknehmen? Der Admin verliert den Zugriff auf den Chat.')) return
    startTransition(async () => {
      const res = await eskalationZuruecknehmen(fallId)
      if (res.ok) {
        setAdminId(null)
        setAdminName(null)
      } else {
        setError(res.error ?? 'Zuruecknahme fehlgeschlagen')
      }
    })
  }

  return (
    <div className="bg-white rounded-ios-md border border-claimondo-border p-3">
      <p className="text-[9px] font-semibold text-claimondo-ondo uppercase mb-2 flex items-center gap-1">
        <ShieldAlertIcon className="w-3 h-3" />
        Eskalation
      </p>
      {adminId && adminName ? (
        <div className="space-y-2">
          <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wider text-amber-700">An Admin eskaliert</p>
            <p className="text-xs font-semibold text-amber-900">{adminName}</p>
          </div>
          <button
            type="button"
            onClick={handleZuruecknehmen}
            disabled={pending}
            className="w-full text-[11px] text-claimondo-ondo hover:text-claimondo-navy underline disabled:opacity-50"
          >
            Zurücknehmen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          className="w-full text-left px-2 py-1.5 rounded-md border border-claimondo-border hover:bg-[#f8f9fb] disabled:opacity-50"
        >
          <p className="text-xs font-medium text-claimondo-navy">An Admin eskalieren</p>
          <p className="text-[10px] text-claimondo-ondo mt-0.5">
            Admin liest mit + chattet — für Hartfälle.
          </p>
        </button>
      )}
      {error && <p className="text-[10px] text-rose-600 mt-1">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center px-4 py-6">
          <div onClick={() => setOpen(false)} className="absolute inset-0 bg-claimondo-navy/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border">
              <h2 className="text-sm font-semibold text-claimondo-navy">An Admin eskalieren</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="text-claimondo-ondo hover:text-claimondo-navy p-1 rounded hover:bg-[#f8f9fb]"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-3 overflow-y-auto">
              <p className="text-xs text-claimondo-ondo">
                Wähle den Admin, der mit-betreuen soll. Er liest beide Chats mit und kann selbst schreiben.
              </p>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo">Grund (optional)</label>
                <input
                  type="text"
                  value={grund}
                  onChange={(e) => setGrund(e.target.value)}
                  placeholder="z.B. komplexe Schadenkonstellation"
                  className="w-full mt-1 px-3 py-2 text-sm border border-claimondo-border rounded-lg focus:outline-none focus:ring-2 focus:ring-claimondo-navy/30"
                />
              </div>
              <div className="space-y-1.5">
                {admins.length === 0 ? (
                  <p className="text-[11px] text-claimondo-ondo italic">Wird geladen …</p>
                ) : (
                  admins.map((a) => {
                    const fullName = [a.vorname, a.nachname].filter(Boolean).join(' ') || a.email || a.id.slice(0, 8)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleEskalieren(a.id, fullName)}
                        disabled={pending}
                        className="w-full flex items-center justify-between gap-2 rounded-lg border border-claimondo-border hover:bg-[#f8f9fb] px-3 py-2 text-left disabled:opacity-50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-claimondo-navy">{fullName}</p>
                          {a.email && <p className="text-[10px] text-claimondo-ondo">{a.email}</p>}
                        </div>
                        <CheckIcon className="w-4 h-4 text-emerald-600" />
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
