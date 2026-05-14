'use client'

import { useRef } from 'react'
import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string[]
  onChange: (val: string[]) => void
  disabled?: boolean
}

export function FileField({ feld, value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files) return
    const encoded: string[] = []
    for (const file of files) {
      const reader = new FileReader()
      await new Promise<void>(res => {
        reader.onload = () => {
          encoded.push(reader.result as string)
          res()
        }
        reader.readAsDataURL(file)
      })
    }
    onChange([...(value ?? []), ...encoded])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {feld.label}
        {feld.pflicht && <span style={{ color: 'var(--brand-warning, #FF9F0A)', fontSize: 13 }}>*</span>}
      </label>
      {feld.hint && (
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)', marginTop: -2, letterSpacing: '-.005em' }}>
          {feld.hint}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{
          background: 'var(--wiz-fill)',
          border: '1.5px dashed var(--wiz-separator)',
          borderRadius: 'var(--wiz-r-md)',
          padding: '28px 16px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          fontFamily: 'inherit',
          transition: 'all .2s var(--wiz-ease)',
        }}
      >
        <span style={{ fontSize: 28 }}>📎</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.01em' }}>
          {feld.placeholder ?? 'Datei auswählen'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)' }}>
          {value?.length ? `${value.length} Datei(en) ausgewählt` : 'JPG, PNG, PDF bis 10 MB'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  )
}
