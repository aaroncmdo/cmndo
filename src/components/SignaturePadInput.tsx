'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCcwIcon } from 'lucide-react'

/**
 * KFZ-148/152: Wiederverwendbares Unterschrifts-Pad fuer Onboarding-Wizards.
 * Liefert beim Submit ein PNG data URI das direkt ins PDF eingebrannt werden kann.
 *
 * BUG-81 Fix (ARCH-1 Phase 1): Wenn die Component remounted wird (z.B. nach
 * Step-Wechsel im Wizard), wird der initial-`value` aus dem Parent-State via
 * signature_pad.fromDataURL() wieder ins Canvas gerendert. Davor: Canvas war
 * nach Step-Zurueck leer, obwohl der Parent-State die Unterschrift noch hatte.
 *
 * Pattern aus src/app/flow/signatur/[token]/SignaturPage.tsx generalisiert.
 */
export default function SignaturePadInput({
  value,
  onChange,
  height = 'h-44',
  background = 'rgb(255, 255, 255)',
  penColor = 'rgb(30, 58, 95)',
  placeholder = 'Hier unterschreiben',
}: {
  value: string | null               // PNG data URI
  onChange: (pngDataUri: string | null) => void
  height?: string
  background?: string
  penColor?: string
  placeholder?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<import('signature_pad').default | null>(null)
  // BUG-81: initial state basierend auf value damit der Placeholder nicht
  // faelschlich angezeigt wird wenn die Component mit einem value remounted wird
  const [isEmpty, setIsEmpty] = useState(!value)
  // BUG-81: initialValue beim Mount cachen damit die fromDataURL-Restore-Logik
  // im useEffect den Wert sieht (useEffect closure ueber initial value)
  const initialValueRef = useRef<string | null>(value)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cleanup: (() => void) | null = null

    import('signature_pad').then(({ default: SignaturePad }) => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)

      const pad = new SignaturePad(canvas, {
        backgroundColor: background,
        penColor,
        minWidth: 1.5,
        maxWidth: 3.0,
      })

      const handleEnd = () => {
        setIsEmpty(false)
        onChange(pad.toDataURL('image/png'))
      }
      pad.addEventListener('endStroke', handleEnd)
      padRef.current = pad

      // BUG-81 Fix: wenn beim Mount schon ein value im Parent-State ist
      // (z.B. nach Step-Zurueck im Wizard), restore das Bild ins Canvas damit
      // die Unterschrift weiterhin sichtbar ist und der User nicht
      // versehentlich denkt sie sei verloren.
      if (initialValueRef.current) {
        pad.fromDataURL(initialValueRef.current, { ratio: 1 })
        setIsEmpty(false)
      }

      const handleResize = () => {
        if (!padRef.current) return
        const r = Math.max(window.devicePixelRatio || 1, 1)
        canvas.width = canvas.offsetWidth * r
        canvas.height = canvas.offsetHeight * r
        const c = canvas.getContext('2d')
        if (c) c.scale(r, r)
        padRef.current.clear()
        setIsEmpty(true)
        onChange(null)
      }
      window.addEventListener('resize', handleResize)

      cleanup = () => {
        window.removeEventListener('resize', handleResize)
        padRef.current?.off()
        padRef.current = null
      }
    })

    return () => { cleanup?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClear() {
    padRef.current?.clear()
    setIsEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className={`relative rounded-xl overflow-hidden border-2 border-gray-300 ${height}`}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none block"
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <p className="text-xs text-gray-400">{placeholder}</p>
          </div>
        )}
      </div>
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RotateCcwIcon className="w-3 h-3" />
          Loeschen
        </button>
      </div>
    </div>
  )
}
