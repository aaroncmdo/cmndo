'use client'

// AAR P2d-2b (dispatch-config-unify): geteilter Parts-Editor fürs Kennzeichen
// (Stadt / Kennung / Zahl / Typ) — extrahiert aus dem Phase-4-Inline-Edit, damit
// die flache Dispatcher-Form (v2-Override) und die Phase-4-Stammdaten dieselbe
// Rich-Eingabe nutzen.
//
// Persistenz-agnostisch: die Komponente besitzt nur den Eingabe-State + die
// Live-Vorschau und ruft `onSave(fields)` mit dem fertigen Spalten-Update auf.
// Label + Save-Status besitzt der Consumer (Phase 4 inline, v2 via
// OverrideFieldShell) — deshalb rendert sie hier KEIN Label und KEINE Icons.
// Liegt unter components/shared/, darf also nicht auf route-lokale Server-Actions
// zugreifen (saveStammdaten bleibt Sache des Consumers).

import { useEffect, useState } from 'react'
import {
  buildKennzeichen,
  buildKennzeichenFields,
  type KennzeichenFields,
} from '@/lib/format/kennzeichen'

export type KennzeichenPartsValue = {
  kreis?: string | null
  buchstaben?: string | null
  zahl?: string | null
  suffix?: string | null
}

export function KennzeichenPartsInput({
  value,
  syncEnabled,
  onSave,
}: {
  value: KennzeichenPartsValue
  // Wenn true werden lokale Felder mit frischen Server-Werten nachgezogen (z.B.
  // nach OCR/Refresh). Der Consumer setzt das auf false während Save/Edit, damit
  // der Sync die Eingabe des MA nicht überschreibt.
  syncEnabled: boolean
  onSave: (fields: KennzeichenFields) => void
}) {
  const [kreis, setKreis] = useState((value.kreis ?? '').toUpperCase())
  const [buchstaben, setBuchstaben] = useState((value.buchstaben ?? '').toUpperCase())
  const [zahl, setZahl] = useState(value.zahl ?? '')
  const [suffix, setSuffix] = useState<'E' | 'H' | ''>(
    value.suffix === 'E' || value.suffix === 'H' ? value.suffix : '',
  )

  // Server-Werte nachziehen, solange der Consumer im Idle-Zustand ist.
  useEffect(() => {
    if (syncEnabled) setKreis((value.kreis ?? '').toUpperCase())
  }, [value.kreis, syncEnabled])
  useEffect(() => {
    if (syncEnabled) setBuchstaben((value.buchstaben ?? '').toUpperCase())
  }, [value.buchstaben, syncEnabled])
  useEffect(() => {
    if (syncEnabled) setZahl(value.zahl ?? '')
  }, [value.zahl, syncEnabled])
  useEffect(() => {
    if (syncEnabled) setSuffix(value.suffix === 'E' || value.suffix === 'H' ? value.suffix : '')
  }, [value.suffix, syncEnabled])

  function handleSave(k: string, b: string, z: string, s: string) {
    onSave(buildKennzeichenFields(k, b, z, s))
  }

  const inputCls =
    'text-sm font-medium bg-transparent border-b border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo w-full py-0.5 outline-none uppercase tracking-wide text-center'

  return (
    <div className="space-y-0.5">
      <div className="flex items-end gap-1">
        {/* Stadt / Kreis */}
        <div className="flex-[1.5] space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Stadt</span>
          <input
            type="text"
            value={kreis}
            maxLength={3}
            onChange={(e) => setKreis(e.target.value.toUpperCase().replace(/[^A-ZÄÖÜ]/g, ''))}
            onBlur={() => handleSave(kreis, buchstaben, zahl, suffix)}
            placeholder="K"
            className={inputCls}
          />
        </div>
        <span className="text-claimondo-ondo/40 pb-0.5 text-sm font-light">–</span>
        {/* Kennung / Buchstaben */}
        <div className="flex-[1.5] space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Kennung</span>
          <input
            type="text"
            value={buchstaben}
            maxLength={2}
            onChange={(e) => setBuchstaben(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onBlur={() => handleSave(kreis, buchstaben, zahl, suffix)}
            placeholder="AS"
            className={inputCls}
          />
        </div>
        <span className="pb-0.5 text-claimondo-ondo/20 text-sm"> </span>
        {/* Zahl */}
        <div className="flex-[2] space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Zahl</span>
          <input
            type="text"
            value={zahl}
            maxLength={4}
            onChange={(e) => setZahl(e.target.value.replace(/\D/g, ''))}
            onBlur={() => handleSave(kreis, buchstaben, zahl, suffix)}
            placeholder="1234"
            className={inputCls}
          />
        </div>
        {/* Suffix E / H */}
        <div className="space-y-0.5">
          <span className="text-[9px] text-claimondo-ondo/50 block text-center">Typ</span>
          <select
            value={suffix}
            onChange={(e) => {
              const v = e.target.value as 'E' | 'H' | ''
              setSuffix(v)
              handleSave(kreis, buchstaben, zahl, v)
            }}
            className="text-sm font-medium bg-transparent border-b border-claimondo-border focus:border-claimondo-ondo py-0.5 outline-none w-14"
            title="E = Elektro, H = Oldtimer"
          >
            <option value="">–</option>
            <option value="E">E ⚡</option>
            <option value="H">H 🏛</option>
          </select>
        </div>
      </div>
      {kreis && zahl && (
        <p className="text-[10px] text-claimondo-ondo/60 font-mono pt-0.5">
          {buildKennzeichen(kreis, buchstaben, zahl, suffix || null)}
        </p>
      )}
    </div>
  )
}
