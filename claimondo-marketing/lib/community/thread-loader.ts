'use server'

import { getThread } from './community-queries'
import type { CommentRow } from './community-queries'

/**
 * Server-Action-Wrapper fuer getThread — erlaubt Client-Komponenten
 * (PostCard) das Lazy-Loading eines Thread via useTransition.
 * Unterstuetzt sowohl Posts als auch Wissen-Artikel (targetKind).
 * Nur async-Exports erlaubt in 'use server'-Files (AAR-664).
 */
export async function loadThread(
  targetKind: 'post' | 'wissen',
  targetId: string,
): Promise<{
  top: CommentRow[]
  repliesByParent: Record<string, CommentRow[]>
}> {
  return getThread(targetKind, targetId)
}
