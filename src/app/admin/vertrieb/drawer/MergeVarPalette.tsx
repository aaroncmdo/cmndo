'use client'
// Cold-Mailer: geteilte Variablen-/Aktions-Palette fuer beide Editoren (Einzel-Composer
// + Vorlagen-Editor). Rein praesentational — kennt keine Textareas; der Parent macht den
// Cursor-Splice (klare Grenze). Definitionen kommen aus der Single-Source merge-vars.ts.
import { Button } from '@/components/primitives'
import { MERGE_VARS, ACTION_VARS } from '@/lib/cold-mail/merge-vars'

export default function MergeVarPalette({
  onInsert,
}: {
  /** isAction=true -> der Parent fuegt in den Body ein (Buttons gehoeren nicht in den Betreff). */
  onInsert: (token: string, isAction: boolean) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-caption uppercase tracking-wide text-claimondo-ondo/50 mr-1">Variablen</span>
        {MERGE_VARS.map((v) => (
          <Button
            key={v.token}
            variant="ghost"
            size="sm"
            onClick={() => onInsert(v.token, false)}
            ariaLabel={`Variable ${v.label} einfügen`}
          >
            {v.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-caption uppercase tracking-wide text-claimondo-ondo/50 mr-1">Aktionen</span>
        {ACTION_VARS.map((a) => (
          <Button
            key={a.token}
            variant="ondo"
            size="sm"
            onClick={() => onInsert(a.token, true)}
            ariaLabel={`Aktion ${a.label} einfügen`}
          >
            + {a.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
