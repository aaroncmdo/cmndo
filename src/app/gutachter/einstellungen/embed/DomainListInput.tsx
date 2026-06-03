'use client'

// AAR-939 · Stream 6 — Multi-Domain-Eingabe fuer embed_sites.erlaubte_domains.
// Normalisierung (Host) passiert final serverseitig (extractHost); hier nur eine
// leichte Vorbereinigung fuer die Anzeige.

import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button, Badge } from '@/components/primitives'
import { TextField } from '@/components/shared/forms'

function cleanDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

export default function DomainListInput({
  value,
  onChange,
  error,
}: {
  value: string[]
  onChange: (next: string[]) => void
  error?: string | null
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const d = cleanDomain(draft)
    if (!d) return
    if (!value.includes(d)) onChange([...value, d])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <TextField
          label="Erlaubte Domains"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="z. B. meine-kanzlei.de"
          hint="Domains, auf denen dein Widget laufen darf (Origin-Schutz)."
          error={error}
          className="flex-1"
        />
        <Button variant="navy" onClick={add} iconLeft={<PlusIcon style={{ width: 16, height: 16 }} />}>
          Hinzufügen
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((d) => (
            <span key={d} className="inline-flex items-center gap-1">
              <Badge tone="neutral">{d}</Badge>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== d))}
                aria-label={`${d} entfernen`}
                className="text-claimondo-ondo hover:text-claimondo-navy"
              >
                <XIcon style={{ width: 14, height: 14 }} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
