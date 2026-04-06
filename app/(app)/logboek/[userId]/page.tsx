import LogboekPage from '../page'

export default async function MedewerkerLogboek({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  return <LogboekPage userId={userId} />
}
