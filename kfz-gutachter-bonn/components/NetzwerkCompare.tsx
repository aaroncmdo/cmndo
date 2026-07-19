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

  // 08k A3.3: Der Toggle-BUTTON lebt jetzt als Server-Markup in der rechten
  // Spalte (#netzwerkCompareToggleDesk, Hoehen-Kopplung mit der Team-Karte) —
  // hier nur Binding + Label/aria-Spiegelung (Vanilla-Pattern wie SiteScripts).
  useEffect(() => {
    const btn = document.getElementById('netzwerkCompareToggleDesk')
    if (!btn) return
    const onClick = () => toggle()
    btn.addEventListener('click', onClick)
    return () => btn.removeEventListener('click', onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const btn = document.getElementById('netzwerkCompareToggleDesk')
    if (!btn) return
    btn.setAttribute('aria-expanded', String(open))
    const label = btn.querySelector('.netzwerk-toggle-label')
    if (label) label.textContent = open ? 'Vergleich ausblenden' : 'Komplett-Service im Vergleich ansehen'
    const chev = btn.querySelector('.netzwerk-toggle-chev') as HTMLElement | null
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)'
  }, [open])

  return (
    <div className="mt-2" id="netzwerkCompareWrap" ref={wrapRef}>
      <div
        id="netzwerkCompareTable"
        ref={panelRef}
        role="region"
        aria-labelledby="netzwerkCompareToggleDesk"
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
        {/* 08k A4.1: Schliessen oben rechts AN der Tabelle. */}
        <div className="flex justify-end bg-white/[.06]">
          <button
            type="button"
            onClick={toggle}
            className="px-4 py-2.5 text-[12px] font-semibold text-white/90 hover:text-white transition"
            aria-controls="netzwerkCompareTable"
          >
            Vergleich ausblenden ✕
          </button>
        </div>
        {/* Header (Desktop only) — 08k A4.2: 2-Farben-Disziplin, kein Akzent-BG,
            kein Link in der Tabelle (Acceptance 0 <a>). */}
        <div className="cmp-row-head hidden sm:grid grid-cols-[1.1fr_0.95fr_1.25fr]">
          <div className="px-4 py-4 text-[12px] font-bold tracking-[.02em] uppercase text-white/90 bg-white/[.06] leading-snug">
            Was passiert nach Ihrem Unfall?
          </div>
          <div className="px-4 py-4 text-[12px] font-bold tracking-[.02em] uppercase text-white/90 bg-white/[.06] leading-snug">
            Gutachter allein
          </div>
          <div className="px-4 py-4 text-[12px] font-bold tracking-[.02em] uppercase text-white bg-white/[.06] leading-snug">
            Bei uns (Claimondo-Netzwerk)
          </div>
        </div>

        {/* 08k A4.4: Gruppen-Labels statt 8 gleichfoermiger Zeilen + Zebra
            (white/3) statt Border-Mix; A4.2: "Gutachter allein" einheitlich
            white/50 mit "–", Antworten weiss, EIN Akzent (Cluster) fuer
            ✓-Haekchen + max. 1 Schluesselbegriff (renderRich-**bold**). */}
        {COMPARISON.map((row, i) => {
          const group =
            i === 0 ? 'Ihr Geld' : i === 3 ? 'Ihr Aufwand' : null
          return (
            <div key={i}>
              {group ? (
                <div className="px-4 py-2 font-mono text-[10.5px] font-bold tracking-[.16em] uppercase text-white/50 bg-white/[.06]">
                  {group}
                </div>
              ) : null}
              <div className={`cmp-row sm:grid grid-cols-[1.1fr_0.95fr_1.25fr] ${i % 2 === 1 ? 'bg-white/[.03]' : ''}`}>
                <div className="cmp-feat px-4 py-4 text-[13.5px] font-semibold text-white/90 leading-snug">{row.feat}</div>
                <div className="cmp-normal px-4 py-4 text-[13.5px] text-white/50 flex items-start gap-2.5 leading-snug">
                  <span className="flex-none mt-0.5 w-4 text-center font-bold text-white/50">–</span>
                  <div className="flex-1">{renderRich(row.normal, 'font-bold')}</div>
                </div>
                <div className="cmp-us px-4 py-4 text-[13.5px] text-white font-semibold flex items-start gap-2.5 leading-snug">
                  <span className="flex-none mt-0.5 w-4 text-center font-bold text-amber">✓</span>
                  <div className="flex-1">{renderRich(row.us, 'text-amber font-bold')}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* 08k A4.3: Die 16 Inline-Links sind aus der Tabelle raus — EIN Link-
          Cluster darunter (nur bei offener Tabelle sichtbar; Ziele = die
          bisherigen Ratgeber-URLs aus den normalLink-Daten). */}
      <p className={`mt-3 text-[12.5px] text-white/[.62] leading-relaxed ${open ? '' : 'hidden'}`}>
        Begriffe erklärt im Ratgeber:{' '}
        <a href="https://autounfall.io/wertminderung-249-bgb/" target="_blank" rel="noopener" className="underline underline-offset-2 text-white/90 hover:text-white">Wertminderung</a>
        {' · '}
        <a href="https://autounfall.io/mietwagen-anspruch/" target="_blank" rel="noopener" className="underline underline-offset-2 text-white/90 hover:text-white">Mietwagen-Anspruch</a>
        {' · '}
        <a href="https://autounfall.io/abtretungserklaerung/" target="_blank" rel="noopener" className="underline underline-offset-2 text-white/90 hover:text-white">Abtretung</a>
        {' →'}
      </p>
      {/* 08q Q2.3 · Gegengutachten-Fussnote (aus NetzwerkSection hierher) —
          nur bei offener Tabelle sichtbar, direkt unter der Vergleichszeile zur
          fachlichen Widerlegung; unter dem CTA bleibt nichts. */}
      <p className={`mt-3 text-[12px] text-white/[.55] leading-relaxed ${open ? '' : 'hidden'}`}>
        „Gegengutachten“ bezeichnet die fachliche Widerlegung eines Prüfberichts/Versicherergutachtens
        nach BVSK-Standard. Die erzielbare Auszahlung ist einzelfallabhängig.
      </p>
    </div>
  )
}
