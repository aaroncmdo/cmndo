import SignaturPage from './SignaturPage'

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <SignaturPage fallId={token} />
}
