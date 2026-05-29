'use client'

// Tropfenartige Zahl-Badge. Animiert sich kurz wenn `count` sich ändert.

import { useEffect, useRef, useState } from 'react'

type DropletBadgeProps = {
  count: number
  /** Tailwind-Klassen für die Badge-Farbe (Standard: Claimondo-Navy) */
  colorCls?: string
  /** Größe in px (default 20) */
  size?: number
  className?: string
}

export function DropletBadge({
  count,
  colorCls = 'bg-claimondo-navy text-white',
  size = 20,
  className = '',
}: DropletBadgeProps) {
  const prevCount = useRef(count)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    if (prevCount.current !== count) {
      setPopping(false)
      // Micro-task gap to restart CSS animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPopping(true))
      })
      prevCount.current = count
    }
  }, [count])

  if (count <= 0) return null

  const displayCount = count > 99 ? '99+' : String(count)
  const px = size

  return (
    <span
      className={`badge-droplet ${colorCls} ${popping ? 'badge-droplet-pop' : ''} ${className}`}
      style={{
        width: px,
        height: px,
        fontSize: count > 9 ? px * 0.44 : px * 0.52,
        fontWeight: 700,
        letterSpacing: '-0.02em',
      }}
    >
      <span className="badge-droplet-inner">{displayCount}</span>
    </span>
  )
}
