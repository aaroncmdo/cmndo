'use client'

import { useEffect } from 'react'
import { CLUSTER, waHref, type City } from '@/lib/cluster'

// CLIENT-Section: schwebender Schnellkontakt-Stack + Mobile-Sticky-Anruf-Bar +
// Back-to-Top. Mock-Zeilen 1088-1151.
// - Monika-Chat-Bubble (#waBubble) + State-Machine WEGGELASSEN (Phase 2 / MonikaEmbedSlot).
//   Die Pill ist deshalb ein reiner WhatsApp-Link (kein data-action="pill_chat_click")
//   und statisch immer-expanded (kein collapsed/expanded-Toggle).
// - Telefon/WhatsApp aus CLUSTER (cluster.ts ist Single-Source — Mock-tel weicht ab).
// - KEIN eigenes Klick-Tracking: data-cta-Attribute reichen, SiteScripts delegiert.
// - Scroll-Gating: mobil (<640px) erst sichtbar wenn Hero-CTA (#heroCallCta) out-of-view,
//   Desktop dauerhaft sichtbar (is-visible direkt gesetzt).
export function FabStack({ city }: { city: City }) {
  useEffect(() => {
    const gated = Array.from(document.querySelectorAll<HTMLElement>('.fab-scroll-gated'))
    const mobileMq = window.matchMedia('(max-width: 639px)')

    let observer: IntersectionObserver | null = null
    const heroCta = document.getElementById('heroCallCta')

    function showAll() {
      gated.forEach((el) => el.classList.add('is-visible'))
    }
    function hideAll() {
      gated.forEach((el) => el.classList.remove('is-visible'))
    }

    function applyGating() {
      observer?.disconnect()
      observer = null
      if (mobileMq.matches && heroCta && 'IntersectionObserver' in window) {
        // Mobile: gated-Elemente nur sichtbar wenn Hero-CTA aus dem Viewport
        hideAll()
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) hideAll()
              else showAll()
            }
          },
          { threshold: 0 },
        )
        observer.observe(heroCta)
      } else {
        // Desktop (oder kein Hero-CTA): dauerhaft sichtbar
        showAll()
      }
    }

    applyGating()
    // matchMedia-Wechsel (Resize/Orientation) → Gating neu anwenden
    const onMqChange = () => applyGating()
    if (mobileMq.addEventListener) mobileMq.addEventListener('change', onMqChange)
    else mobileMq.addListener(onMqChange)

    // Back-to-Top: ab 500px Scroll einblenden
    const backToTop = document.getElementById('backToTop')
    function onScroll() {
      if (!backToTop) return
      const visible = window.scrollY > 500
      backToTop.style.opacity = visible ? '1' : '0'
      backToTop.style.pointerEvents = visible ? 'auto' : 'none'
    }
    function onBackToTopClick() {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    backToTop?.addEventListener('click', onBackToTopClick)
    onScroll()

    return () => {
      observer?.disconnect()
      if (mobileMq.removeEventListener) mobileMq.removeEventListener('change', onMqChange)
      else mobileMq.removeListener(onMqChange)
      window.removeEventListener('scroll', onScroll)
      backToTop?.removeEventListener('click', onBackToTopClick)
    }
  }, [city])

  return (
    // <aside> = complementary-Landmark: enthält alle Floating-CTAs, damit kein
    // Inhalt außerhalb einer Landmark liegt (axe "region"). position:fixed-Kinder
    // bleiben viewport-bezogen, da <aside> kein transform/filter setzt.
    <aside aria-label="Schnellkontakt und Soforthilfe">
      {/* ===== FAB-STACK ===== (Mobil: initial versteckt, fade-in nach Hero-CTA out-of-view) */}
      <div
        className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3 fab-scroll-gated"
        id="fabStack"
        aria-label="Schnellkontakt"
        style={{ transition: 'opacity .3s ease, transform .3s ease' }}
      >
        {/* WA-Button */}
        <a
          className="w-14 h-14 rounded-full bg-green text-white grid place-items-center shadow-md hover:-translate-y-px transition"
          id="fabWa"
          href={waHref(city)}
          data-cta="fab_wa"
          aria-label="WhatsApp schreiben"
        >
          <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.63.714.225 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 0 1-1.516-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
          </svg>
        </a>
        {/* Tel-Button (Mobil ausgeblendet — Sticky-Bar deckt Anruf ab) */}
        <a
          className="hidden sm:grid w-14 h-14 rounded-full bg-amber text-white place-items-center shadow-md hover:-translate-y-px transition"
          href={`tel:${CLUSTER.phone.tel}`}
          data-cta="fab_call"
          aria-label="Jetzt anrufen"
        >
          <svg
            className="w-6 h-6 stroke-current fill-none"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </a>
        {/* Schadensberatung-Pill — reiner WhatsApp-Link, statisch immer-expanded */}
        <a
          className="fab-pill flex items-center rounded-full py-1.5 shadow-[0_8px_28px_rgba(13,27,62,.45),0_0_0_2px_rgba(69,115,162,.45)] hover:-translate-y-px"
          id="fabPill"
          href={waHref(city)}
          data-cta="fab_pill_wa"
          aria-label="Schadensberatung — Wir klären Ihre Fragen"
          style={{
            background: 'linear-gradient(135deg,#0D1B3E 0%,#1A3060 60%,#0D1B3E 100%)',
            border: '2px solid rgba(69,115,162,.55)',
          }}
        >
          {/* Expand-Section: Avatar + Text (statisch sichtbar) */}
          <span className="fab-pill-expand flex items-center gap-3 overflow-hidden mr-1">
            {/* Monika-Avatar 46px */}
            <span className="relative flex-none w-[46px] h-[46px] ml-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/img/shared/monika.png"
                alt=""
                className="w-[46px] h-[46px] rounded-full object-cover border-2 border-white/80"
                loading="lazy"
              />
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green border-[2.5px] border-[#0D1B3E] fab-online-pulse"
                aria-label="online"
              />
            </span>
            {/* Text: Main + Sub */}
            <span className="flex flex-col gap-[4px] py-[2px] whitespace-nowrap">
              <span
                className="fab-pill-main text-white text-[14.5px] font-bold leading-[1.3] tracking-[.01em]"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,.3)' }}
              >
                Schadensberatung
              </span>
              <span className="fab-pill-sub text-white/[.82] text-[11.5px] font-medium leading-[1.3]">
                Wir klären Ihre Fragen · 24/7
              </span>
            </span>
          </span>
          {/* Claimondo-Siegel — immer sichtbar */}
          <span className="relative flex-none" id="fabSiegel" style={{ margin: '-8px 2px -8px 0' }}>
            <span
              className="block rounded-full"
              style={{
                boxShadow:
                  '0 0 0 3px rgba(255,255,255,.25), 0 0 0 7px rgba(69,115,162,.15), 0 6px 24px rgba(0,0,0,.4), 0 0 22px rgba(69,115,162,.4)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/brand/siegel-claimondo-partner.svg"
                alt="Claimondo Partner-Siegel · Unfall-Assistance 2026"
                className="h-[84px] w-[84px] rounded-full"
                style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.3))' }}
                loading="lazy"
              />
            </span>
          </span>
        </a>
      </div>

      {/* ===== STICKY CALLBAR (Mobile only) ===== */}
      <a
        id="mobileStickyCall"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-2 bg-petrol/90 backdrop-blur-[10px] border-t border-white/10 px-4 py-3 text-white font-display font-bold text-[15px] fab-scroll-gated"
        href={`tel:${CLUSTER.phone.tel}`}
        data-cta="mobile_sticky_call"
        aria-label="Jetzt anrufen"
        style={{ transition: 'opacity .3s ease, transform .3s ease' }}
      >
        <svg
          className="w-5 h-5 stroke-current fill-none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        Rückruf in &lt; 15 Min sichern
      </a>

      {/* Back-to-Top Button — fixed bottom-left, erscheint nach 500px Scroll */}
      <button
        id="backToTop"
        type="button"
        aria-label="Zurück nach oben"
        className="fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full bg-amber text-white grid place-items-center shadow-md hover:-translate-y-px transition opacity-0 pointer-events-none"
        style={{ transition: 'opacity .3s ease,transform .2s ease' }}
      >
        <svg
          className="w-5 h-5 stroke-current fill-none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </aside>
  )
}
