'use client'

// AAR-412 / AAR-769 Phase 3: Einheitlicher Telefon-Button. Ersetzt
// AircallCallButton + BridgeCallButton + die ~20 Inline-`<a href="tel:...">`-
// Links im Codebase. Phase 3: bereits Token-konform (claimondo-*), Migration
// auf <Button>-Primitive blockiert weil Primitive keinen <a href>-Modus
// unterstützt — bleibt mit lokalem Tailwind-Style. Wenn Primitive einen
// `as="a" href=`-Modus bekommt, hier ablösen.
//
// Varianten:
//   - 'inline'   → Unterstrichener Link mit Phone-Icon, für Fliesstext
//   - 'card'     → Solid Button mit Icon + Label (primäre CTA)
//   - 'iconOnly' → Nur Icon, für kompakte Listen/Tabellen
//
// Modi:
//   - 'auto'    (Default) → tel:-Link; auf Desktop kein Dialer → Nutzer
//                           kopiert die Nummer per Long-Press oder nutzt
//                           das OS-eigene Anruf-Handling (Teams, Skype, …).
//                           Dank telefonHref ist die Nummer immer im E.164-
//                           Format, das wählt überall sauber.
//   - 'tel'     → Identisch zu 'auto', explizit erzwungen.
//   - 'aircall' → Ruft /api/aircall/call mit Rolle-basierter Auth. Für interne
//                 Admin-/Dispatch-Nutzer; feuert einen echten Anruf über den
//                 Aircall-Seat. Success-Toast ersetzt den alten Inline-Status.
//
// Der alte Bridge-Modus (BridgeCallButton) ist rausgefallen — die Datei war
// nicht mehr referenziert (Dead Code), also wird sie mit diesem Ticket
// gelöscht, nicht reintegriert.

import { useState } from 'react'
import { PhoneIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { formatTelefon, telefonHref } from '@/lib/format'

export type PhoneButtonVariant = 'inline' | 'card' | 'iconOnly'
export type PhoneButtonMode = 'auto' | 'tel' | 'aircall'

export interface PhoneButtonProps {
  nummer: string | null | undefined
  variant?: PhoneButtonVariant
  mode?: PhoneButtonMode
  /** Eigenes Label, default ist die formatierte Nummer bzw. "Anrufen". */
  label?: string
  /** Lead-/Fall-Kontext für Aircall-Tracking. */
  leadId?: string
  fallId?: string
  /** Callback nach erfolgreichem Start (für Tracking/Timeline). */
  onCalled?: (nummer: string) => void
  /** Zusätzliche Tailwind-Klassen. */
  className?: string
  /** Stop-Propagation bei Click (z. B. innerhalb klickbarer Karten). */
  stopPropagation?: boolean
}

export default function PhoneButton({
  nummer,
  variant = 'inline',
  mode = 'auto',
  label,
  leadId,
  fallId,
  onCalled,
  className = '',
  stopPropagation = false,
}: PhoneButtonProps) {
  const [calling, setCalling] = useState(false)
  const href = telefonHref(nummer)
  if (!nummer || !href) return null

  const displayLabel = label ?? formatTelefon(nummer)
  const iconSize = variant === 'iconOnly' ? 'w-4 h-4' : 'w-3.5 h-3.5'

  async function startAircall(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation()
    e.preventDefault()
    setCalling(true)
    try {
      const res = await fetch('/api/aircall/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: nummer, leadId, fallId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? `Aircall-Fehler ${res.status}`)
      } else {
        toast.success('Anruf gestartet — Aircall-App prüfen')
        onCalled?.(nummer!)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anruf fehlgeschlagen')
    } finally {
      setCalling(false)
    }
  }

  function handleTelClick(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation()
    onCalled?.(nummer!)
  }

  // ─── Aircall-Modus: Button (kein href) ─────────────────────────────────
  if (mode === 'aircall') {
    if (variant === 'iconOnly') {
      return (
        <button
          type="button"
          onClick={startAircall}
          disabled={calling}
          title={`${displayLabel} via Aircall anrufen`}
          className={`text-claimondo-ondo hover:text-claimondo-navy disabled:opacity-50 transition-colors ${className}`}
        >
          {calling
            ? <Loader2Icon className={`${iconSize} animate-spin`} />
            : <PhoneIcon className={iconSize} />}
        </button>
      )
    }
    if (variant === 'card') {
      return (
        <button
          type="button"
          onClick={startAircall}
          disabled={calling}
          className={`flex items-center gap-2 px-3 py-1.5 bg-claimondo-ondo text-white text-sm rounded-lg hover:bg-claimondo-navy disabled:opacity-50 transition-colors ${className}`}
        >
          {calling ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PhoneIcon className="w-4 h-4" />}
          {calling ? 'Anruf läuft…' : (label ?? `${formatTelefon(nummer)} anrufen`)}
        </button>
      )
    }
    // inline
    return (
      <button
        type="button"
        onClick={startAircall}
        disabled={calling}
        className={`inline-flex items-center gap-1 text-claimondo-ondo hover:underline disabled:opacity-50 ${className}`}
      >
        {calling ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <PhoneIcon className={iconSize} />}
        {displayLabel}
      </button>
    )
  }

  // ─── tel:/auto — nativer <a>-Link ──────────────────────────────────────
  if (variant === 'iconOnly') {
    return (
      <a
        href={href}
        onClick={handleTelClick}
        title={`${displayLabel} anrufen`}
        className={`text-claimondo-ondo hover:text-claimondo-navy transition-colors ${className}`}
      >
        <PhoneIcon className={iconSize} />
      </a>
    )
  }
  if (variant === 'card') {
    return (
      <a
        href={href}
        onClick={handleTelClick}
        className={`flex items-center gap-2 px-3 py-1.5 bg-claimondo-ondo text-white text-sm rounded-lg hover:bg-claimondo-navy transition-colors ${className}`}
      >
        <PhoneIcon className="w-4 h-4" />
        {label ?? `${formatTelefon(nummer)} anrufen`}
      </a>
    )
  }
  // inline
  return (
    <a
      href={href}
      onClick={handleTelClick}
      className={`inline-flex items-center gap-1 text-claimondo-ondo hover:underline ${className}`}
    >
      <PhoneIcon className={iconSize} />
      {displayLabel}
    </a>
  )
}
