// AAR-kanzlei-portal PR 2b: /kanzlei/fall/[id] leitet auf /faelle/[id]
// weiter. Die /faelle/layout.tsx erkennt die Kanzlei-Rolle und rendert die
// KanzleiNav-Shell; /faelle/[id]/page.tsx lädt die volle Fallakte und
// FallakteShell gated alle Edit-Actions über FALL_PERMISSIONS (kanzlei →
// READONLY_PERMISSIONS) und field-permissions (canEditField → false für
// alle Felder). Dadurch gibt es nur eine Data-Loading-Quelle für die
// Fallakte — keine Doppelung.

import { redirect } from 'next/navigation'

export default async function KanzleiFallRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/faelle/${id}`)
}
