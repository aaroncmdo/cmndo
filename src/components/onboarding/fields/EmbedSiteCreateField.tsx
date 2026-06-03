'use client'

// AAR-939 Part B: Onboarding-Feldtyp 'embed-site-create'.
//
// Legt im Basic-Onboarding (flow_key='sv-onboarding') das erste Monika-Widget
// (Variante A, kostenlos) an. Self-persisting wie CalendarConnectField: ruft
// die bestehende createEmbedSite-Action (Reuse, kein Duplikat), meldet bei
// Erfolg onChange('created') -> Pflichtfeld erfuellt. "Keine Website" ->
// onChange('skipped') (nicht-blockierend; der Claimondo-Hosted-Fallback fuer
// SVs ohne eigene Website ist Part B2, noch nicht gebaut).

import { useState } from 'react'
import { CheckCircle2, Code2 } from 'lucide-react'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms'
import { createEmbedSite } from '@/app/gutachter/einstellungen/embed/actions'
import { emptyEmbedSiteForm, slugify } from '@/lib/embed/site-write'

function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
}

export function EmbedSiteCreateField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (value === 'created') {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-claimondo-navy">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        Widget angelegt — du findest es jederzeit unter Einstellungen → Embed-Widget.
      </p>
    )
  }
  if (value === 'skipped') {
    return (
      <p className="text-sm text-claimondo-ondo">
        Alles klar — du kannst dein Widget später unter Einstellungen → Embed-Widget anlegen.
      </p>
    )
  }

  async function anlegen() {
    setError(null)
    const dom = cleanDomain(domain)
    if (name.trim().length < 2) {
      setError('Bitte gib deinem Widget einen Namen.')
      return
    }
    if (!dom) {
      setError('Bitte gib die Domain deiner Website an.')
      return
    }
    setSaving(true)
    const res = await createEmbedSite({
      ...emptyEmbedSiteForm(),
      name: name.trim(),
      slug: slugify(name) || slugify(dom),
      variante: 'A',
      erlaubte_domains: [dom],
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Anlegen fehlgeschlagen. Bitte erneut versuchen.')
      return
    }
    onChange('created')
  }

  return (
    <div className="space-y-3">
      <TextField
        label="Name deines Widgets"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="z. B. Kfz-Gutachter Müller"
        disabled={disabled || saving}
      />
      <TextField
        label="Deine Website-Domain"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="z. B. meine-kanzlei.de"
        hint="Die Domain, auf der dein Widget laufen darf (Origin-Schutz)."
        disabled={disabled || saving}
      />
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="navy"
          loading={saving}
          onClick={anlegen}
          iconLeft={<Code2 style={{ width: 16, height: 16 }} />}
        >
          Widget anlegen
        </Button>
        <Button variant="ghost" disabled={disabled || saving} onClick={() => onChange('skipped')}>
          Ich habe noch keine Website
        </Button>
      </div>
    </div>
  )
}
