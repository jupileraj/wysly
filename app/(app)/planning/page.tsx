'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

type DagState  = { isWorking: boolean; startTime: string; endTime: string }
type WeekDoel  = { id: string | null; tekst: string; clientId: string | null; voltooid: boolean }
type Client    = { id: string; name: string }

function getMaandag(date: Date): Date {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const dag = d.getDay(); d.setDate(d.getDate() + (dag === 0 ? -6 : 1 - dag)); return d
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function berekenUren(s: string, e: string): number {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60)
}
const standaard = (): DagState[] =>
  Array.from({ length: 7 }, (_, i) => ({ isWorking: i < 5, startTime: '09:00', endTime: '17:00' }))
const leegDoel = (): WeekDoel => ({ id: null, tekst: '', clientId: null, voltooid: false })

export default function PlanningPage() {
  const supabase = createClient()
  const [weekStart,    setWeekStart]    = useState<Date>(() => getMaandag(new Date()))
  const [weekPlanId,   setWeekPlanId]   = useState<string | null>(null)
  const [dagen,        setDagen]        = useState<DagState[]>(standaard())
  const [doelen,       setDoelen]       = useState<WeekDoel[]>([leegDoel()])
  const [teVerwijderen,setTeVerwijderen]= useState<string[]>([])
  const [klanten,      setKlanten]      = useState<Client[]>([])
  const [contractUren, setContractUren] = useState(40)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [opgeslagen,   setOpgeslagen]   = useState(false)
  const [kopieren,     setKopieren]     = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => setKlanten(data ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { data: p } = await supabase.from('profiles').select('contract_hours').eq('id', user.id).single()
    if (p) setContractUren(p.contract_hours)

    const { data: wp } = await supabase.from('week_plans')
      .select('id, day_plans(id, day_of_week, is_working, start_time, end_time)')
      .eq('user_id', user.id).eq('week_start', formatDate(weekStart)).maybeSingle()

    const nd = standaard()
    if (wp?.day_plans?.length) {
      for (const dp of wp.day_plans as { id: string; day_of_week: number; is_working: boolean; start_time: string | null; end_time: string | null }[]) {
        nd[dp.day_of_week] = {
          isWorking: dp.is_working,
          startTime: dp.start_time?.slice(0, 5) ?? '09:00',
          endTime:   dp.end_time?.slice(0, 5)   ?? '17:00',
        }
      }
    }
    setDagen(nd)
    setWeekPlanId(wp?.id ?? null)
    setTeVerwijderen([])

    if (wp?.id) {
      const { data: goals } = await supabase.from('week_goals')
        .select('id, goal_text, client_id').eq('week_plan_id', wp.id).order('sort_order')
      if (goals?.length) {
        // Bepaal welke weekdoelen al voltooid zijn via gekoppelde dagtaken
        const goalIds = goals.map(g => g.id)
        const { data: linkedTasks } = await supabase.from('tasks')
          .select('id, week_goal_id').in('week_goal_id', goalIds)
        const linkedTaskIds = (linkedTasks ?? []).map(t => t.id)
        const completedGoalIds = new Set<string>()
        if (linkedTaskIds.length > 0) {
          const { data: completedRevs } = await supabase.from('task_reviews')
            .select('task_id').in('task_id', linkedTaskIds).eq('completed', true)
          const completedTaskIds = new Set((completedRevs ?? []).map(r => r.task_id))
          for (const t of (linkedTasks ?? [])) {
            if (completedTaskIds.has(t.id)) completedGoalIds.add(t.week_goal_id!)
          }
        }
        setDoelen([...goals.map(g => ({
          id: g.id, tekst: g.goal_text, clientId: g.client_id ?? null,
          voltooid: completedGoalIds.has(g.id),
        })), leegDoel()])
      } else {
        setDoelen([leegDoel()])
      }
    } else {
      setDoelen([leegDoel()])
    }

    setLoading(false)
  }, [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { laad() }, [laad])

  async function slaOp() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return

    const { data: wp, error } = await supabase.from('week_plans')
      .upsert({ user_id: user.id, week_start: formatDate(weekStart) }, { onConflict: 'user_id,week_start' })
      .select('id').single()
    if (error || !wp) { setSaving(false); return }
    setWeekPlanId(wp.id)

    // Dagplannen
    await supabase.from('day_plans').upsert(
      dagen.map((d, i) => ({
        week_plan_id: wp.id, day_of_week: i, is_working: d.isWorking,
        start_time: d.isWorking ? d.startTime : null,
        end_time:   d.isWorking ? d.endTime   : null,
      })),
      { onConflict: 'week_plan_id,day_of_week' }
    )

    // Verwijder gemarkeerde weekdoelen
    if (teVerwijderen.length > 0) {
      await supabase.from('week_goals').delete().in('id', teVerwijderen)
      setTeVerwijderen([])
    }

    // Weekdoelen
    const vulled = doelen.filter(d => d.tekst.trim())
    const nieuweDoelen = [...doelen]
    for (let i = 0; i < vulled.length; i++) {
      const doel = vulled[i]
      if (doel.id) {
        await supabase.from('week_goals').update({ goal_text: doel.tekst.trim(), client_id: doel.clientId, sort_order: i }).eq('id', doel.id)
      } else {
        const { data: ng } = await supabase.from('week_goals')
          .insert({ week_plan_id: wp.id, goal_text: doel.tekst.trim(), client_id: doel.clientId, sort_order: i })
          .select('id').single()
        const origIdx = doelen.findIndex((d, idx) => !d.id && doelen.filter((dd, ii) => !dd.id && ii < idx).length === i - doelen.filter(d2 => d2.id).length)
        if (ng && origIdx >= 0) nieuweDoelen[origIdx] = { ...nieuweDoelen[origIdx], id: ng.id }
      }
    }
    setDoelen([...nieuweDoelen.filter(d => d.tekst.trim() || !d.id), leegDoel()])
    setSaving(false); setOpgeslagen(true); setTimeout(() => setOpgeslagen(false), 2500)
  }

  function verwijderDoel(i: number) {
    setDoelen(p => {
      const doel = p[i]
      if (doel.id) setTeVerwijderen(tv => [...tv, doel.id!])
      return p.filter((_, idx) => idx !== i)
    })
  }

  async function kopieerVorigeWeek() {
    setKopieren(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setKopieren(false); return }
    const vorigeWeekStart = new Date(weekStart); vorigeWeekStart.setDate(vorigeWeekStart.getDate() - 7)
    const { data: vwp } = await supabase.from('week_plans')
      .select('id, day_plans(day_of_week, is_working, start_time, end_time)')
      .eq('user_id', user.id).eq('week_start', formatDate(vorigeWeekStart)).maybeSingle()
    if (vwp?.day_plans?.length) {
      const nd = standaard()
      for (const dp of vwp.day_plans as { day_of_week: number; is_working: boolean; start_time: string | null; end_time: string | null }[]) {
        nd[dp.day_of_week] = { isWorking: dp.is_working, startTime: dp.start_time?.slice(0, 5) ?? '09:00', endTime: dp.end_time?.slice(0, 5) ?? '17:00' }
      }
      setDagen(nd)
    }
    if (vwp?.id) {
      const { data: vgoals } = await supabase.from('week_goals')
        .select('goal_text, client_id').eq('week_plan_id', vwp.id).order('sort_order')
      if (vgoals?.length) {
        const gekopieerd = vgoals.map(g => ({ id: null, tekst: g.goal_text, clientId: g.client_id ?? null, voltooid: false }))
        setDoelen([...gekopieerd, leegDoel()])
        setTeVerwijderen([])
      }
    }
    setKopieren(false)
  }

  function updDoel(i: number, patch: Partial<WeekDoel>) {
    setDoelen(p => {
      const n = p.map((d, idx) => idx === i ? { ...d, ...patch } : d)
      // Voeg lege rij toe als laatste rij gevuld wordt
      if (i === p.length - 1 && patch.tekst?.trim()) n.push(leegDoel())
      return n
    })
  }

  function updDag(i: number, u: Partial<DagState>) {
    setDagen(p => p.map((d, idx) => idx === i ? { ...d, ...u } : d))
  }

  const totaal  = dagen.reduce((s, d) => s + (d.isWorking ? berekenUren(d.startTime, d.endTime) : 0), 0)
  const opKoers = Math.abs(totaal - contractUren) <= 0.5
  function nav(dir: -1 | 1) { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(d) }
  function weekLabel() {
    const e = new Date(weekStart); e.setDate(e.getDate() + 6)
    const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
    return `${weekStart.toLocaleDateString('nl-NL', o)} – ${e.toLocaleDateString('nl-NL', o)}`
  }
  function dagDatum(i: number) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  }

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-dark tracking-tight">Weekplanning</h1>
        <div className="flex items-center gap-2">
          <button onClick={kopieerVorigeWeek} disabled={kopieren}
            className="text-xs text-muted border border-black/20 rounded-full px-3 py-1.5 hover:text-dark hover:border-dark/40 disabled:opacity-40 transition-all duration-150">
            {kopieren ? '…' : 'Kopieer vorige week'}
          </button>
          <div className="flex items-center gap-1 bg-light rounded-full border border-black/20 px-1 py-1">
            <button onClick={() => nav(-1)} className="p-1.5 rounded-full text-muted hover:text-dark hover:bg-grey transition-colors">←</button>
            <span className="text-xs font-medium text-dark px-2 min-w-44 text-center">{weekLabel()}</span>
            <button onClick={() => nav(1)} className="p-1.5 rounded-full text-muted hover:text-dark hover:bg-grey transition-colors">→</button>
          </div>
        </div>
      </div>

      {/* ── Werkschema ── */}
      <h2 className="text-sm font-medium text-dark mb-2">Werkschema</h2>
      <div className="bg-light rounded-2xl border border-black/20 overflow-hidden mb-6">
        {DAGEN.map((naam, i) => {
          const dag  = dagen[i]
          const uren = dag.isWorking ? berekenUren(dag.startTime, dag.endTime) : 0
          return (
            <div key={i} className={`flex items-center gap-3 px-5 py-3.5 flex-wrap ${i < 6 ? 'border-b border-black/10' : ''} ${dag.isWorking ? '' : 'bg-grey/30'}`}>
              <input type="checkbox" checked={dag.isWorking} onChange={e => updDag(i, { isWorking: e.target.checked })}
                className="h-4 w-4 rounded accent-dark shrink-0" />
              <span className={`w-20 text-sm font-medium ${dag.isWorking ? 'text-dark' : 'text-muted'}`}>{naam}</span>
              <span className="text-xs text-muted w-16">{dagDatum(i)}</span>
              {dag.isWorking && (
                <div className="flex items-center gap-2 ml-auto">
                  <input type="time" value={dag.startTime} onChange={e => updDag(i, { startTime: e.target.value })}
                    className="text-sm border border-black/20 rounded-lg px-2 py-1 text-dark bg-cream focus:outline-none focus:border-dark/40" />
                  <span className="text-muted text-xs">–</span>
                  <input type="time" value={dag.endTime} onChange={e => updDag(i, { endTime: e.target.value })}
                    className="text-sm border border-black/20 rounded-lg px-2 py-1 text-dark bg-cream focus:outline-none focus:border-dark/40" />
                  <span className="text-xs text-muted w-10 text-right">{uren.toFixed(1)}u</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Totaal */}
      <div className={`rounded-2xl border px-5 py-4 mb-6 flex items-center justify-between ${opKoers ? 'bg-brand/10 border-brand/40' : 'bg-orange-50 border-orange-200'}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark">{totaal.toFixed(1)} uur ingepland</span>
          {opKoers && <span className="text-xs bg-brand text-dark px-2.5 py-0.5 rounded-full font-medium">Op koers</span>}
        </div>
        <span className={`text-sm ${opKoers ? 'text-muted' : 'text-orange-700'}`}>
          Contract {contractUren}u{!opKoers && ` (${totaal > contractUren ? '+' : ''}${(totaal - contractUren).toFixed(1)}u)`}
        </span>
      </div>

      {/* ── Weekdoelen ── */}
      <h2 className="text-sm font-medium text-dark mb-2">Taken / doelen deze week</h2>
      <p className="text-xs text-muted mb-3">Wat wil je deze week oppakken? Je kunt deze selecteren bij je dagelijkse taken.</p>
      <div className="bg-light rounded-2xl border border-black/20 overflow-hidden mb-4">
        {doelen.map((doel, i) => (
          <div key={i} className={`group flex items-center gap-2 px-4 py-3 ${doel.voltooid ? 'bg-brand/10' : ''} ${i < doelen.length - 1 ? 'border-b border-black/10' : ''}`}>
            <span className={`text-xs w-4 shrink-0 text-right font-medium ${doel.voltooid ? 'text-brand-600' : 'text-muted'}`}>
              {doel.voltooid ? '✓' : i + 1}
            </span>
            <input
              type="text"
              value={doel.tekst}
              onChange={e => updDoel(i, { tekst: e.target.value })}
              placeholder={i === 0 ? 'Bijv. Offerte uitwerken voor klant X' : `Doel ${i + 1}`}
              className={`flex-1 text-sm focus:outline-none bg-transparent ${doel.voltooid ? 'line-through text-muted' : 'text-dark placeholder-muted/40'}`}
            />
            <select
              value={doel.clientId ?? ''}
              onChange={e => updDoel(i, { clientId: e.target.value || null })}
              className="text-xs border border-black/20 rounded-lg px-2 py-1 text-muted bg-cream focus:outline-none focus:border-dark/30 transition-colors shrink-0 max-w-28">
              <option value="">Klant</option>
              {klanten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            {doel.tekst.trim() && (
              <button onClick={() => verwijderDoel(i)}
                className="text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0 text-sm leading-none">
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={slaOp} disabled={saving}
        className={`w-full py-3 rounded-full text-sm font-medium border transition-all duration-150 ${
          opgeslagen
            ? 'bg-brand text-dark border-brand'
            : 'bg-brand text-dark border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-50'
        }`}>
        {saving ? 'Opslaan…' : opgeslagen ? '✓ Opgeslagen' : 'Planning opslaan'}
      </button>
    </div>
  )
}
