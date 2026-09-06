'use client'

// AAR-939 Part B1+B2: Onboarding-Feldtyp 'embed-site-create'.
//
// Legt im Basic-Onboarding das erste Monika-Widget (Variante A, kostenlos) an —
// reuse der bestehenden Actions, self-persisting wie CalendarConnectField
// (onChange('created') -> Pflichtfeld erfuellt). Zwei Wege, beide enden in einem
// funktionierenden Widget (kein Skip -> der Step ist fuer alle erfuellbar):
//   • Eigene Website  -> createEmbedSite (Domain nur als Weiche, keine Origin-Beschraenkung)
//   • Keine Website   -> createHostedEmbedSite -> Claimondo-Hosted-Seite /g/[slug] (Part B2)

import { useState } from 'react'
import { CheckCircle2, Code2 } from 'lucide-react'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms'
import { createEmbedSite, createHostedEmbedSite } from '@/app/gutachter/einstellungen/embed/actions'
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
  const [hostedSlug, setHostedSlug] = useState<string | null>(null)

  if (value === 'created') {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-claimondo-navy">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Widget angelegt — Sie finden es jederzeit unter Einstellungen → Embed-Widget.
        </p>
        {hostedSlug && (
          <p className="text-sm text-claimondo-navy">
            Ihre Claimondo-Seite:{' '}
            <a
              href={`/g/${hostedSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-claimondo-ondo underline underline-offset-2"
            >
              {`/g/${hostedSlug}`}
            </a>{' '}
            — teile den Link, das Anfrage-Formular ist sofort live.
          </p>
        )}
      </div>
    )
  }

  async function eigeneWebsite() {
    setError(null)
    const dom = cleanDomain(domain)
    if (name.trim().length < 2) {
      setError('Bitte geben Sie Ihrem Widget einen Namen.')
      return
    }
    // Domain ist wie gelabelt optional: leer -> Hosted-Pfad (Prod-Smoke 05.08.:
    // der fruehere Pflicht-Fehler hier widersprach dem "(optional)"-Label und
    // liess User nach "Ich habe noch keine Website" + Name + "Widget anlegen" stolpern.
    if (!dom) {
      return hostedSeite()
    }
    setSaving(true)
    const res = await createEmbedSite({
      ...emptyEmbedSiteForm(),
      name: name.trim(),
      slug: slugify(name) || slugify(dom),
      variante: 'A',
      // leer = keine Origin-Beschraenkung (Widget darf ueberall laufen, Aaron 05.08.);
      // die Domain-Eingabe ist nur die Weiche eigene-Website vs. Hosted-Seite.
      erlaubte_domains: [],
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Anlegen fehlgeschlagen. Bitte erneut versuchen.')
      return
    }
    onChange('created')
  }

  async function hostedSeite() {
    setError(null)
    if (name.trim().length < 2) {
      setError('Bitte geben Sie einen Namen an — daraus wird Ihre Claimondo-Seite.')
      return
    }
    setSaving(true)
    const res = await createHostedEmbedSite(name.trim())
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Anlegen fehlgeschlagen. Bitte erneut versuchen.')
      return
    }
    setHostedSlug(res.slug)
    onChange('created')
  }

  return (
    <div className="space-y-3">
      <TextField
        label="Name Ihres Widgets"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="z. B. Kfz-Gutachter Müller"
        disabled={disabled || saving}
      />
      <TextField
        label="Ihre Website-Domain (optional)"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="z. B. gutachter-mueller.de"
        hint="Keine eigene Website? Einfach leer lassen — wir hosten eine Seite für Sie."
        disabled={disabled || saving}
      />
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="navy"
          loading={saving}
          onClick={eigeneWebsite}
          iconLeft={<Code2 style={{ width: 16, height: 16 }} />}
        >
          Widget anlegen
        </Button>
        <Button variant="ghost" disabled={disabled || saving} onClick={hostedSeite}>
          Ich habe noch keine Website
        </Button>
      </div>
    </div>
  )
}
