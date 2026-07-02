'use server'

import { getPostThread } from './community-queries'
import type { CommentRow } from './community-queries'

/**
 * Server-Action-Wrapper fuer getPostThread — erlaubt Client-Komponenten
 * (PostCard) das Lazy-Loading eines Thread via useTransition.
 * Nur async-Exports erlaubt in 'use server'-Files (AAR-664).
 */
export async function loadPostThread(postId: string): Promise<{
  top: CommentRow[]
  repliesByParent: Record<string, CommentRow[]>
}> {
  return getPostThread(postId)
}
