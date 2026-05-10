'use client'

import { useRef } from 'react'
import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function SignatureField({ feld, value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    isDrawing.current = true
    ctx.beginPath()
    const pos = getPos(e, canvas)
    ctx.moveTo(pos.x, pos.y)
    e.preventDefault()
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current || disabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0D1B3E'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    e.preventDefault()
  }

  function endDraw() {
    if (!isDrawing.current) return
    isDrawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    onChange('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
          {feld.label}
          {feld.pflicht && <span style={{ color: '#FF9F0A', fontSize: 13 }}>*</span>}
        </label>
        {value && (
          <button type="button" onClick={clear} disabled={disabled}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--claimondo-ondo)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
            Löschen
          </button>
        )}
      </div>
      {feld.hint && (
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)', marginTop: -2, letterSpacing: '-.005em' }}>
          {feld.hint}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        style={{
          width: '100%', height: 160,
          background: value ? '#fff' : 'var(--wiz-fill)',
          border: `1.5px solid ${value ? 'var(--claimondo-ondo)' : 'transparent'}`,
          borderRadius: 'var(--wiz-r-sm)',
          cursor: disabled ? 'not-allowed' : 'crosshair',
          touchAction: 'none',
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {!value && (
        <p style={{ fontSize: 12, color: 'var(--wiz-text-3)', textAlign: 'center', marginTop: -2 }}>
          Hier unterschreiben
        </p>
      )}
    </div>
  )
}
