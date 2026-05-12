'use client'

// AAR-glass-s1: Permanenter Secondary-CTA "Beratung vereinbaren".
// Wird auf jeder Funnel/Marketing-Page top-right und neben jedem Primary-CTA
// platziert. Click-Behavior öffnet zunächst tel:-Link (vorerst), später ggf.
// Modal-Calendly.

import { Phone } from 'lucide-react'
import { GlassButton } from './GlassButton'
import { cn } from '@/lib/utils'

interface Props {
  label?: string
  href?: string
  className?: string
  onClick?: () => void
}

export function BeratungVereinbarenButton({
  label = 'Beratung vereinbaren',
  href = 'tel:+4922198557270', // Aaron-Default — kann später per Page-Prop überschrieben werden
  className,
  onClick,
}: Props) {
  function handleClick() {
    if (onClick) {
      onClick()
      return
    }
    if (typeof window !== 'undefined') {
      window.location.href = href
    }
  }
  return (
    <GlassButton
      variant="secondary"
      icon={<Phone size={15} strokeWidth={2} />}
      iconPosition="left"
      onClick={handleClick}
      className={cn(className)}
    >
      {label}
    </GlassButton>
  )
}
