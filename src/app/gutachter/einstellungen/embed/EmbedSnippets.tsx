'use client'

// AAR-login-embed — persistente Snippet-Karte fuer eine Embed-Site.
// Zeigt BEIDE Einbinde-Snippets (Schaden-Widget + Login-Button) mit Copy-Button.
// Gerendert im Wizard-Erfolgsscreen UND auf der Bearbeiten-Seite — damit ein SV das
// Snippet jederzeit wiederbekommt, nicht nur einmalig direkt nach dem Anlegen.

import { toast } from 'sonner'
import { CopyIcon, Code2Icon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { monikaSnippet, loginSnippet } from '@/lib/embed/embed-host'

function SnippetBlock({ label, hint, snippet }: { label: string; hint: string; snippet: string }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-claimondo-navy">{label}</p>
        <p className="text-xs text-claimondo-ondo">{hint}</p>
      </div>
      <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
        {snippet}
      </pre>
      <Button
        variant="navy"
        size="sm"
        iconLeft={<CopyIcon style={{ width: 16, height: 16 }} />}
        onClick={() => {
          navigator.clipboard.writeText(snippet)
          toast.success('Snippet kopiert')
        }}
      >
        Kopieren
      </Button>
    </div>
  )
}

export default function EmbedSnippets({ slug }: { slug: string }) {
  return (
    <SectionCard title="Einbinde-Snippets" icon={<Code2Icon style={{ width: 18, height: 18 }} />}>
      <p className="text-sm text-claimondo-ondo mb-4">
        Füge das jeweilige Snippet einmalig in den <code>&lt;head&gt;</code> deiner Website ein.
      </p>
      <div className="space-y-5">
        <SnippetBlock
          label="Schaden-Widget"
          hint="Öffnet das Anfrage-Formular für deine Kunden (schwebender Button unten rechts)."
          snippet={monikaSnippet(slug)}
        />
        <SnippetBlock
          label="Login-Button"
          hint={
            'Gebrandeter »Anmelden«-Button für deine Kunden — schwebt oben rechts. Für eine feste ' +
            'Position: ein Element mit data-claimondo-login-slot platzieren und dem Snippet ' +
            'data-mode="slot" hinzufügen.'
          }
          snippet={loginSnippet(slug)}
        />
      </div>
    </SectionCard>
  )
}
