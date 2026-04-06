'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

type Review   = { completed: boolean; reason: string | null }
type Taak     = { id: string; task_text: string; sort_order: number; client_id: string | null; task_reviews: Review[] }
type DayPlan  = { id: string; day_of_week: number; is_working: boolean; tasks: Taak[] }
type WeekGoal = { id: string; goal_text: string; client_id: string | null }
type WeekPlan = { id: string; week_start: string; day_plans: DayPlan[]; week_goals: WeekGoal[] }

function weekLabel(ws: string): string {
  const ma = new Date(ws + 'T00:00:00'); const zo = new Date(ma); zo.setDate(zo.getDate() + 6)
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  return `${ma.toLocaleDateString('nl-NL', o)} – ${zo.toLocaleDateString('nl-NL', o)}`
}
function weekNr(ws: string): number {
  const d = new Date(ws + 'T00:00:00'); const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
}

export default function LogboekPage({ userId }: { userId?: string }) {
  const supabase = createClient()
  const [weken,        setWeken]        = useState<WeekPlan[]>([])
  const [clientMap,    setClientMap]    = useState<Record<string, string>>({})
  const [loading,      setLoading]      = useState(true)
  const [open,         setOpen]         = useState<Record<string, boolean>>({})
  const [profielNaam,  setProfielNaam]  = useState<string | null>(null)
  const [isAdmin,      setIsAdmin]      = useState(false)

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return

    const { data: eigenProfiel } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const admin = eigenProfiel?.role === 'admin'
    setIsAdmin(admin)

    const doelUserId = userId ?? user.id

    // Als we een ander profiel bekijken, check admin + laad naam
    if (userId && userId !== user.id) {
      if (!admin) { setLoading(false); return }
      const { data: p } = await supabase.from('profiles').select('name').eq('id', userId).single()
      setProfielNaam(p?.name ?? null)
    }

    // Klanten map
    const { data: kl } = await supabase.from('clients').select('id, name')
    setClientMap(Object.fromEntries((kl ?? []).map(k => [k.id, k.name])))

    // Week plans met dag tasks
    const { data: wpData } = await supabase.from('week_plans')
      .select('id, week_start, day_plans(id, day_of_week, is_working, tasks(id, task_text, sort_order, client_id, task_reviews(completed, reason)))')
      .eq('user_id', doelUserId)
      .order('week_start', { ascending: false })

    // Week goals apart ophalen
    const wpIds = (wpData ?? []).map((w: { id: string }) => w.id)
    let goalsPerWeek: Record<string, WeekGoal[]> = {}
    if (wpIds.length > 0) {
      const { data: goals } = await supabase.from('week_goals')
        .select('id, week_plan_id, goal_text, client_id').in('week_plan_id', wpIds).order('sort_order')
      if (goals) {
        for (const g of goals) {
          if (!goalsPerWeek[g.week_plan_id]) goalsPerWeek[g.week_plan_id] = []
          goalsPerWeek[g.week_plan_id].push({ id: g.id, goal_text: g.goal_text, client_id: g.client_id ?? null })
        }
      }
    }

    const wks: WeekPlan[] = (wpData ?? []).map((w: { id: string; week_start: string; day_plans: DayPlan[] }) => ({
      ...w,
      week_goals: goalsPerWeek[w.id] ?? [],
    })).filter((w: WeekPlan) =>
      w.day_plans?.some(d => d.tasks?.length > 0) || w.week_goals.length > 0
    )

    setWeken(wks)
    if (wks.length > 0) setOpen({ [wks[0].id]: true })
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { laad() }, [laad])

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>

  if (!isAdmin && userId) return <div className="text-center py-16 text-muted text-sm">Geen toegang.</div>

  if (weken.length === 0) return (
    <div className="text-center py-16">
      <p className="text-dark font-medium mb-1">Nog geen taken in het logboek</p>
      <p className="text-muted text-sm">Voer taken in via de Taken pagina — ze verschijnen hier automatisch.</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-medium text-dark tracking-tight">
          Logboek{profielNaam ? ` — ${profielNaam}` : ''}
        </h1>
      </div>

      <div className="space-y-3">
        {weken.map(week => {
          const werkDagen = (week.day_plans ?? []).filter(d => d.tasks?.length > 0).sort((a, b) => a.day_of_week - b.day_of_week)
          const alleTaken = werkDagen.flatMap(d => d.tasks)
          const nGelukt   = alleTaken.filter(t => t.task_reviews?.[0]?.completed === true).length
          const nNiet     = alleTaken.filter(t => t.task_reviews?.[0]?.completed === false).length
          const nOpen     = alleTaken.length - nGelukt - nNiet
          const heeftDoelen = week.week_goals.length > 0

          return (
            <div key={week.id} className="bg-light rounded-2xl border border-black/20 overflow-hidden">
              <button onClick={() => setOpen(p => ({ ...p, [week.id]: !p[week.id] }))}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-grey/40 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <span className="bg-dark text-brand text-xs font-medium px-2.5 py-0.5 rounded-full">W{weekNr(week.week_start)}</span>
                  <span className="text-sm font-medium text-dark">{weekLabel(week.week_start)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {nGelukt > 0 && <span className="bg-brand/20 text-dark px-2.5 py-0.5 rounded-full font-medium">{nGelukt} ✓</span>}
                  {nNiet   > 0 && <span className="bg-red-100 text-red-600 px-2.5 py-0.5 rounded-full font-medium">{nNiet} ✕</span>}
                  {nOpen   > 0 && <span className="bg-grey text-muted px-2.5 py-0.5 rounded-full font-medium">{nOpen} open</span>}
                  <span className="text-muted ml-1">{open[week.id] ? '▲' : '▼'}</span>
                </div>
              </button>

              {open[week.id] && (
                <div className="border-t border-black/10">

                  {/* ── Weekplanning doelen ── */}
                  {heeftDoelen && (
                    <div className="px-5 py-4 border-b border-black/10 bg-cream/40">
                      <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Weekplanning — doelen</p>
                      <ul className="space-y-2">
                        {week.week_goals.map((g, i) => (
                          <li key={g.id} className="flex items-center gap-2.5">
                            <span className="text-xs text-muted w-4 shrink-0 text-right">{i + 1}</span>
                            <span className="flex-1 text-sm text-dark">{g.goal_text}</span>
                            {g.client_id && clientMap[g.client_id] && (
                              <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{clientMap[g.client_id]}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Dagtaken ── */}
                  {werkDagen.length > 0 && (
                    <div className="divide-y divide-black/10">
                      {werkDagen.map(dag => (
                        <div key={dag.id} className="px-5 py-4">
                          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">{DAGEN[dag.day_of_week]}</p>
                          <ul className="space-y-2">
                            {[...dag.tasks].sort((a, b) => a.sort_order - b.sort_order).map(taak => {
                              const rev = taak.task_reviews?.[0]
                              return (
                                <li key={taak.id} className="flex items-start gap-2.5">
                                  <span className={`text-xs font-medium mt-0.5 shrink-0 w-4 ${rev?.completed === true ? 'text-brand' : rev?.completed === false ? 'text-red-400' : 'text-black/20'}`}>
                                    {rev?.completed === true ? '✓' : rev?.completed === false ? '✕' : '○'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`text-sm ${rev?.completed === true ? 'line-through text-muted' : 'text-dark'}`}>{taak.task_text}</p>
                                      {taak.client_id && clientMap[taak.client_id] && (
                                        <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{clientMap[taak.client_id]}</span>
                                      )}
                                    </div>
                                    {rev?.completed === false && rev.reason && (
                                      <p className="text-xs text-red-400 mt-0.5 italic">{rev.reason}</p>
                                    )}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {werkDagen.length === 0 && !heeftDoelen && (
                    <p className="px-5 py-4 text-sm text-muted italic">Geen taken of doelen deze week.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
