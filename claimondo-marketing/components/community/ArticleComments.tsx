import { listApprovedComments, getAuthState } from '@/lib/community/comments'
import { CommentForm } from './CommentForm'
import { ReportButton } from './ReportButton'
import { jsonLdScript } from '@/lib/seo/jsonld'
import { SessionSync } from './SessionSync'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

export async function ArticleComments({ articleSlug }: { articleSlug: string }) {
  const [comments, state] = await Promise.all([listApprovedComments(articleSlug), getAuthState()])

  const schema =
    comments.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'Comment',
          comment: comments.map((c) => ({
            '@type': 'Comment',
            text: c.body,
            author: { '@type': 'Person', name: c.username },
          })),
        }
      : null

  return (
    <section id="kommentare" className="mt-14 border-t border-claimondo-border pt-8">
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(schema)} />}
      <h2 style={HEAD_FONT} className="text-xl font-bold text-claimondo-navy">
        Kommentare {comments.length > 0 && <span className="text-claimondo-shield">({comments.length})</span>}
      </h2>

      <SessionSync loggedIn={state.isLoggedIn} />
      <CommentForm slug={articleSlug} isLoggedIn={state.isLoggedIn} hasUsername={!!state.username} username={state.username} />

      <ul className="mt-6 space-y-3.5">
        {comments.length === 0 && (
          <li className="text-sm text-claimondo-shield">Noch keine Kommentare – schreib den ersten.</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className="rounded-ios-md border border-claimondo-border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[0.8125rem] font-semibold text-claimondo-navy">{c.username}</div>
              <ReportButton commentId={c.id} isLoggedIn={state.isLoggedIn} />
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-claimondo-shield">{c.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.75rem] text-claimondo-shield/70">
        Kommentare geben die Meinung der Verfasser:innen wieder, nicht die von Claimondo. Sie werden vor Veröffentlichung geprüft – es gelten unsere{' '}
        <a href="/kommentar-regeln" className="underline hover:text-claimondo-shield">Kommentar-Regeln</a>.
      </p>
    </section>
  )
}
