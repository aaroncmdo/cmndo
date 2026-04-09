'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCcwIcon } from 'lucide-react'

/**
 * KFZ-148/152: Wiederverwendbares Unterschrifts-Pad fuer Onboarding-Wizards.
 * Liefert beim Submit ein PNG data URI das direkt ins PDF eingebrannt werden kann.
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
  const [isEmpty, setIsEmpty] = useState(true)

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
