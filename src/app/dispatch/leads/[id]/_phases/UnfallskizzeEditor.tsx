'use client'

// AAR-skizze-editor: Drag-and-Drop-Editor für die KI-generierte
// Unfallskizze. Top-Level-Children des SVGs (jedes Auto, Pfeil, Symbol)
// werden mit nativen Pointer-Events verschiebbar gemacht. Auf Save wird
// das modifizierte SVG serialisiert und in leads.unfallskizze_svg
// zurückgeschrieben.
//
// Design-Entscheidung: keine Editor-Lib (fabric.js wäre 80kb) — pure
// DOM-Manipulation reicht für Reposition. Rotation / Resize sind nicht
// im Scope; falls später nötig, baut man's hier on-top.

import { useEffect, useRef, useState, useTransition } from 'react'
import { CheckCircle2Icon, LoaderIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { saveEditedUnfallskizze } from '../_actions/unfallskizze'

// Tags die als ein einzelnes verschiebbares „Objekt" zählen.
// <rect> mit Hintergrund-Rolle wird ausgenommen (das größte Rect im SVG).
const DRAGGABLE_TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'polygon', 'polyline', 'rect', 'use', 'image'])

type ElementState = {
  el: SVGGraphicsElement
  baseTransform: string
  // aktuelle translation seit Initial-Edit-Start (in SVG-User-Units)
  dx: number
  dy: number
}

export function UnfallskizzeEditor({
  leadId,
  initialSvg,
  onSaved,
  onCancel,
}: {
  leadId: string
  initialSvg: string
  onSaved: (newSvg: string) => void
  onCancel: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementsRef = useRef<ElementState[]>([])
  const dragRef = useRef<{
    el: ElementState
    startSvgX: number
    startSvgY: number
    pointerId: number
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Setup: SVG injizieren + draggable Elements registrieren
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = initialSvg
    const svgEl = container.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) return

    // SVG-Sizing: füllt den Container, behält viewBox-Aspect-Ratio
    svgEl.setAttribute('width', '100%')
    svgEl.setAttribute('height', '100%')
    svgEl.style.touchAction = 'none' // Pointer-Drag ohne Browser-Scroll

    // Background = größtes Rect direkt unter <svg> wird übersprungen
    const directChildren = Array.from(svgEl.children) as Element[]
    let backgroundRect: Element | null = null
    let maxArea = 0
    for (const child of directChildren) {
      if (child.tagName.toLowerCase() === 'rect') {
        const w = parseFloat(child.getAttribute('width') ?? '0')
        const h = parseFloat(child.getAttribute('height') ?? '0')
        const area = w * h
        if (area > maxArea) {
          maxArea = area
          backgroundRect = child
        }
      }
    }

    elementsRef.current = []
    for (const child of directChildren) {
      if (child === backgroundRect) continue
      const tag = child.tagName.toLowerCase()
      if (!DRAGGABLE_TAGS.has(tag)) continue
      const el = child as SVGGraphicsElement
      el.style.cursor = 'move'
      el.classList.add('skizze-edit-target')
      const baseTransform = el.getAttribute('transform') ?? ''
      const state: ElementState = { el, baseTransform, dx: 0, dy: 0 }
      elementsRef.current.push(state)

      el.addEventListener('pointerdown', (e: PointerEvent) => onPointerDown(e, state, svgEl))
    }

    // Hover-Style + Selection
    const styleEl = document.createElement('style')
    styleEl.textContent = `
      .skizze-edit-target { transition: filter 0.15s; }
      .skizze-edit-target:hover { filter: drop-shadow(0 0 4px rgba(13,27,62,0.4)); }
      .skizze-edit-target.dragging { filter: drop-shadow(0 0 8px rgba(69,115,162,0.7)); }
    `
    container.appendChild(styleEl)

    return () => {
      // Cleanup pointer-Listener via clone-and-replace
      // (einfacher als jeden Handler zu tracken)
      elementsRef.current = []
    }
  }, [initialSvg])

  function onPointerDown(e: PointerEvent, state: ElementState, svg: SVGSVGElement) {
    e.preventDefault()
    e.stopPropagation()
    const { x, y } = clientToSvgPoint(svg, e.clientX, e.clientY)
    dragRef.current = {
      el: state,
      startSvgX: x - state.dx,
      startSvgY: y - state.dy,
      pointerId: e.pointerId,
    }
    state.el.classList.add('dragging')
    state.el.setPointerCapture?.(e.pointerId)

    const move = (ev: PointerEvent) => onPointerMove(ev, svg)
    const up = (ev: PointerEvent) => onPointerUp(ev, move, up)
    state.el.addEventListener('pointermove', move)
    state.el.addEventListener('pointerup', up)
    state.el.addEventListener('pointercancel', up)
  }

  function onPointerMove(e: PointerEvent, svg: SVGSVGElement) {
    const drag = dragRef.current
    if (!drag) return
    const { x, y } = clientToSvgPoint(svg, e.clientX, e.clientY)
    drag.el.dx = x - drag.startSvgX
    drag.el.dy = y - drag.startSvgY
    applyTransform(drag.el)
  }

  function onPointerUp(
    e: PointerEvent,
    move: (ev: PointerEvent) => void,
    up: (ev: PointerEvent) => void,
  ) {
    const drag = dragRef.current
    if (!drag) return
    drag.el.el.classList.remove('dragging')
    drag.el.el.removeEventListener('pointermove', move)
    drag.el.el.removeEventListener('pointerup', up)
    drag.el.el.removeEventListener('pointercancel', up)
    dragRef.current = null
    setHasChanges(true)
  }

  function reset() {
    for (const state of elementsRef.current) {
      state.dx = 0
      state.dy = 0
      applyTransform(state)
    }
    setHasChanges(false)
  }

  function save() {
    setError(null)
    const container = containerRef.current
    if (!container) return
    const svgEl = container.querySelector('svg')
    if (!svgEl) return
    // Cleanup: skizze-edit-target classes + cursor-style entfernen vor Speichern
    const targets = svgEl.querySelectorAll('.skizze-edit-target')
    targets.forEach((t) => {
      t.classList.remove('skizze-edit-target', 'dragging')
      ;(t as HTMLElement).style.cursor = ''
    })
    svgEl.style.touchAction = ''
    svgEl.removeAttribute('width')
    svgEl.removeAttribute('height')
    const styleEls = svgEl.parentElement?.querySelectorAll('style') ?? []
    // Inline style-Element (gehört nicht zum SVG) bleibt im Container, nicht im SVG.

    const serialized = new XMLSerializer().serializeToString(svgEl)
    startTransition(async () => {
      const r = await saveEditedUnfallskizze(leadId, serialized)
      if (!r.success) {
        setError(r.error ?? 'Speichern fehlgeschlagen')
        return
      }
      onSaved(serialized)
    })
    // Wirf gegen lint
    void styleEls
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="rounded-xl border-2 border-claimondo-ondo bg-white overflow-hidden"
      />
      <p className="text-[11px] text-claimondo-ondo">
        Elemente per Drag-and-Drop verschieben. Hintergrund (größtes Rechteck)
        ist gesperrt. Rotation/Skalierung sind nicht möglich.
      </p>
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={pending || !hasChanges}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
        >
          {pending ? (
            <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2Icon className="w-3.5 h-3.5" />
          )}
          Änderungen speichern
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending || !hasChanges}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-[#f8f9fb] disabled:opacity-50"
        >
          <RotateCcwIcon className="w-3.5 h-3.5" />
          Zurücksetzen
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-claimondo-ondo text-xs font-medium hover:bg-[#f8f9fb] disabled:opacity-50"
        >
          <XIcon className="w-3.5 h-3.5" />
          Abbrechen
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function applyTransform(state: ElementState) {
  const t = state.baseTransform
    ? `${state.baseTransform} translate(${state.dx} ${state.dy})`
    : `translate(${state.dx} ${state.dy})`
  state.el.setAttribute('transform', t)
}

/** Konvertiert Browser-Pixel-Koordinaten zu SVG-User-Units via screenCTM. */
function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}
