'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

export async function laadAdminWeekData(weekStart: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }
  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const admin = createAdminClient()

  const { data: weekplannen } = await admin.from('week_plans')
    .select(`id, user_id, week_start,
      day_plans(id, day_of_week, is_working, start_time, end_time, help_text,
        tasks(id, task_text, sort_order, client_id, week_goal_id, leverage, task_reviews(completed, reason)))`)

    .eq('week_start', weekStart)

  const wpIds = (weekplannen ?? []).map((w: { id: string }) => w.id)
  const userIdForWpId: Record<string, string> = {}
  for (const w of (weekplannen ?? []) as { id: string; user_id: string }[]) userIdForWpId[w.id] = w.user_id

  if (wpIds.length === 0) return { weekplannen: weekplannen ?? [], weekGoals: [] }

  const { data: goals } = await admin.from('week_goals')
    .select('id, week_plan_id, goal_text, client_id').in('week_plan_id', wpIds).order('sort_order')

  if (!goals?.length) return { weekplannen: weekplannen ?? [], weekGoals: [] }

  const goalIds = goals.map((g: { id: string }) => g.id)
  const { data: linkedTasks } = await admin.from('tasks')
    .select('id, week_goal_id').in('week_goal_id', goalIds)
  const linkedTaskIds = (linkedTasks ?? []).map((t: { id: string }) => t.id)
  const completedGoalIds = new Set<string>()
  if (linkedTaskIds.length > 0) {
    const { data: completedRevs } = await admin.from('task_reviews')
      .select('task_id').in('task_id', linkedTaskIds).eq('completed', true)
    const completedTaskIds = new Set((completedRevs ?? []).map((r: { task_id: string }) => r.task_id))
    for (const t of (linkedTasks ?? []) as { id: string; week_goal_id: string }[]) {
      if (completedTaskIds.has(t.id)) completedGoalIds.add(t.week_goal_id)
    }
  }

  const weekGoals = goals.map((g: { id: string; week_plan_id: string; goal_text: string; client_id: string | null }) => ({
    id: g.id,
    goal_text: g.goal_text,
    client_id: g.client_id ?? null,
    voltooid: completedGoalIds.has(g.id),
    userId: userIdForWpId[g.week_plan_id],
  }))

  return { weekplannen: weekplannen ?? [], weekGoals }
}

function getMaandag(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const day = r.getDay(); r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day)); return r
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }

export type LeverageStat = { userId: string; name: string; high: number; low: number; geen: number }

export async function laadLeverageStats(aantalWeken: number): Promise<LeverageStat[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }
  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const admin = createAdminClient()
  const cutoff = getMaandag(new Date())
  cutoff.setDate(cutoff.getDate() - aantalWeken * 7)

  const { data: profielen } = await admin.from('profiles').select('id, name').order('name')
  if (!profielen?.length) return []

  const { data: weekplannen } = await admin.from('week_plans')
    .select('id, user_id').gte('week_start', formatDate(cutoff))
  if (!weekplannen?.length) return (profielen as { id: string; name: string }[]).map(p => ({ userId: p.id, name: p.name, high: 0, low: 0, geen: 0 }))

  const wpIds = (weekplannen as { id: string }[]).map(w => w.id)
  const wpUserMap: Record<string, string> = {}
  for (const w of weekplannen as { id: string; user_id: string }[]) wpUserMap[w.id] = w.user_id

  const { data: dps } = await admin.from('day_plans')
    .select('id, week_plan_id').in('week_plan_id', wpIds).eq('is_working', true)
  if (!dps?.length) return (profielen as { id: string; name: string }[]).map(p => ({ userId: p.id, name: p.name, high: 0, low: 0, geen: 0 }))

  const dpIds = (dps as { id: string }[]).map(d => d.id)
  const dpWpMap: Record<string, string> = {}
  for (const d of dps as { id: string; week_plan_id: string }[]) dpWpMap[d.id] = d.week_plan_id

  const { data: taken } = await admin.from('tasks')
    .select('day_plan_id, leverage').in('day_plan_id', dpIds)

  const stats: Record<string, { high: number; low: number; geen: number }> = {}
  for (const t of (taken ?? []) as { day_plan_id: string; leverage: string | null }[]) {
    const wpId = dpWpMap[t.day_plan_id]
    const userId = wpUserMap[wpId]
    if (!userId) continue
    if (!stats[userId]) stats[userId] = { high: 0, low: 0, geen: 0 }
    if (t.leverage === 'high') stats[userId].high++
    else if (t.leverage === 'low') stats[userId].low++
    else stats[userId].geen++
  }

  return (profielen as { id: string; name: string }[]).map(p => ({
    userId: p.id, name: p.name,
    high: stats[p.id]?.high ?? 0,
    low:  stats[p.id]?.low  ?? 0,
    geen: stats[p.id]?.geen ?? 0,
  }))
}

export async function maakGebruikerAan(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }

  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const email         = (formData.get('email') as string)?.trim()
  const name          = (formData.get('name') as string)?.trim()
  const role          = (formData.get('role') as string) || 'employee'
  const contractHours = parseFloat(formData.get('contract_hours') as string) || 40

  if (!email || !name) return { error: 'Vul alle verplichte velden in' }

  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // Genereer uitnodigingslink via Supabase
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { name, role, contract_hours: contractHours },
      redirectTo: `${siteUrl}/auth/callback?next=/accept-invite`,
    },
  })

  if (error) return { error: error.message }

  // Profiel alvast bijwerken
  if (linkData.user) {
    await admin.from('profiles')
      .update({ name, role, contract_hours: contractHours })
      .eq('id', linkData.user.id)
  }

  // Verstuur e-mail via Resend
  const resend = new Resend(process.env.RESEND_API_KEY)
  const inviteUrl = linkData.properties.action_link

  const { error: mailError } = await resend.emails.send({
    from: 'Wysly <uitnodiging@wysly.nl>',
    to: email,
    subject: `Je bent uitgenodigd voor Wysly`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 8px;">Hey ${name} 👋</h1>
        <p style="color: #666; margin-bottom: 24px;">Je bent uitgenodigd om Wysly te gebruiken — de weekplanner van jouw team.</p>
        <a href="${inviteUrl}"
          style="display: inline-block; background: #00d49c; color: #1a1a1a; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 999px; text-decoration: none;">
          Account activeren
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">Deze link is 24 uur geldig. Werkt de knop niet? Kopieer dan deze URL:<br/>
          <a href="${inviteUrl}" style="color: #00d49c; word-break: break-all;">${inviteUrl}</a>
        </p>
      </div>
    `,
  })

  if (mailError) return { error: `Account aangemaakt maar e-mail mislukt: ${mailError.message}` }

  return { success: true }
}

export async function maakDirectGebruikerAan(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }

  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const email         = (formData.get('email') as string)?.trim()
  const password      = formData.get('password') as string
  const name          = (formData.get('name') as string)?.trim()
  const role          = (formData.get('role') as string) || 'employee'
  const contractHours = parseFloat(formData.get('contract_hours') as string) || 40

  if (!email || !password || !name) return { error: 'Vul alle verplichte velden in' }
  if (password.length < 8) return { error: 'Wachtwoord moet minimaal 8 tekens zijn' }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, contract_hours: contractHours },
  })

  if (error) return { error: error.message }

  if (data.user) {
    await admin.from('profiles')
      .update({ name, role, contract_hours: contractHours })
      .eq('id', data.user.id)
  }

  return { success: true }
}

export async function verwijderGebruiker(userId: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }
  if (user.id === userId) return { error: 'Je kunt je eigen account niet verwijderen' }

  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateGebruiker(
  userId: string,
  data: { name: string; role: string; contract_hours: number }
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Niet ingelogd' }

  const { data: profiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profiel?.role !== 'admin') return { error: 'Geen toegang' }

  const { error } = await supabase.from('profiles')
    .update({ name: data.name, role: data.role, contract_hours: data.contract_hours })
    .eq('id', userId)

  if (error) return { error: error.message }
  return { success: true }
}
