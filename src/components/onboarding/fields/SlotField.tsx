'use client'

import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

// Placeholder — echte Slot-Engine kommt in PR 4 (Slot-Engine).
// Bis dahin: statische Demo-Slots für lokale Entwicklung.
export function SlotField({ feld, value, onChange, disabled }: Props) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })
  const times = ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00']
  const selectedDate = value?.split('T')[0] ?? ''
  const selectedTime = value?.split('T')[1]?.slice(0, 5) ?? ''

  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

  function makeValue(dateStr: string, timeStr: string) {
    if (!dateStr || !timeStr) return ''
    return `${dateStr}T${timeStr}:00`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wiz-text-2)', marginBottom: 12, letterSpacing: '-.005em' }}>
          {feld.label} — Tag wählen
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 }}>
          {days.map(d => {
            const iso = d.toISOString().split('T')[0]
            const isActive = selectedDate === iso
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                onClick={() => onChange(makeValue(iso, selectedTime || times[0]))}
                style={{
                  background: isActive ? 'var(--claimondo-navy)' : '#fff',
                  border: `1.5px solid ${isActive ? 'var(--claimondo-navy)' : 'var(--wiz-separator)'}`,
                  borderRadius: 'var(--wiz-r-md)',
                  padding: '14px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all .22s var(--wiz-ease)',
                  boxShadow: isActive ? '0 8px 22px rgba(13,27,62,.22)' : 'none',
                  transform: isActive ? 'translateY(-2px)' : 'none',
                  fontFamily: 'inherit',
                  color: isActive ? '#fff' : 'inherit',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'rgba(255,255,255,.65)' : 'var(--wiz-text-3)', letterSpacing: '-.005em' }}>
                  {weekdays[d.getDay()]}
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: isActive ? '#fff' : 'var(--claimondo-navy)', lineHeight: 1, letterSpacing: '-.024em' }}>
                  {d.getDate()}
                </span>
                <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,.65)' : 'var(--wiz-text-3)', fontWeight: 500, letterSpacing: '-.005em' }}>
                  {months[d.getMonth()]}
                </span>
                <span style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: isActive ? '#6FE299' : '#34C759', letterSpacing: '-.005em' }}>
                  frei
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wiz-text-2)', marginBottom: 12, letterSpacing: '-.005em' }}>
            Uhrzeit wählen
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
            {times.map(t => {
              const isActive = selectedTime === t
              return (
                <button
                  key={t}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(makeValue(selectedDate, t))}
                  style={{
                    background: isActive ? 'var(--claimondo-ondo)' : 'var(--wiz-fill)',
                    border: `1.5px solid ${isActive ? 'var(--claimondo-ondo)' : 'transparent'}`,
                    borderRadius: 'var(--wiz-r-sm)',
                    padding: '14px 10px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all .22s var(--wiz-ease)',
                    boxShadow: isActive ? '0 8px 20px rgba(69,115,162,.32)' : 'none',
                    transform: isActive ? 'translateY(-2px)' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 17, fontWeight: 700, color: isActive ? '#fff' : 'var(--claimondo-navy)', letterSpacing: '-.024em' }}>
                    {t}
                  </span>
                  <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,.7)' : 'var(--wiz-text-3)', fontWeight: 500, letterSpacing: '-.005em' }}>
                    60 Min
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
