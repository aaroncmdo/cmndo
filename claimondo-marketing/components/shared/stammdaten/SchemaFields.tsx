'use client'

// AAR-frontend-konsolidierung-p2 (P2-T4): Schema-getriebener Edit-Renderer für
// einen Stammdaten-Block. Mappt STAMMDATEN_FIELD_SCHEMA → <InlineEditField …>
// (das gegen FallContext speichert). `fall`/`lead` werden für getValue/visibleWhen
// gebraucht. Ersetzt (in T4.2) die ~14 hand-codierten <InlineEditField …>-Listen
// in faelle/[id]/_stammdaten/Sections.tsx.

import InlineEditField from '@/app/faelle/[id]/_stammdaten/InlineEditField'
import { fieldsForBlock, fallToDisplay, type StammdatenBlock } from '@/lib/stammdaten/schema'

export function SchemaFields({
  block,
  fall,
  lead,
  claim,
}: {
  block: StammdatenBlock
  fall: Record<string, unknown>
  lead?: Record<string, unknown> | null
  /**
   * CMM-Brücke: claim-Daten als Fallback für Felder die noch nicht namens-
   * synchron zu faelle gespiegelt sind (schadenort_*, ursache,
   * gegner_aktenzeichen). Wird vom Admin/KB-Pfad über FallContext durchgereicht.
   */
  claim?: Record<string, unknown> | null
}) {
  return (
    <>
      {fieldsForBlock(block).map((def) => {
        if (def.visibleWhen && !def.visibleWhen(fall)) return null
        const value = def.getValue ? def.getValue(fall, lead, claim) : fallToDisplay(fall[def.key])
        const field = (
          <InlineEditField
            label={def.label}
            fieldName={def.key}
            value={value}
            type={def.type}
            options={def.options}
            hint={def.hint}
            placeholder={def.placeholder}
            transform={def.transform}
          />
        )
        // fullWidth → <div className="sm:col-span-2"> wie in Sections.tsx (Textareas,
        // Adressen, unfallort, gegner_name). Sonst direkt als Grid-Item.
        return def.fullWidth ? (
          <div key={def.key} className="sm:col-span-2">
            {field}
          </div>
        ) : (
          // Fragment trägt den key, InlineEditField bleibt das einzige Grid-Item.
          <div key={def.key} className="contents">
            {field}
          </div>
        )
      })}
    </>
  )
}
