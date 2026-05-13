'use client'

// AAR-glass-s1: Permanenter Secondary-CTA "Beratung vereinbaren".
// Wird auf jeder Funnel/Marketing-Page top-right und neben jedem Primary-CTA
// platziert. Click-Behavior öffnet das Beratungs-Rückruf-Modal — schreibt einen
// admin_termin (typ='rueckruf'), der auf /dispatch/rueckrufe erscheint.
//
// Legacy `href`-Prop (tel:-Link) wird weiterhin akzeptiert für Pages die noch
// nicht das Modal wollen — wenn `useModal=false` gesetzt ist, Fallback auf
// window.location.href.

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { GlassButton } from './GlassButton'
import { BeratungModal } from './BeratungModal'
import { cn } from '@/lib/utils'

interface Props {
  label?: string
  href?: string
  className?: string
  onClick?: () => void
  useModal?: boolean
  quelle?: string
}

export function BeratungVereinbarenButton({
  label = 'Beratung vereinbaren',
  href = 'tel:+4922198557270',
  className,
  onClick,
  useModal = true,
  quelle,
}: Props) {
  const [open, setOpen] = useState(false)

  function handleClick() {
    if (onClick) {
      onClick()
      return
    }
    if (useModal) {
      setOpen(true)
      return
    }
    if (typeof window !== 'undefined') {
      window.location.href = href
    }
  }

  return (
    <>
      <GlassButton
        variant="secondary"
        data-testid="beratung-vereinbaren-button"
        icon={<Phone size={15} strokeWidth={2} />}
        iconPosition="left"
        onClick={handleClick}
        className={cn(className)}
      >
        {label}
      </GlassButton>
      <BeratungModal open={open} onClose={() => setOpen(false)} quelle={quelle ?? (typeof window !== 'undefined' ? window.location.pathname : 'unknown')} />
    </>
  )
}
