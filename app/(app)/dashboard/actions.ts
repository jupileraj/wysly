'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function getMaandag(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const day = r.getDay(); r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day)); return r
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function dagIdx(d: Date): number { const day = d.getDay(); return day === 0 ? 6 : day - 1 }

export type CollegaTaak = { id: string; task_text: string; sort_order: number; clientNaam: string | null }
export type CollegaVandaag = { id: string; name: string; avatarUrl: string | null; taken: CollegaTaak[]; helpTekst: string | null; isWorking: boolean; startTime: string | null; endTime: string | null }

export async function laadTeamVandaag(): Promise<CollegaVandaag[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const vandaag = new Date()
  const weekStart = formatDate(getMaandag(vandaag))
  const dagI = dagIdx(vandaag)

  const { data: profielen } = await admin.from('profiles')
    .select('id, name, avatar_url').neq('id', user.id).order('name')
  if (!profielen?.length) return []
  type Profiel = { id: string; name: string; avatar_url: string | null }

  const userIds = profielen.map((p: Profiel) => p.id)

  const { data: weekPlannen } = await admin.from('week_plans')
    .select('id, user_id').eq('week_start', weekStart).in('user_id', userIds)
  if (!weekPlannen?.length) return profielen.map((p: Profiel) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url ?? null, taken: [], helpTekst: null, isWorking: false, startTime: null, endTime: null }))

  const wpIds = weekPlannen.map((w: { id: string }) => w.id)
  const wpUserMap: Record<string, string> = {}
  for (const w of weekPlannen as { id: string; user_id: string }[]) wpUserMap[w.id] = w.user_id

  const { data: dagPlannen } = await admin.from('day_plans')
    .select('id, week_plan_id, help_text, is_working, start_time, end_time').in('week_plan_id', wpIds).eq('day_of_week', dagI)
  if (!dagPlannen?.length) return profielen.map((p: Profiel) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url ?? null, taken: [], helpTekst: null, isWorking: false, startTime: null, endTime: null }))

  const dpIds = dagPlannen.map((d: { id: string }) => d.id)
  const dpWpMap: Record<string, string> = {}
  const dpHelpMap: Record<string, string | null> = {}
  const dpWorkingMap: Record<string, boolean> = {}
  const dpStartMap: Record<string, string | null> = {}
  const dpEndMap: Record<string, string | null> = {}
  for (const d of dagPlannen as { id: string; week_plan_id: string; help_text: string | null; is_working: boolean; start_time: string | null; end_time: string | null }[]) {
    dpWpMap[d.id] = d.week_plan_id
    dpHelpMap[d.id] = d.help_text ?? null
    dpWorkingMap[d.id] = d.is_working
    dpStartMap[d.id] = d.start_time ? d.start_time.slice(0, 5) : null
    dpEndMap[d.id] = d.end_time ? d.end_time.slice(0, 5) : null
  }

  const { data: taken } = await admin.from('tasks')
    .select('id, task_text, sort_order, client_id, day_plan_id').in('day_plan_id', dpIds).order('sort_order')

  const clientIds = [...new Set((taken ?? []).map((t: { client_id: string | null }) => t.client_id).filter(Boolean))] as string[]
  const clientMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    const { data: klanten } = await admin.from('clients').select('id, name').in('id', clientIds)
    for (const k of klanten ?? []) clientMap[(k as { id: string; name: string }).id] = (k as { id: string; name: string }).name
  }

  // Groepeer taken per day_plan
  const takenPerDp: Record<string, CollegaTaak[]> = {}
  for (const t of (taken ?? []) as { id: string; task_text: string; sort_order: number; client_id: string | null; day_plan_id: string }[]) {
    if (!takenPerDp[t.day_plan_id]) takenPerDp[t.day_plan_id] = []
    takenPerDp[t.day_plan_id].push({ id: t.id, task_text: t.task_text, sort_order: t.sort_order, clientNaam: t.client_id ? (clientMap[t.client_id] ?? null) : null })
  }

  // userId -> dpId mapping
  const userDpMap: Record<string, string> = {}
  for (const dp of dagPlannen as { id: string; week_plan_id: string }[]) {
    const userId = wpUserMap[dp.week_plan_id]
    if (userId) userDpMap[userId] = dp.id
  }

  return profielen.map((p: Profiel) => {
    const dpId = userDpMap[p.id]
    return {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatar_url ?? null,
      taken: dpId ? (takenPerDp[dpId] ?? []) : [],
      helpTekst: dpId ? (dpHelpMap[dpId] ?? null) : null,
      isWorking: dpId ? (dpWorkingMap[dpId] ?? false) : false,
      startTime: dpId ? (dpStartMap[dpId] ?? null) : null,
      endTime: dpId ? (dpEndMap[dpId] ?? null) : null,
    }
  })
}
