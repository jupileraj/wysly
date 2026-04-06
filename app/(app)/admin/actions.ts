'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
        tasks(id, task_text, sort_order, client_id, week_goal_id, task_reviews(completed, reason)))`)
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

export async function maakGebruikerAan(formData: FormData): Promise<{ error?: string; success?: boolean }> {
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
