'use client'

// AAR-frontend-konsolidierung-p2 (P2-T4.7): Schema-getriebener Edit-Renderer
// für einen Stammdaten-Block der `leads`-Tabelle. Mappt
// LEAD_STAMMDATEN_FIELD_SCHEMA → <InlineField …> (auto-save on-blur via
// saveStammdaten). Pendant zu SchemaFields.tsx für die `faelle`-Tabelle.

import InlineField from '@/app/dispatch/leads/[id]/_phases/InlineField'
import {
  leadFieldsForBlock,
  leadFieldToDisplay,
  type LeadStammdatenBlock,
} from '@/lib/stammdaten/leadSchema'

export function LeadSchemaFields({
  block,
  lead,
  leadId,
}: {
  block: LeadStammdatenBlock
  lead: Record<string, unknown>
  leadId: string
}) {
  return (
    <>
      {leadFieldsForBlock(block).map((def) => {
        if (def.visibleWhen && !def.visibleWhen(lead)) return null
        const value = def.getValue ? def.getValue(lead) : leadFieldToDisplay(lead[def.key])
        const field = (
          <InlineField
            label={def.label}
            fieldName={def.key}
            leadId={leadId}
            value={value}
            type={def.type}
            options={def.options}
            hint={def.hint}
            placeholder={def.placeholder}
            transform={def.transform}
          />
        )
        // fullWidth → <div className="sm:col-span-2"> für Textareas / Adressen,
        // analog SchemaFields.tsx für die `faelle`-Tabelle.
        return def.fullWidth ? (
          <div key={def.key} className="sm:col-span-2">
            {field}
          </div>
        ) : (
          <div key={def.key} className="contents">
            {field}
          </div>
        )
      })}
    </>
  )
}
