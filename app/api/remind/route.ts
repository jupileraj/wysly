import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getMaandag(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const day = r.getDay(); r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day)); return r
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function dagIdx(d: Date): number { const day = d.getDay(); return day === 0 ? 6 : day - 1 }

export async function GET(request: Request) {
  // Vercel stuurt automatisch deze header bij cron jobs
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return NextResponse.json({ skipped: 'geen webhook' })

  const admin = createAdminClient()

  // Huidige tijd in Amsterdam
  const now = new Date()
  const nlNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const currentMinutes = nlNow.getHours() * 60 + nlNow.getMinutes()

  // Weekend overslaan
  const dag = nlNow.getDay()
  if (dag === 0 || dag === 6) return NextResponse.json({ skipped: 'weekend' })

  const weekStart = formatDate(getMaandag(nlNow))
  const dayIndex = dagIdx(nlNow)

  // Alle weekplannen voor deze week
  const { data: weekPlannen } = await admin
    .from('week_plans')
    .select('id, user_id')
    .eq('week_start', weekStart)

  if (!weekPlannen?.length) return NextResponse.json({ checked: 0 })

  const reminded: string[] = []

  for (const wp of weekPlannen as { id: string; user_id: string }[]) {
    // Dagplan van vandaag
    const { data: dp } = await admin
      .from('day_plans')
      .select('id, start_time, is_working')
      .eq('week_plan_id', wp.id)
      .eq('day_of_week', dayIndex)
      .maybeSingle()

    if (!dp?.is_working || !dp.start_time) continue

    // Bereken het herinneringsvenster: start + 60 min t/m start + 75 min
    const [h, m] = (dp.start_time as string).split(':').map(Number)
    const startMinutes = h * 60 + m
    const vensterStart = startMinutes + 60
    const vensterEind  = startMinutes + 75

    if (currentMinutes < vensterStart || currentMinutes >= vensterEind) continue

    // Check of er al taken zijn ingevuld
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('day_plan_id', dp.id)

    if ((count ?? 0) > 0) continue

    // Naam ophalen
    const { data: profiel } = await admin
      .from('profiles')
      .select('name')
      .eq('id', wp.user_id)
      .single()

    const naam = profiel?.name ?? 'Onbekend'

    // Slack bericht sturen
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `⏰ *${naam}* heeft zijn/haar dagtaken nog niet ingevuld — al meer dan een uur aan het werk. Herinnering: vul je taken in via Wysly!`,
      }),
    })

    reminded.push(naam)
  }

  return NextResponse.json({ reminded, checked: weekPlannen.length })
}
