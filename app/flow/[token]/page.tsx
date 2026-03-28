import FlowWizard from './FlowWizard'

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <FlowWizard token={token} />
}
