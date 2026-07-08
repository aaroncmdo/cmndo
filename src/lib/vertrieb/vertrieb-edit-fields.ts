// src/lib/vertrieb/vertrieb-edit-fields.ts
// Whitelist der editierbaren Felder je kind (Tabelle + Felder). NICHT 'use server'
// (AAR-664: keine const-Exporte aus 'use server'-Files). P0 minimal: nur die
// verifiziert-existierende Spalte sachverstaendige.notizen — P1 erweitert je kind
// (nach Spalten-Verifikation der anderen Partner-Tabellen).
import type { VertriebKind } from './vertrieb-kontakt.types'

export const VERTRIEB_EDIT_TARGET: Partial<
  Record<VertriebKind, { table: string; fields: readonly string[] }>
> = {
  sv: { table: 'sachverstaendige', fields: ['notizen'] },
}
