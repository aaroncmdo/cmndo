'use client'

// AAR-289: Kompakte Dokumente-Status-Übersicht für die rechte Spalte.
// Zeigt nur Pflicht-Status + Total-Count. Detail im Akte-Drawer.

import { CheckCircle2Icon, CircleIcon, FileTextIcon } from 'lucide-react'

type Pflichtdoc = {
  id: string
  dokument_typ: string
  status: string | null
  pflicht: boolean | null
}

const TYP_LABEL: Record<string, string> = {
  fahrzeugschein: 'Fahrzeugschein',
  schadensfotos: 'Schadensfotos',
  polizeibericht: 'Polizeibericht',
  polizeiliche_unfallmitteilung: 'Polizeibericht',
  gewerbenachweis: 'Gewerbenachweis',
  gf_vollmacht: 'GF-Vollmacht',
  halter_vollmacht: 'Halter-Vollmacht',
  halter_ausweis: 'Halter-Ausweis',
  aerztliches_attest: 'Ärztl. Attest',
  krankenhausbericht: 'Krankenhausbericht',
  au_bescheinigung: 'AU-Bescheinigung',
  mietwagenrechnung: 'Mietwagenrechnung',
  // AAR-353
  reparaturrechnung_vorschaden: 'Reparaturrechnung (Vorschaden)',
  kaufvertrag: 'Kaufvertrag',
  freigabe_bank: 'Freigabe Bank',
}

export function DokumenteUebersichtCard({
  pflichtdokumente,
  totalDokumente,
}: {
  pflichtdokumente: Pflichtdoc[]
  totalDokumente: number
}) {
  const sichtbarePflicht = pflichtdokumente.filter((d) => d.pflicht !== false)
  const erfuellt = sichtbarePflicht.filter((d) => d.status && d.status !== 'ausstehend')
  const offen = sichtbarePflicht.filter((d) => !d.status || d.status === 'ausstehend')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Dokumente
        </h3>
        <span className="text-[10px] text-gray-400">
          {erfuellt.length}/{sichtbarePflicht.length} Pflicht · {totalDokumente} gesamt
        </span>
      </div>

      {sichtbarePflicht.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">
          Keine Pflichtdokumente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sichtbarePflicht.slice(0, 6).map((d) => {
            const done = d.status && d.status !== 'ausstehend'
            const label = TYP_LABEL[d.dokument_typ] ?? d.dokument_typ
            return (
              <li key={d.id} className="flex items-center gap-2 text-xs">
                {done ? (
                  <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <CircleIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                )}
                <span className={done ? 'text-gray-700' : 'text-gray-500'}>{label}</span>
              </li>
            )
          })}
          {sichtbarePflicht.length > 6 && (
            <li className="text-[10px] text-gray-400 italic pt-1">
              + {sichtbarePflicht.length - 6} weitere — Details in der Akte
            </li>
          )}
        </ul>
      )}

      {offen.length > 0 && (
        <p className="text-[11px] text-amber-700 pt-2 border-t border-gray-100 flex items-center gap-1">
          <FileTextIcon className="w-3 h-3" />
          {offen.length} {offen.length === 1 ? 'Pflichtdokument fehlt' : 'Pflichtdokumente fehlen'}
        </p>
      )}
    </div>
  )
}
