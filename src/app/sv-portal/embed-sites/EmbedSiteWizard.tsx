'use client'

// AAR-939 · Monika-Embed · Stream 6 — Embed-Site-Wizard (3 Steps).
// Blaupause: admin/sachverstaendige/anlegen/BueroAnlegenWizard (STEPS + fieldErrors-Set
// statt silent-disabled). Gating: A = Branding disabled + kein Q7; B = Branding aktiv + Q7 Pflicht.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button, Card, Badge } from '@/components/primitives'
import { TextField } from '@/components/shared/forms'
import { SectionCard } from '@/components/shared/SectionCard'
import { Checkbox } from '@/components/ui/checkbox'
import {
  type EmbedSiteFormData,
  MONIKA_AGB_VERSION,
  CLAIMONDO_FLAT_THEME,
  slugify,
  validateBasis,
  validateVariante,
} from '@/lib/embed/site-write'
import { createEmbedSite, updateEmbedSite } from './actions'
import DomainListInput from './DomainListInput'
import ThemePreview from './ThemePreview'

const STEPS = ['Basis & Domains', 'Variante & Branding', 'Zusammenfassung'] as const

type SvBrand = { brand_primary: string | null; brand_accent: string | null } | null

export default function EmbedSiteWizard({
  mode,
  siteId,
  initial,
  svBrand,
  defaultLogo,
}: {
  mode: 'create' | 'edit'
  siteId?: string
  initial: EmbedSiteFormData
  svBrand: SvBrand
  defaultLogo: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<EmbedSiteFormData>(initial)
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)

  function patch(p: Partial<EmbedSiteFormData>) {
    setForm((f) => ({ ...f, ...p }))
  }
  function err(field: string) {
    return fieldErrors.has(field) ? 'Pflichtfeld' : undefined
  }

  function next() {
    if (step === 0) {
      const f = validateBasis(form)
      setFieldErrors(f)
      if (f.size > 0) return
    }
    if (step === 1) {
      const f = validateVariante(form)
      setFieldErrors(f)
      if (f.size > 0) {
        setError(form.variante === 'B' ? 'Bitte die Kooperations-AGB akzeptieren.' : null)
        return
      }
    }
    setError(null)
    setFieldErrors(new Set())
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function submit() {
    setSaving(true)
    setError(null)
    const res = mode === 'edit' && siteId ? await updateEmbedSite(siteId, form) : await createEmbedSite(form)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Fehler')
      return
    }
    if (mode === 'edit') {
      toast.success('Site gespeichert')
      router.push('/sv-portal/embed-sites')
      router.refresh()
      return
    }
    setCreatedSlug(form.slug.trim().toLowerCase())
    toast.success('Embed-Site angelegt')
  }

  // ── Erfolgs-Snippet nach Anlegen ──────────────────────────────────────────
  if (createdSlug) {
    const snippet = `<script src="https://claimondo.de/embed/monika.js" data-site-id="${createdSlug}" defer></script>`
    return (
      <SectionCard title="Fertig — dein Einbinde-Snippet" icon={<CheckIcon style={{ width: 18, height: 18 }} />}>
        <p className="text-sm text-claimondo-ondo mb-3">
          Füge dieses Snippet einmalig in den <code>&lt;head&gt;</code> deiner Website ein:
        </p>
        <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
          {snippet}
        </pre>
        <div className="flex gap-2 mt-3">
          <Button
            variant="navy"
            iconLeft={<CopyIcon style={{ width: 16, height: 16 }} />}
            onClick={() => {
              navigator.clipboard.writeText(snippet)
              toast.success('Snippet kopiert')
            }}
          >
            Kopieren
          </Button>
          <Button variant="ghost" onClick={() => router.push('/sv-portal/embed-sites')}>
            Zu meinen Sites
          </Button>
        </div>
      </SectionCard>
    )
  }

  const isB = form.variante === 'B'

  return (
    <div className="space-y-4">
      {/* Step-Indikator (inline, wie BueroAnlegenWizard) */}
      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                i === step
                  ? 'bg-claimondo-navy text-white'
                  : i < step
                    ? 'bg-claimondo-ondo text-white'
                    : 'bg-claimondo-bg text-claimondo-ondo border border-claimondo-border'
              }`}
            >
              {i + 1}
            </span>
            <span className={i === step ? 'text-claimondo-navy font-medium' : 'text-claimondo-ondo'}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-claimondo-border mx-1">→</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-ios-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* STEP 0 — Basis & Domains */}
      {step === 0 && (
        <SectionCard title="Site-Details" bodyClassName="space-y-4">
          <TextField
            label="Name der Site"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value, slug: form.slug || slugify(e.target.value) })}
            error={err('name')}
            placeholder="z. B. Kanzlei Müller"
            required
          />
          <TextField
            label="Slug (Site-ID)"
            value={form.slug}
            onChange={(e) => patch({ slug: e.target.value })}
            error={err('slug')}
            hint="Erscheint im Snippet als data-site-id. Nur a–z, 0–9, Bindestrich."
            placeholder="kanzlei-mueller"
            required
          />
          <DomainListInput
            value={form.erlaubte_domains}
            onChange={(v) => patch({ erlaubte_domains: v })}
            error={err('erlaubte_domains')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Empfänger-Email"
              value={form.empfaenger_email}
              onChange={(e) => patch({ empfaenger_email: e.target.value })}
              error={err('empfaenger_email')}
              type="email"
              required
            />
            <TextField
              label="CC-Email (optional)"
              value={form.cc_email}
              onChange={(e) => patch({ cc_email: e.target.value })}
              error={err('cc_email')}
              type="email"
            />
          </div>
        </SectionCard>
      )}

      {/* STEP 1 — Variante & Branding */}
      {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Variante" bodyClassName="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card
                onPress={() => patch({ variante: 'A' })}
                className={`cursor-pointer ${!isB ? 'ring-2 ring-claimondo-navy' : ''}`}
              >
                <p className="font-semibold text-claimondo-navy">Variante A</p>
                <p className="text-xs text-claimondo-ondo mt-1">Kostenlos. Claimondo-Standard-Theme.</p>
              </Card>
              <Card
                onPress={() => patch({ variante: 'B' })}
                className={`cursor-pointer ${isB ? 'ring-2 ring-claimondo-ondo' : ''}`}
              >
                <p className="font-semibold text-claimondo-navy">
                  Variante B <Badge tone="ondo">70 € / Termin</Badge>
                </p>
                <p className="text-xs text-claimondo-ondo mt-1">Eigenes Theme + Dispatch-Qualifizierung.</p>
              </Card>
            </div>

            {!isB && (
              <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-4 py-3 text-xs text-claimondo-ondo">
                Mit <strong>Variante B</strong> brandest du dein Widget mit deinem eigenen Theme und Logo.
              </div>
            )}

            {isB && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    label="Primärfarbe"
                    type="color"
                    value={form.brand_primary_override || svBrand?.brand_primary || CLAIMONDO_FLAT_THEME.primary}
                    onChange={(e) => patch({ brand_primary_override: e.target.value })}
                  />
                  <TextField
                    label="Akzentfarbe"
                    type="color"
                    value={form.brand_accent_override || svBrand?.brand_accent || CLAIMONDO_FLAT_THEME.accent}
                    onChange={(e) => patch({ brand_accent_override: e.target.value })}
                  />
                  <TextField
                    label="Textfarbe"
                    type="color"
                    value={form.brand_secondary_override || CLAIMONDO_FLAT_THEME.text}
                    onChange={(e) => patch({ brand_secondary_override: e.target.value })}
                  />
                </div>
                <TextField
                  label="Logo-URL (optional)"
                  value={form.brand_logo_url_override}
                  onChange={(e) => patch({ brand_logo_url_override: e.target.value })}
                  hint="Direkte URL zu deinem Logo (SVG/PNG). Leer = Claimondo-Logo."
                  placeholder="https://…/logo.svg"
                />

                {/* Q7-Consent */}
                <label className="flex items-start gap-2 text-sm text-claimondo-navy cursor-pointer">
                  <Checkbox
                    checked={form.agb_akzeptiert}
                    onCheckedChange={(c) => patch({ agb_akzeptiert: c === true })}
                  />
                  <span className={fieldErrors.has('agb_akzeptiert') ? 'text-red-700' : ''}>
                    Ich akzeptiere die Kooperations-AGB ({MONIKA_AGB_VERSION}) — 70 € pro vereinbartem Termin.
                  </span>
                </label>
              </div>
            )}
          </SectionCard>

          <ThemePreview form={form} svBrand={svBrand} defaultLogo={defaultLogo} />
        </div>
      )}

      {/* STEP 2 — Zusammenfassung */}
      {step === 2 && (
        <SectionCard title="Zusammenfassung" bodyClassName="space-y-2 text-sm">
          <Row label="Name" value={form.name} />
          <Row label="Slug" value={form.slug} />
          <Row label="Variante" value={isB ? 'B (70 € / Termin)' : 'A (kostenlos)'} />
          <Row label="Domains" value={form.erlaubte_domains.join(', ') || '—'} />
          <Row label="Empfänger" value={form.empfaenger_email} />
          {form.cc_email && <Row label="CC" value={form.cc_email} />}
        </SectionCard>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
          Zurück
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="navy" onClick={next}>
            Weiter
          </Button>
        ) : (
          <Button variant="navy" loading={saving} onClick={submit}>
            {mode === 'edit' ? 'Speichern' : 'Site anlegen'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-claimondo-border/60 py-1.5 last:border-0">
      <span className="text-claimondo-ondo">{label}</span>
      <span className="text-claimondo-navy font-medium text-right">{value}</span>
    </div>
  )
}
