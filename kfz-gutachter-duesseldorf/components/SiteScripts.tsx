'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'
import { trackEvent, captureAttribution, fireAdsConversion } from '@/lib/tracking'

// Tracking-Orchestrierung (clientseitig). Laedt optional GTM/Plausible/Clarity
// (nur wenn ENV gesetzt — Phase 1 default leer = nichts), initialisiert
// dataLayer, captured gclid/utm, feuert page_view + delegiertes Klick-Tracking
// (tel:/wa.me/ratgeber) + Scroll-Depth (50/90). Mount einmal pro Page.
export function SiteScripts({ citySlug }: { citySlug: string }) {
  useEffect(() => {
    captureAttribution()
    trackEvent('page_view', { page_type: 'stadt_lp', cluster: CLUSTER.key, city_slug: citySlug })

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      const tel = target.closest('a[href^="tel:"]') as HTMLAnchorElement | null
      if (tel) {
        const slot = tel.dataset.cta || 'generic_call'
        trackEvent('phone_click', { cta_slot: slot, cluster: CLUSTER.key, city_slug: citySlug, phone: tel.href.replace('tel:', '') })
        fireAdsConversion('call')
        return
      }
      const wa = target.closest('a[href*="wa.me"]') as HTMLAnchorElement | null
      if (wa) {
        const slot = wa.dataset.cta || 'generic_wa'
        trackEvent('whatsapp_click', { cta_slot: slot, cluster: CLUSTER.key, city_slug: citySlug })
        fireAdsConversion('wa')
        return
      }
      const ratgeber = target.closest('[data-action="ratgeber_click"]') as HTMLElement | null
      if (ratgeber) trackEvent('ratgeber_click', { cluster: CLUSTER.key, city_slug: citySlug, topic: ratgeber.dataset.topic || '' })
      const ratgeberHub = target.closest('[data-action="ratgeber_hub_click"]') as HTMLElement | null
      if (ratgeberHub) trackEvent('ratgeber_hub_click', { cluster: CLUSTER.key, city_slug: citySlug })
    }
    document.addEventListener('click', onClick)

    // Scroll-Depth (single-fire 50/90)
    const fired = new Set<number>()
    function onScroll() {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      if (max <= 0) return
      const pct = (doc.scrollTop / max) * 100
      for (const mark of [50, 90]) {
        if (pct >= mark && !fired.has(mark)) {
          fired.add(mark)
          trackEvent(`scroll_${mark}`, { cluster: CLUSTER.key, city_slug: citySlug })
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Burger-Nav (Phase 1.5): Off-Canvas-Drawer Toggle (Mobile/Tablet, statisches
    // Markup aus Header.tsx). State-Machine wie Mock-IIFE, in React-useEffect portiert.
    const burgerBtn = document.getElementById('burgerBtn')
    const burgerMenu = document.getElementById('burgerMenu')
    const burgerBackdrop = document.getElementById('burgerBackdrop')
    const burgerClose = document.getElementById('burgerClose')
    const burgerLinks = Array.from(document.querySelectorAll<HTMLElement>('[data-burger-link]'))

    function openBurger() {
      if (!burgerMenu || !burgerBackdrop) return
      burgerMenu.classList.add('is-open')
      burgerBackdrop.classList.add('is-open')
      burgerBtn?.setAttribute('aria-expanded', 'true')
      document.body.style.overflow = 'hidden' // Scroll-Lock
      trackEvent('burger_open', { cluster: CLUSTER.key, city_slug: citySlug })
      burgerMenu.querySelector<HTMLElement>('a, button')?.focus() // Focus-Trap-Start
    }
    function closeBurger() {
      if (!burgerMenu || !burgerBackdrop) return
      burgerMenu.classList.remove('is-open')
      burgerBackdrop.classList.remove('is-open')
      burgerBtn?.setAttribute('aria-expanded', 'false')
      document.body.style.overflow = ''
    }
    function onBurgerKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && burgerMenu?.classList.contains('is-open')) {
        closeBurger()
        burgerBtn?.focus()
      }
    }
    burgerBtn?.addEventListener('click', openBurger)
    burgerClose?.addEventListener('click', closeBurger)
    burgerBackdrop?.addEventListener('click', closeBurger)
    document.addEventListener('keydown', onBurgerKey)
    burgerLinks.forEach((l) => l.addEventListener('click', closeBurger))

    // Hero-Scroll-Chevron (Phase 3 #3): blendet aus, sobald der Nutzer scrollt.
    const heroChevron = document.getElementById('heroScrollChevron')
    function onHeroScroll() {
      if (!heroChevron) return
      if (window.scrollY > 40) heroChevron.classList.add('is-scrolled')
      else heroChevron.classList.remove('is-scrolled')
    }
    if (heroChevron) {
      window.addEventListener('scroll', onHeroScroll, { passive: true })
      onHeroScroll()
    }

    // Netzwerk-Mobile (Phase 3 #4): Compare-Toggle + Pain-Reveal-Observer (Vanilla-DOM
    // analog Burger/Chevron). Desktop-Compare bleibt eigene Client-Insel (NetzwerkCompare).
    const nzMobileBtn = document.getElementById('netzwerkMobileCompareToggle')
    const nzMobilePanel = document.getElementById('netzwerkCompareMobilePanel')
    let nzMobileOpen = false
    function onNzMobileToggle(e: Event) {
      e.preventDefault()
      if (!nzMobilePanel || !nzMobileBtn) return
      nzMobileOpen = !nzMobileOpen
      nzMobilePanel.classList.toggle('is-open', nzMobileOpen)
      nzMobilePanel.setAttribute('aria-hidden', String(!nzMobileOpen))
      nzMobileBtn.setAttribute('aria-expanded', String(nzMobileOpen))
      if (nzMobileBtn.firstChild) {
        nzMobileBtn.firstChild.textContent = nzMobileOpen ? 'Vergleich schließen ' : 'Alle 8 Vergleichspunkte ansehen '
      }
      trackEvent(nzMobileOpen ? 'netzwerk_compare_open' : 'netzwerk_compare_close', { mode: 'mobile', cluster: CLUSTER.key, city_slug: citySlug })
    }
    let nzMobileIo: IntersectionObserver | undefined
    if (nzMobileBtn && nzMobilePanel) {
      nzMobileBtn.addEventListener('click', onNzMobileToggle)
      // Smart-Close: Mobile-Panel scrollt aus dem Viewport -> schliessen
      if ('IntersectionObserver' in window) {
        nzMobileIo = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting && nzMobileOpen) {
                nzMobileOpen = false
                nzMobilePanel.classList.remove('is-open')
                nzMobilePanel.setAttribute('aria-hidden', 'true')
                nzMobileBtn.setAttribute('aria-expanded', 'false')
                if (nzMobileBtn.firstChild) nzMobileBtn.firstChild.textContent = 'Alle 8 Vergleichspunkte ansehen '
              }
            })
          },
          { rootMargin: '0px 0px -15% 0px', threshold: 0 },
        )
        nzMobileIo.observe(nzMobilePanel)
      }
    }

    // Pain-Story Reveal-Animation (Staggered via CSS-data-step-Delays)
    const nzPainList = document.getElementById('netzwerkPainList')
    let nzPainIo: IntersectionObserver | undefined
    if (nzPainList) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced || !('IntersectionObserver' in window)) {
        nzPainList.classList.add('is-visible')
      } else {
        nzPainIo = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                nzPainList.classList.add('is-visible')
                nzPainIo?.unobserve(nzPainList)
              }
            })
          },
          { threshold: 0.15 },
        )
        nzPainIo.observe(nzPainList)
      }
    }

    // Ablauf-Mobile (Phase 3 #5): Nutzungsausfall-Tooltip + Timeline-Reveal + CTA-Welle.
    const abInfoBtn = document.getElementById('nutzungsausfallTooltipMobile')
    const abInfo = document.getElementById('nutzungsausfallInfoMobile')
    function onAbInfoClick(e: MouseEvent) {
      e.stopPropagation()
      abInfo?.classList.toggle('hidden')
      trackEvent('ablauf_nutzungsausfall_toggle', { source: 'mobile', cluster: CLUSTER.key, city_slug: citySlug })
    }
    function onAbDocClick(e: MouseEvent) {
      const t = e.target as Node | null
      if (abInfo && abInfoBtn && !abInfo.classList.contains('hidden') && t && !abInfo.contains(t) && t !== abInfoBtn) {
        abInfo.classList.add('hidden')
      }
    }
    if (abInfoBtn && abInfo) {
      abInfoBtn.addEventListener('click', onAbInfoClick)
      document.addEventListener('click', onAbDocClick)
    }

    // Timeline-Reveal (staggered) + CTA-Welle nach dem letzten Item.
    const abTlItems = Array.from(document.querySelectorAll<HTMLElement>('#ablaufTL .ablauf-tl-item'))
    let abTlIo: IntersectionObserver | undefined
    let abWaveTimer: number | undefined
    if (abTlItems.length) {
      const abReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const abCtaWrap = document.getElementById('ablaufMobileCTAWrap')
      const triggerAbWave = () => {
        if (!abCtaWrap || abReduced) return
        abCtaWrap.classList.add('is-wave')
        abWaveTimer = window.setTimeout(() => abCtaWrap.classList.remove('is-wave'), 1500)
      }
      if (abReduced || !('IntersectionObserver' in window)) {
        abTlItems.forEach((el) => el.classList.add('is-visible'))
      } else {
        let lastRevealTime = 0
        const staggerGap = 250
        const lastIdx = abTlItems.length - 1
        let waveDone = false
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const now = performance.now()
                const delay = Math.max(0, lastRevealTime + staggerGap - now)
                lastRevealTime = now + delay
                const el = entry.target as HTMLElement
                const idx = abTlItems.indexOf(el)
                window.setTimeout(() => {
                  el.classList.add('is-visible')
                  if (idx === lastIdx && !waveDone) {
                    waveDone = true
                    window.setTimeout(triggerAbWave, 700)
                  }
                }, delay)
                io.unobserve(el)
              }
            })
          },
          { threshold: 0.6, rootMargin: '0px 0px -22% 0px' },
        )
        abTlIo = io
        abTlItems.forEach((el) => io.observe(el))
      }
    }

    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('scroll', onScroll)
      burgerBtn?.removeEventListener('click', openBurger)
      burgerClose?.removeEventListener('click', closeBurger)
      burgerBackdrop?.removeEventListener('click', closeBurger)
      document.removeEventListener('keydown', onBurgerKey)
      burgerLinks.forEach((l) => l.removeEventListener('click', closeBurger))
      if (heroChevron) window.removeEventListener('scroll', onHeroScroll)
      nzMobileBtn?.removeEventListener('click', onNzMobileToggle)
      nzMobileIo?.disconnect()
      nzPainIo?.disconnect()
      abInfoBtn?.removeEventListener('click', onAbInfoClick)
      document.removeEventListener('click', onAbDocClick)
      abTlIo?.disconnect()
      if (abWaveTimer) window.clearTimeout(abWaveTimer)
      document.body.style.overflow = ''
    }
  }, [citySlug])

  return (
    <>
      {/* dataLayer-Init (immer — auch ohne GTM, fuer spaeteren Tag-Container) */}
      <Script id="datalayer-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];`}
      </Script>

      {/* Google Consent Mode v2 Default (AAR-967): denied bis Zustimmung; liest cc_cookie
          fuer wiederkehrende Nutzer. Laeuft vor den Tag-Loadern (JSX-Reihenfolge, gleiche
          afterInteractive-Strategie). Nur wenn Tracking-ENV gesetzt. Banner = CookieConsent. */}
      {SITE.gtmId || SITE.gadsAwId ? (
        <Script id="gcm-consent-default" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}var _m=document.cookie.match(/(?:^|; )cc_cookie=([^;]+)/);var _c=[];try{_c=(JSON.parse(decodeURIComponent(_m?_m[1]:'')).categories)||[]}catch(e){}var _a=_c.indexOf('analytics')>-1?'granted':'denied';var _d=_c.indexOf('ads')>-1?'granted':'denied';gtag('consent','default',{analytics_storage:_a,functionality_storage:_a,ad_storage:_d,ad_user_data:_d,ad_personalization:_d,wait_for_update:500});`}
        </Script>
      ) : null}

      {SITE.gtmId ? (
        <>
          <Script id="gtm-loader" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${SITE.gtmId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${SITE.gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
              title="gtm"
            />
          </noscript>
        </>
      ) : null}

      {SITE.gadsAwId ? (
        <>
          <Script id="gtag-loader" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${SITE.gadsAwId}`} />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${SITE.gadsAwId}');`}
          </Script>
        </>
      ) : null}

      {SITE.plausibleDomain ? (
        <Script defer data-domain={SITE.plausibleDomain} src="https://plausible.io/js/script.js" strategy="afterInteractive" />
      ) : null}

      {SITE.clarityId ? (
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${SITE.clarityId}");`}
        </Script>
      ) : null}
    </>
  )
}
