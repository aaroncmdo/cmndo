import { getNetzwerkFeed, getUserLikedKeys } from '@/lib/community/feed'
import { getTopCommentsPreview } from '@/lib/community/threads'
import { NetzwerkFeed } from '@/components/shared/netzwerk/NetzwerkFeed'

export const dynamic = 'force-dynamic'

export default async function GutachterNetzwerkPage() {
  const entries = await getNetzwerkFeed()
  const [likedKeys, previewsByKey] = await Promise.all([
    getUserLikedKeys(entries),
    getTopCommentsPreview(entries),
  ])
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <NetzwerkFeed portal="gutachter" entries={entries} likedKeys={likedKeys} previewsByKey={previewsByKey} />
    </div>
  )
}
