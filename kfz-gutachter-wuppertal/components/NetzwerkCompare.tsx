'use client'

import { useEffect, useRef, useState } from 'react'
import { COMPARISON } from '@/lib/content'
import { renderRich } from '@/lib/text'
import { trackEvent } from '@/lib/tracking'

// CLIENT-Sub-Komponente der NetzwerkSection: Toggle + smooth collapsible
// Vergleichstabelle (8 Zeilen aus COMPARISON). Animation via max-height-Transition
// wie Mock (preview-complete.html Z633-862). Auto-Close on viewport leave +
// Mobile-Scroll-into-view portiert aus dem Mock-Toggle-Script.
export function NetzwerkCompare() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // max-height-Transition: beim Aufklappen scrollHeight messen, nach Transition
  // auf 'none' setzen (responsive-Resize), beim Zuklappen erst Pixel-Wert dann 0.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    let t1: number | undefined
    let t2: number | undefined

    if (open) {
      panel.style.maxHeight = panel.scrollHeight + 'px'
      t1 = window.setTimeout(() => {
        panel.style.maxHeight = 'none'
      }, 450)

      // Mobile: sanft zum Tabellen-Container scrollen
      if (window.matchMedia('(max-width: 767px)').matches) {
        t2 = window.setTimeout(() => {
          const headerH = 92
          const rect = panel.getBoundingClientRect()
          const target = window.pageYOffset + rect.top - headerH - 12
          window.scrollTo({ top: target, behavior: 'smooth' })
        }, 100)
      }
    } else {
      panel.style.maxHeight = panel.scrollHeight + 'px'
      requestAnimationFrame(() => {
        panel.style.maxHeight = '0px'
      })
    }

    return () => {
      if (t1) window.clearTimeout(t1)
      if (t2) window.clearTimeout(t2)
    }
  }, [open])

  // Auto-Close on viewport leave (Mobile aggressiver, Desktop mit Puffer).
  useEffect(() => {
    if (!open) return
    if (!('IntersectionObserver' in window)) return
    const node = wrapRef.current ?? panelRef.current
    if (!node) return
    const isMobile = window.matchMedia('(max-width: 767px)').matches
    const margin = isMobile ? '0px 0px -10% 0px' : '300px 0px 300px 0px'
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            setOpen(false)
            trackEvent('netzwerk_compare_close', { reason: 'auto_viewport_leave' })
          }
        }
      },
      { root: null, rootMargin: margin, threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [open])

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      trackEvent(next ? 'netzwerk_compare_open' : 'netzwerk_compare_close', next ? {} : { reason: 'click' })
      return next
    })
  }

  return (
    <div className="mt-2" id="netzwerkCompareWrap" ref={wrapRef}>
      <button
        type="button"
        id="netzwerkCompareToggle"
        aria-expanded={open}
        aria-controls="netzwerkCompareTable"
        onClick={toggle}
        className="inline-flex items-center gap-2 cursor-pointer bg-amber text-white font-display font-semibold text-sm px-[18px] py-2.5 rounded-full shadow-[0_4px_12px_rgba(229,55,43,.28)] hover:bg-amber-700 hover:-translate-y-px transition border-0"
      >
        <span className="netzwerk-toggle-label">
          {open ? 'Vergleich ausblenden' : 'Komplett-Service-Vergleich anzeigen'}
        </span>
        <span
          className="netzwerk-toggle-icon inline-grid place-items-center w-5 h-5 rounded-full bg-white/[.22] text-white text-sm font-bold transition-transform duration-300"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
        >
          +
        </span>
      </button>
      <div
        id="netzwerkCompareTable"
        ref={panelRef}
        role="region"
        aria-labelledby="netzwerkCompareToggle"
        className="border border-white/[.14] rounded-2xl overflow-hidden"
        style={{
          maxHeight: 0,
          opacity: open ? 1 : 0,
          borderWidth: open ? '1px' : '0',
          marginTop: open ? '1rem' : '0',
          transition:
            'max-height .42s cubic-bezier(.4,0,.2,1), opacity .25s ease .05s, margin-top .42s cubic-bezier(.4,0,.2,1), border-width 0s .42s',
        }}
      >
        {/* Header (Desktop only) */}
        <div className="cmp-row-head hidden sm:grid grid-cols-[1.1fr_0.95fr_1.25fr]">
          <div className="px-4 py-4 text-[12px] font-bold tracking-[.02em] uppercase text-white/70 bg-white/[.06] leading-snug">
            Was passiert nach Ihrem Unfall?
          </div>
          <div className="px-4 py-4 text-[12px] font-bold tracking-[.02em] uppercase text-white/70 bg-white/[.06] leading-snug">
            Gutachter allein
          </div>
          <div className="px-4 py-4 text-[12px] font-bold tracking-[.02em] uppercase text-white bg-[color-mix(in_srgb,var(--amber)_24%,transparent)] leading-snug">
            Bei uns (Claimondo-Netzwerk)
          </div>
        </div>

        {COMPARISON.map((row, i) => {
          const featClasses = row.highlight
            ? 'cmp-feat px-4 py-4 text-[13.5px] font-bold text-white bg-white/[.06] border-t border-white/[.09] leading-snug'
            : 'cmp-feat px-4 py-4 text-[13.5px] font-semibold text-white/[.92] bg-white/[.04] border-t border-white/[.09] leading-snug'
          const usBg = row.highlight
            ? 'bg-[color-mix(in_srgb,var(--amber)_14%,transparent)]'
            : 'bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]'
          return (
            <div
              key={i}
              className={
                row.highlight
                  ? 'cmp-row sm:grid grid-cols-[1.1fr_0.95fr_1.25fr] sm:border-l-2 sm:border-amber'
                  : 'cmp-row sm:grid grid-cols-[1.1fr_0.95fr_1.25fr]'
              }
              style={row.highlight ? { background: 'color-mix(in srgb, var(--amber) 7%, transparent)' } : undefined}
            >
              <div className={featClasses}>{row.feat}</div>
              <div className="cmp-normal px-4 py-4 text-[13.5px] text-white/60 border-t border-white/[.09] flex items-start gap-2.5 leading-snug">
                <span className="flex-none mt-0.5 w-4 text-center font-bold text-white/35">–</span>
                <div className="flex-1">
                  {renderRich(row.normal, 'font-bold')}
                  {row.normalLink ? (
                    <a
                      href={row.normalLink.href}
                      target="_blank"
                      rel="noopener"
                      className="hidden sm:block mt-1.5 text-[11.5px] text-white/45 underline underline-offset-2 hover:text-white/70"
                    >
                      {row.normalLink.label}
                    </a>
                  ) : null}
                </div>
              </div>
              <div
                className={`cmp-us px-4 py-4 text-[13.5px] text-white font-semibold border-t border-white/[.09] flex items-start gap-2.5 leading-snug ${usBg}`}
              >
                <span className="flex-none mt-0.5 w-4 text-center font-bold text-green">✓</span>
                <div className="flex-1">{renderRich(row.us, 'text-amber font-bold')}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
