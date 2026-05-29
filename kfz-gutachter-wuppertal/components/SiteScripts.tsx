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
        trackEvent('click_to_call', { cta_slot: slot, cluster: CLUSTER.key, city_slug: citySlug, phone: tel.href.replace('tel:', '') })
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

    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('scroll', onScroll)
    }
  }, [citySlug])

  return (
    <>
      {/* dataLayer-Init (immer — auch ohne GTM, fuer spaeteren Tag-Container) */}
      <Script id="datalayer-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];`}
      </Script>

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
