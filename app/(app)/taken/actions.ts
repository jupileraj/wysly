'use server'

import { createClient } from '@/lib/supabase/server'

type TaakBericht = { tekst: string; clientNaam: string | null }

export async function stuurSlackBericht(
  taken: TaakBericht[],
  helpText: string,
  dagLabel: string
): Promise<{ error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data: profiel } = await supabase.from('profiles').select('name').eq('id', user.id).single()
  const naam = profiel?.name ?? user.email ?? 'Onbekend'

  const taakRegels = taken
    .filter(t => t.tekst.trim())
    .map(t => `• ${t.tekst}${t.clientNaam ? ` _(${t.clientNaam})_` : ''}`)
    .join('\n')

  let tekst = `*${naam}* — ${dagLabel}\n\n${taakRegels}`

  if (helpText.trim()) {
    tekst += `\n\n❓ *Hulpvraag:* ${helpText.trim()}`
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: tekst }),
    })
    if (!res.ok) return { error: `Slack fout: ${res.status}` }
  } catch {
    return { error: 'Slack niet bereikbaar' }
  }
  return {}
}
