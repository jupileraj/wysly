'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { laadTeamVandaag, type CollegaVandaag } from './actions'
import Avatar from '../Avatar'

type Review    = { completed: boolean; reason: string | null }
type Taak      = { id: string; task_text: string; sort_order: number; clientNaam?: string | null; review: Review | null }
type WeekDoel  = { id: string; goal_text: string; clientNaam: string | null }
type TeamLid   = { id: string; name: string; gisterenLabel: string; taken: Taak[]; reviews: Record<string, { completed: boolean | null; reason: string }>; savingR: Record<string, boolean> }

function getMaandag(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const day = r.getDay(); r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day)); return r
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function dagIdx(d: Date): number { const day = d.getDay(); return day === 0 ? 6 : day - 1 }
function vorigeWerkdag(d: Date): Date {
  const r = new Date(d); r.setDate(r.getDate() - 1)
  while (r.getDay() === 0 || r.getDay() === 6) r.setDate(r.getDate() - 1); return r
}
function groet(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

async function laadGisterenTaken(supabase: ReturnType<typeof createClient>, userId: string) {
  const vandaag = new Date()
  const gisteren = vorigeWerkdag(vandaag)

  const { data: gWp } = await supabase.from('week_plans')
    .select('id').eq('user_id', userId).eq('week_start', formatDate(getMaandag(gisteren))).maybeSingle()
  if (!gWp) return { taken: [], helpTekst: null, label: gisteren.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) }

  const { data: gDp } = await supabase.from('day_plans')
    .select('id, help_text').eq('week_plan_id', gWp.id).eq('day_of_week', dagIdx(gisteren)).maybeSingle()
  if (!gDp) return { taken: [], helpTekst: null, label: gisteren.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) }

  const { data: gt } = await supabase.from('tasks')
    .select('id, task_text, sort_order, client_id, clients(name)')
    .eq('day_plan_id', gDp.id).order('sort_order')

  const taakIds = (gt ?? []).map(t => t.id)
  const { data: revData } = taakIds.length > 0
    ? await supabase.from('task_reviews').select('task_id, completed, reason').in('task_id', taakIds)
    : { data: [] }
  const revMap = Object.fromEntries((revData ?? []).map(r => [r.task_id, r]))

  const taken: Taak[] = (gt ?? []).map(t => ({
    id: t.id, task_text: t.task_text, sort_order: t.sort_order,
    clientNaam: Array.isArray(t.clients) ? (t.clients[0] as { name: string })?.name ?? null : (t.clients as { name: string } | null)?.name ?? null,
    review: revMap[t.id] ? { completed: revMap[t.id].completed, reason: revMap[t.id].reason ?? null } : null,
  }))

  return { taken, helpTekst: gDp.help_text ?? null, label: gisteren.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) }
}

export default function DashboardPage() {
  const supabase = createClient()

  const [naam,          setNaam]          = useState('')
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [gisteren,      setGisteren]      = useState<Taak[]>([])
  const [gisterenLabel, setGisterenLabel] = useState('')
  const [helpTekst,     setHelpTekst]     = useState<string | null>(null)
  const [reviews,       setReviews]       = useState<Record<string, { completed: boolean | null; reason: string }>>({})
  const [savingR,       setSavingR]       = useState<Record<string, boolean>>({})
  const [weekDoelen,    setWeekDoelen]    = useState<WeekDoel[]>([])
  const [score,         setScore]         = useState<number | null>(null)
  const [scoreTotal,    setScoreTotal]    = useState(0)
  const [scoreOk,       setScoreOk]       = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [vandaagTaken,  setVandaagTaken]  = useState(false)
  const [groetTekst,    setGroetTekst]    = useState('')
  const [datumLabel,    setDatumLabel]    = useState('')
  const [team,          setTeam]          = useState<TeamLid[]>([])
  const [teamOpen,      setTeamOpen]      = useState<Record<string, boolean>>({})
  const [collega,       setCollega]       = useState<CollegaVandaag[]>([])
  const [collegaPopup,  setCollegaPopup]  = useState<CollegaVandaag | null>(null)

  useEffect(() => {
    setGroetTekst(groet())
    setDatumLabel(new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))
  }, [])

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return

    const { data: profiel } = await supabase.from('profiles').select('name, role').eq('id', user.id).single()
    setNaam(profiel?.name ?? '')
    const admin = profiel?.role === 'admin'
    setIsAdmin(admin)

    // ── Eigen gisteren ──
    const { taken, helpTekst: ht, label } = await laadGisterenTaken(supabase, user.id)
    setGisteren(taken)
    setGisterenLabel(label)
    setHelpTekst(ht)
    const init: Record<string, { completed: boolean | null; reason: string }> = {}
    for (const t of taken) init[t.id] = { completed: t.review?.completed ?? null, reason: t.review?.reason ?? '' }
    setReviews(init)

    // ── Weekdoelen + vandaag check ──
    const vandaag = new Date()
    const { data: vWp } = await supabase.from('week_plans')
      .select('id').eq('user_id', user.id).eq('week_start', formatDate(getMaandag(vandaag))).maybeSingle()
    if (vWp) {
      const { data: goals } = await supabase.from('week_goals')
        .select('id, goal_text, client_id, clients(name)').eq('week_plan_id', vWp.id).order('sort_order')
      if (goals) {
        setWeekDoelen(goals.map(g => ({
          id: g.id, goal_text: g.goal_text,
          clientNaam: Array.isArray(g.clients) ? (g.clients[0] as { name: string })?.name ?? null : (g.clients as { name: string } | null)?.name ?? null,
        })))
      }
      const { data: vDp } = await supabase.from('day_plans')
        .select('id').eq('week_plan_id', vWp.id).eq('day_of_week', dagIdx(vandaag)).maybeSingle()
      if (vDp) {
        const { count } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('day_plan_id', vDp.id)
        setVandaagTaken((count ?? 0) > 0)
      }
    }

    // ── Maandscore ──
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    const { data: maandData } = await supabase.from('week_plans')
      .select('week_start, day_plans(is_working, tasks(task_reviews(completed)))')
      .eq('user_id', user.id).gte('week_start', formatDate(getMaandag(cutoff)))
    if (maandData) {
      const alleReviews = (maandData as { day_plans: { is_working: boolean; tasks: { task_reviews: { completed: boolean }[] }[] }[] }[])
        .flatMap(w => w.day_plans?.filter(d => d.is_working).flatMap(d => d.tasks?.flatMap(t => t.task_reviews ?? []) ?? []) ?? [])
      const total = alleReviews.length; const ok = alleReviews.filter(r => r.completed).length
      setScoreTotal(total); setScoreOk(ok)
      setScore(total > 0 ? Math.round((ok / total) * 100) : null)
    }

    // ── Collega's vandaag (voor iedereen) ──
    const collegaData = await laadTeamVandaag()
    setCollega(collegaData)

    // ── Admin: teamoverzicht ──
    if (admin) {
      const { data: medewerkers } = await supabase.from('profiles')
        .select('id, name').eq('role', 'employee').order('name')

      if (medewerkers) {
        const teamData: TeamLid[] = []
        for (const m of medewerkers) {
          const { taken: mTaken, label: mLabel } = await laadGisterenTaken(supabase, m.id)
          const mInit: Record<string, { completed: boolean | null; reason: string }> = {}
          for (const t of mTaken) mInit[t.id] = { completed: t.review?.completed ?? null, reason: t.review?.reason ?? '' }
          teamData.push({ id: m.id, name: m.name, gisterenLabel: mLabel, taken: mTaken, reviews: mInit, savingR: {} })
        }
        setTeam(teamData)
      }
    }

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { laad() }, [laad])

  async function toggleReview(id: string, completed: boolean) {
    setReviews(p => ({ ...p, [id]: { ...p[id], completed } }))
    setSavingR(p => ({ ...p, [id]: true }))
    await supabase.from('task_reviews').upsert({ task_id: id, completed, reason: completed ? null : (reviews[id]?.reason ?? '') }, { onConflict: 'task_id' })
    const { data } = await supabase.from('task_reviews').select('completed, reason').eq('task_id', id).single()
    if (data) setReviews(p => ({ ...p, [id]: { completed: data.completed, reason: data.reason ?? '' } }))
    setSavingR(p => ({ ...p, [id]: false }))
  }

  async function updateReden(id: string, reason: string) {
    setReviews(p => ({ ...p, [id]: { ...p[id], reason } }))
    await supabase.from('task_reviews').upsert({ task_id: id, completed: false, reason }, { onConflict: 'task_id' })
  }

  async function toggleTeamReview(lidIdx: number, taskId: string, completed: boolean) {
    setTeam(p => p.map((l, i) => i !== lidIdx ? l : {
      ...l, savingR: { ...l.savingR, [taskId]: true },
      reviews: { ...l.reviews, [taskId]: { ...l.reviews[taskId], completed } }
    }))
    await supabase.from('task_reviews').upsert({ task_id: taskId, completed, reason: completed ? null : (team[lidIdx].reviews[taskId]?.reason ?? '') }, { onConflict: 'task_id' })
    const { data } = await supabase.from('task_reviews').select('completed, reason').eq('task_id', taskId).single()
    setTeam(p => p.map((l, i) => i !== lidIdx ? l : {
      ...l, savingR: { ...l.savingR, [taskId]: false },
      reviews: { ...l.reviews, [taskId]: { completed: data?.completed ?? completed, reason: data?.reason ?? '' } }
    }))
  }

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>

  const scoreKleur = score === null ? 'text-muted' : score >= 80 ? 'text-brand' : score >= 60 ? 'text-orange-500' : 'text-red-500'
  const gisterenOpenCount = gisteren.filter(t => reviews[t.id]?.completed === null).length

  function TerugblikKaart({ taken, revs, savs, onToggle, onReden }: {
    taken: Taak[]
    revs: Record<string, { completed: boolean | null; reason: string }>
    savs: Record<string, boolean>
    onToggle: (id: string, c: boolean) => void
    onReden: (id: string, r: string) => void
  }) {
    if (taken.length === 0) return (
      <div className="bg-light rounded-2xl border border-black/20 px-5 py-8 text-center">
        <p className="text-muted text-sm">Geen taken gevonden voor de vorige werkdag.</p>
      </div>
    )
    return (
      <div className="space-y-2">
        {taken.map(taak => {
          const rev = revs[taak.id]; const busy = savs[taak.id]
          const bg = rev?.completed === true ? 'bg-brand/15 border-brand/40' : rev?.completed === false ? 'bg-red-50 border-red-200' : 'bg-light border-black/20'
          return (
            <div key={taak.id} className={`rounded-2xl border p-4 transition-colors ${bg}`}>
              <div className="flex items-start gap-3">
                <div className="flex gap-1.5 shrink-0 mt-0.5">
                  <button onClick={() => onToggle(taak.id, true)} disabled={busy}
                    className={`w-8 h-8 rounded-full text-sm font-medium border transition-all duration-150 ${rev?.completed === true ? 'bg-brand text-dark border-brand' : 'bg-transparent text-muted border-black/20 hover:bg-brand hover:text-dark hover:border-brand'}`}>✓</button>
                  <button onClick={() => onToggle(taak.id, false)} disabled={busy}
                    className={`w-8 h-8 rounded-full text-sm font-medium border transition-all duration-150 ${rev?.completed === false ? 'bg-red-500 text-white border-red-500' : 'bg-transparent text-muted border-black/20 hover:bg-red-500 hover:text-white hover:border-red-500'}`}>✕</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${rev?.completed === true ? 'line-through text-muted' : 'text-dark'}`}>{taak.task_text}</p>
                    {taak.clientNaam && <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{taak.clientNaam}</span>}
                  </div>
                  {rev?.completed === false && (
                    <textarea value={rev.reason ?? ''} onChange={e => onReden(taak.id, e.target.value)}
                      placeholder="Wat is er misgegaan?" rows={2}
                      className="mt-2 w-full text-sm border border-red-200 rounded-xl px-3 py-2 text-dark placeholder-red-300 focus:outline-none focus:border-red-400 bg-white resize-none" />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Groet ── */}
      <div>
        <h1 className="text-2xl font-medium text-dark tracking-tight">{groetTekst}, {naam} 👋</h1>
        <p className="text-muted text-sm mt-0.5">{datumLabel}</p>
      </div>

      {/* ── Collega's aan het werk vandaag ── */}
      {collega.filter(c => c.isWorking).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted uppercase tracking-wider">Team vandaag</p>
            <p className="text-xs text-muted">
              <span className="inline-flex items-center gap-1"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#00a784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> dagplanning ingevuld</span>
              <span className="mx-2 text-black/20">·</span>
              <span className="inline-flex items-center gap-1"><span className="text-black/30">○</span> nog niet ingevuld</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {collega.filter(c => c.isWorking).map(c => (
              <button
                key={c.id}
                onClick={() => c.taken.length > 0 ? setCollegaPopup(c) : null}
                className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  c.taken.length > 0
                    ? 'bg-brand/15 border-brand/40 text-dark hover:bg-brand/25 cursor-pointer'
                    : 'bg-light border-black/20 text-muted cursor-default'
                }`}>
                <Avatar name={c.name} avatarUrl={c.avatarUrl} size="xs" />
                {c.name}
                {c.taken.length > 0
                  ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#00a784" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span className="text-black/25">○</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Blokkade: vink eerst gisteren af ── */}
      {gisterenOpenCount > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-2xl px-5 py-4 flex items-center gap-3">
          <span className="text-orange-500 text-lg shrink-0">⚠️</span>
          <p className="text-sm text-orange-900">Je hebt nog <strong>{gisterenOpenCount} tak{gisterenOpenCount === 1 ? '' : 'en'}</strong> van {gisterenLabel} niet beoordeeld. Vink ze hieronder af voordat je de taken van vandaag invult.</p>
        </div>
      )}

      {/* ── Score + CTA ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-dark rounded-2xl border border-white/10 px-5 py-5">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Taakscore afgelopen maand</p>
          {score !== null ? (
            <>
              <div className="flex items-end gap-2 mb-3">
                <span className={`text-5xl font-medium tracking-tight ${scoreKleur}`}>{score}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-2">
                <div className="h-1.5 rounded-full bg-brand transition-all duration-500" style={{ width: `${score}%` }} />
              </div>
              <p className="text-xs text-white/30">{scoreOk} van {scoreTotal} taken afgerond</p>
            </>
          ) : (
            <p className="text-white/30 text-sm">Nog geen reviews deze maand.</p>
          )}
        </div>

        <div className={`rounded-2xl border px-5 py-5 flex flex-col justify-between ${vandaagTaken ? 'bg-brand/10 border-brand/30' : 'bg-light border-black/20'}`}>
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Taken vandaag</p>
            <p className="text-sm text-dark">
              {vandaagTaken ? 'Je taken voor vandaag staan klaar.' : 'Je hebt nog geen taken ingevoerd voor vandaag.'}
            </p>
          </div>
          <Link href="/taken"
            className="mt-4 inline-block text-center py-2 px-5 bg-brand text-dark text-sm font-medium rounded-full border border-brand hover:bg-dark hover:text-white hover:border-dark transition-all duration-150 w-full">
            {vandaagTaken ? 'Taken bekijken' : 'Taken invoeren'}
          </Link>
        </div>
      </div>

      {/* ── Weekplanning + Terugblik naast elkaar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Weekplanning */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium text-dark tracking-tight">Weekplanning</h2>
            <Link href="/planning" className="text-xs text-muted hover:text-dark transition-colors">Bewerken →</Link>
          </div>
          {weekDoelen.length === 0 ? (
            <div className="bg-light rounded-2xl border border-black/20 px-5 py-8 text-center">
              <p className="text-muted text-sm">Nog geen weekdoelen ingevoerd.</p>
              <Link href="/planning" className="text-sm text-dark underline mt-1 inline-block">Planning invullen →</Link>
            </div>
          ) : (
            <div className="bg-light rounded-2xl border border-black/20 overflow-hidden">
              {weekDoelen.map((doel, i) => (
                <div key={doel.id} className={`flex items-center gap-3 px-5 py-3 ${i < weekDoelen.length - 1 ? 'border-b border-black/10' : ''}`}>
                  <span className="text-xs text-muted w-4 shrink-0 text-right">{i + 1}</span>
                  <span className="flex-1 text-sm text-dark">{doel.goal_text}</span>
                  {doel.clientNaam && <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{doel.clientNaam}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Terugblik eigen gisteren */}
        <section>
          <div className="mb-3">
            <h2 className="text-base font-medium text-dark tracking-tight">Terugblik</h2>
            {gisterenLabel && <p className="text-xs text-muted capitalize">{gisterenLabel}</p>}
          </div>
          {helpTekst && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 mb-3">
              <p className="text-xs font-medium text-orange-600 mb-0.5">Hulpvraag</p>
              <p className="text-sm text-orange-900">{helpTekst}</p>
            </div>
          )}
          <TerugblikKaart taken={gisteren} revs={reviews} savs={savingR} onToggle={toggleReview} onReden={updateReden} />
        </section>
      </div>

      {/* ── Collega's vandaag ── */}
      {collega.filter(c => c.isWorking).length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium text-dark tracking-tight">Taken collega's vandaag</h2>
            <span className="text-xs text-muted">{collega.filter(c => c.isWorking && c.taken.length > 0).length} van {collega.filter(c => c.isWorking).length} ingevuld</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {collega.filter(c => c.isWorking).map(c => (
              <div key={c.id} className={`rounded-2xl border overflow-hidden ${c.taken.length > 0 ? 'bg-light border-black/20' : 'bg-light border-black/10 opacity-60'}`}>
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-black/10">
                  <Avatar name={c.name} avatarUrl={c.avatarUrl} size="sm" />
                  <p className="text-sm font-medium text-dark flex-1">{c.name}</p>
                  {c.taken.length > 0
                    ? <span className="text-xs bg-brand/20 text-dark px-2 py-0.5 rounded-full font-medium flex items-center gap-1">Ingevuld <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                    : <span className="text-xs bg-grey text-muted px-2 py-0.5 rounded-full">Nog niet ingevuld</span>
                  }
                </div>
                {c.helpTekst && (
                  <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                    <p className="text-xs font-medium text-orange-600 mb-0.5">Hulpvraag</p>
                    <p className="text-xs text-orange-800">{c.helpTekst}</p>
                  </div>
                )}
                {c.taken.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted italic">Nog geen dagplanning ingevoerd.</p>
                ) : (
                  <ul className="px-5 py-3 space-y-2">
                    {c.taken.map(t => (
                      <li key={t.id} className="flex items-center gap-2">
                        <span className="text-black/20 text-xs shrink-0">○</span>
                        <span className="text-sm text-dark flex-1">{t.task_text}</span>
                        {t.clientNaam && <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{t.clientNaam}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Admin: teamoverzicht ── */}
      {isAdmin && team.length > 0 && (
        <section>
          <h2 className="text-base font-medium text-dark tracking-tight mb-3">Team — resultaten gisteren</h2>
          <div className="space-y-2">
            {team.map((lid, lidIdx) => {
              const open = teamOpen[lid.id]
              const nGelukt = lid.taken.filter(t => lid.reviews[t.id]?.completed === true).length
              const nNiet   = lid.taken.filter(t => lid.reviews[t.id]?.completed === false).length
              const nOpen   = lid.taken.filter(t => lid.reviews[t.id]?.completed === null).length
              return (
                <div key={lid.id} className="bg-light rounded-2xl border border-black/20 overflow-hidden">
                  <button onClick={() => setTeamOpen(p => ({ ...p, [lid.id]: !p[lid.id] }))}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-grey/40 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-dark text-brand text-sm font-medium flex items-center justify-center shrink-0">
                        {lid.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark">{lid.name}</p>
                        <p className="text-xs text-muted capitalize">{lid.gisterenLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      {lid.taken.length === 0 && <span className="text-muted">Geen taken</span>}
                      {nGelukt > 0 && <span className="bg-brand/20 text-dark px-2.5 py-0.5 rounded-full font-medium">{nGelukt} ✓</span>}
                      {nNiet   > 0 && <span className="bg-red-100 text-red-600 px-2.5 py-0.5 rounded-full font-medium">{nNiet} ✕</span>}
                      {nOpen   > 0 && <span className="bg-orange-100 text-orange-600 px-2.5 py-0.5 rounded-full font-medium">{nOpen} open</span>}
                      <Link href={`/logboek/${lid.id}`} onClick={e => e.stopPropagation()}
                        className="ml-2 text-xs text-muted hover:text-dark underline transition-colors">
                        Logboek →
                      </Link>
                      <span className="text-muted ml-1">{open ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-black/10 px-5 py-4">
                      <TerugblikKaart
                        taken={lid.taken}
                        revs={lid.reviews}
                        savs={lid.savingR}
                        onToggle={(id, c) => toggleTeamReview(lidIdx, id, c)}
                        onReden={(id, r) => setTeam(p => p.map((l, i) => i !== lidIdx ? l : { ...l, reviews: { ...l.reviews, [id]: { ...l.reviews[id], reason: r } } }))}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Popup: taken van collega ── */}
      {collegaPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setCollegaPopup(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-cream rounded-2xl border border-black/20 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-black/10">
              <Avatar name={collegaPopup.name} avatarUrl={collegaPopup.avatarUrl} size="sm" />
              <div className="flex-1">
                <p className="text-sm font-medium text-dark">{collegaPopup.name}</p>
                {collegaPopup.startTime && collegaPopup.endTime
                  ? <p className="text-xs text-muted">{collegaPopup.startTime} – {collegaPopup.endTime}</p>
                  : <p className="text-xs text-muted">Taken vandaag</p>
                }
              </div>
              <button onClick={() => setCollegaPopup(null)} className="text-muted hover:text-dark transition-colors text-lg leading-none">×</button>
            </div>
            {collegaPopup.helpTekst && (
              <div className="mx-4 mt-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                <p className="text-xs font-medium text-orange-600 mb-0.5">Hulpvraag</p>
                <p className="text-xs text-orange-800">{collegaPopup.helpTekst}</p>
              </div>
            )}
            <ul className="px-5 py-4 space-y-2.5">
              {collegaPopup.taken.map(t => (
                <li key={t.id} className="flex items-center gap-2.5">
                  <span className="text-black/20 text-xs shrink-0">○</span>
                  <span className="text-sm text-dark flex-1">{t.task_text}</span>
                  {t.clientNaam && <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{t.clientNaam}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
