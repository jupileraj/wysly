'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maakGebruikerAan, updateGebruiker, laadAdminWeekData } from './actions'
import Avatar from '../Avatar'
import LogboekPage from '../logboek/page'

const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

type Profiel      = { id: string; name: string; contract_hours: number; role: string; avatar_url: string | null }
type Review       = { completed: boolean; reason: string | null }
type Taak         = { id: string; task_text: string; sort_order: number; client_id: string | null; task_reviews: Review[] }
type DayPlan      = { id: string; day_of_week: number; is_working: boolean; start_time: string | null; end_time: string | null; help_text: string | null; tasks: Taak[] }
type WeekPlan     = { id: string; user_id: string; week_start: string; day_plans: DayPlan[] }
type Client       = { id: string; name: string }
type WeekGoalStatus = { id: string; goal_text: string; client_id: string | null; voltooid: boolean; userId: string }

function getMaandag(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const day = r.getDay(); r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day)); return r
}
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function berekenUren(s: string | null, e: string | null): number {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60)
}
function weekLabel(ma: Date): string {
  const zo = new Date(ma); zo.setDate(zo.getDate() + 6)
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  return `${ma.toLocaleDateString('nl-NL', o)} – ${zo.toLocaleDateString('nl-NL', o)}`
}

export default function AdminPage() {
  const supabase = createClient()
  const [profielen,   setProfielen]   = useState<Profiel[]>([])
  const [weekplannen, setWeekplannen] = useState<WeekPlan[]>([])
  const [klanten,     setKlanten]     = useState<Client[]>([])
  const [week,        setWeek]        = useState<Date>(() => getMaandag(new Date()))
  const [filter,      setFilter]      = useState('alle')
  const [open,        setOpen]        = useState<Record<string, boolean>>({})
  const [loading,     setLoading]     = useState(true)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [view,        setView]        = useState<'overzicht' | 'gebruikers' | 'weekdoelen' | 'logboek'>('overzicht')
  const [weekGoals,   setWeekGoals]   = useState<WeekGoalStatus[]>([])
  const [logboekUser, setLogboekUser] = useState<string>('')

  // Medewerker bewerken
  const [editId,      setEditId]      = useState<string | null>(null)
  const [editNaam,    setEditNaam]    = useState('')
  const [editRol,     setEditRol]     = useState('employee')
  const [editUren,    setEditUren]    = useState('40')
  const [editSaving,  setEditSaving]  = useState(false)
  const [editBericht, setEditBericht] = useState<string | null>(null)

  // Gebruiker aanmaken form
  const [ngNaam,      setNgNaam]      = useState('')
  const [ngEmail,     setNgEmail]     = useState('')
  const [ngWw,        setNgWw]        = useState('')
  const [ngRol,       setNgRol]       = useState('employee')
  const [ngUren,      setNgUren]      = useState('40')
  const [ngSaving,    setNgSaving]    = useState(false)
  const [ngBericht,   setNgBericht]   = useState<{ ok?: boolean; tekst: string } | null>(null)

  const laadWeekData = useCallback(async (ws: string) => {
    const res = await laadAdminWeekData(ws)
    if ('error' in res && res.error) return
    setWeekplannen((res.weekplannen as WeekPlan[]) ?? [])
    setWeekGoals(res.weekGoals ?? [])
  }, [])

  const laad = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { data: ep } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (ep?.role !== 'admin') { setIsAdmin(false); setLoading(false); return }
    setIsAdmin(true)
    const [{ data: pros }, { data: kl }] = await Promise.all([
      supabase.from('profiles').select('id,name,contract_hours,role,avatar_url').order('name'),
      supabase.from('clients').select('id, name').order('name'),
    ])
    setProfielen(pros ?? [])
    setKlanten(kl ?? [])
    await laadWeekData(formatDate(getMaandag(new Date())))
    setLoading(false)
  }, [laadWeekData])

  useEffect(() => { laad() }, [laad])

  async function navWeek(dir: -1 | 1) {
    const d = new Date(week); d.setDate(d.getDate() + dir * 7)
    setWeek(d); await laadWeekData(formatDate(d))
  }

  async function maakGebruiker(e: React.FormEvent) {
    e.preventDefault(); setNgSaving(true); setNgBericht(null)
    const fd = new FormData()
    fd.set('name', ngNaam); fd.set('email', ngEmail); fd.set('password', ngWw)
    fd.set('role', ngRol); fd.set('contract_hours', ngUren)
    const res = await maakGebruikerAan(fd)
    if (res.error) {
      setNgBericht({ tekst: res.error })
    } else {
      setNgBericht({ ok: true, tekst: 'Account aangemaakt.' })
      setNgNaam(''); setNgEmail(''); setNgWw(''); setNgRol('employee'); setNgUren('40')
      await laad()
    }
    setNgSaving(false)
  }

  function startEdit(p: Profiel) {
    setEditId(p.id); setEditNaam(p.name); setEditRol(p.role); setEditUren(String(p.contract_hours)); setEditBericht(null)
  }

  async function slaEditOp() {
    if (!editId) return
    setEditSaving(true); setEditBericht(null)
    const res = await updateGebruiker(editId, { name: editNaam, role: editRol, contract_hours: parseFloat(editUren) || 40 })
    if (res.error) { setEditBericht(res.error) }
    else { setEditId(null); await laad() }
    setEditSaving(false)
  }

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>
  if (!isAdmin) return <div className="text-center py-16 text-muted text-sm">Geen toegang.</div>

  const clientMap = Object.fromEntries(klanten.map(k => [k.id, k.name]))
  const medewerkers = profielen.filter(p => filter === 'alle' || p.id === filter)

  // Hulpverzoeken voor deze week
  const hulpVerzoeken = weekplannen.flatMap(wp => {
    const profiel = profielen.find(p => p.id === wp.user_id)
    return (wp.day_plans ?? [])
      .filter(d => d.help_text)
      .map(d => ({ naam: profiel?.name ?? '?', dag: DAGEN[d.day_of_week], tekst: d.help_text! }))
  })

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium text-dark tracking-tight">Admin</h1>
          <div className="flex items-center gap-1 bg-light rounded-full border border-black/20 p-1">
            <button onClick={() => setView('overzicht')}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${view === 'overzicht' ? 'bg-dark text-brand' : 'text-muted hover:text-dark'}`}>
              Weekoverzicht
            </button>
            <button onClick={() => setView('weekdoelen')}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${view === 'weekdoelen' ? 'bg-dark text-brand' : 'text-muted hover:text-dark'}`}>
              Weekdoelen
            </button>
            <button onClick={() => { setView('logboek'); if (!logboekUser && profielen[0]) setLogboekUser(profielen[0].id) }}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${view === 'logboek' ? 'bg-dark text-brand' : 'text-muted hover:text-dark'}`}>
              Logboek
            </button>
            <button onClick={() => setView('gebruikers')}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${view === 'gebruikers' ? 'bg-dark text-brand' : 'text-muted hover:text-dark'}`}>
              Gebruikers
            </button>
          </div>
        </div>
        {(view === 'overzicht' || view === 'weekdoelen') && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="text-sm border border-black/20 rounded-full px-4 py-1.5 text-dark bg-light focus:outline-none hover:border-dark/40 transition-colors">
              <option value="alle">Alle gebruikers</option>
              {profielen.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-light rounded-full border border-black/20 px-1 py-1">
              <button onClick={() => navWeek(-1)} className="p-1.5 rounded-full text-muted hover:text-dark hover:bg-grey transition-colors">←</button>
              <span className="text-xs font-medium text-dark px-2 min-w-44 text-center">{weekLabel(week)}</span>
              <button onClick={() => navWeek(1)} className="p-1.5 rounded-full text-muted hover:text-dark hover:bg-grey transition-colors">→</button>
            </div>
          </div>
        )}
        {view === 'logboek' && (
          <select value={logboekUser} onChange={e => setLogboekUser(e.target.value)}
            className="text-sm border border-black/20 rounded-full px-4 py-1.5 text-dark bg-light focus:outline-none hover:border-dark/40 transition-colors">
            {profielen.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* ── Logboek medewerker ── */}
      {view === 'logboek' && logboekUser && (
        <LogboekPage userId={logboekUser} />
      )}
      {view === 'logboek' && !logboekUser && (
        <div className="text-center py-16 text-muted text-sm">Selecteer een medewerker hierboven.</div>
      )}

      {/* ── Gebruikers aanmaken ── */}
      {view === 'gebruikers' && (
        <div className="space-y-6">
          <div className="bg-light rounded-2xl border border-black/20 px-6 py-6">
            <h2 className="text-base font-medium text-dark tracking-tight mb-4">Nieuw account aanmaken</h2>
            <form onSubmit={maakGebruiker} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Naam</label>
                  <input type="text" value={ngNaam} onChange={e => setNgNaam(e.target.value)} required
                    className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">E-mailadres</label>
                  <input type="email" value={ngEmail} onChange={e => setNgEmail(e.target.value)} required
                    className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Wachtwoord</label>
                  <input type="password" value={ngWw} onChange={e => setNgWw(e.target.value)} required minLength={8}
                    className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Contracturen / week</label>
                  <input type="number" value={ngUren} onChange={e => setNgUren(e.target.value)} min="0" step="0.5"
                    className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Rol</label>
                <div className="flex gap-2">
                  {(['employee', 'admin'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setNgRol(r)}
                      className={`px-4 py-2 text-sm font-medium rounded-full border transition-all duration-150 ${ngRol === r ? 'bg-dark text-brand border-dark' : 'bg-transparent text-muted border-black/20 hover:border-dark/40 hover:text-dark'}`}>
                      {r === 'employee' ? 'Medewerker' : 'Admin'}
                    </button>
                  ))}
                </div>
              </div>
              {ngBericht && (
                <p className={`text-sm ${ngBericht.ok ? 'text-brand-600' : 'text-red-500'}`}>{ngBericht.tekst}</p>
              )}
              <button type="submit" disabled={ngSaving}
                className="w-full py-3 rounded-full text-sm font-medium border bg-brand text-dark border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-50 transition-all duration-150">
                {ngSaving ? 'Aanmaken…' : 'Account aanmaken'}
              </button>
            </form>
          </div>

          {/* Bestaande gebruikers */}
          <div>
            <h2 className="text-base font-medium text-dark tracking-tight mb-3">Alle gebruikers</h2>
            <div className="bg-light rounded-2xl border border-black/20 overflow-hidden">
              {profielen.length === 0 && <p className="px-5 py-4 text-sm text-muted italic">Geen gebruikers gevonden.</p>}
              {profielen.map((p, i) => (
                <div key={p.id} className={`${i < profielen.length - 1 ? 'border-b border-black/10' : ''}`}>
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} avatarUrl={p.avatar_url} />
                      <div>
                        <p className="text-sm font-medium text-dark">{p.name}</p>
                        <p className="text-xs text-muted">{p.role === 'admin' ? 'Admin' : 'Medewerker'} · {p.contract_hours}u/week</p>
                      </div>
                    </div>
                    <button onClick={() => editId === p.id ? setEditId(null) : startEdit(p)}
                      className="text-xs text-muted hover:text-dark border border-black/20 hover:border-dark/40 rounded-full px-3 py-1 transition-all duration-150">
                      {editId === p.id ? 'Annuleren' : 'Bewerken'}
                    </button>
                  </div>
                  {editId === p.id && (
                    <div className="px-5 pb-4 bg-grey/20 border-t border-black/10">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                        <div>
                          <label className="block text-xs text-muted mb-1">Naam</label>
                          <input type="text" value={editNaam} onChange={e => setEditNaam(e.target.value)}
                            className="w-full border border-black/20 rounded-xl px-3 py-2 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Contracturen</label>
                          <input type="number" value={editUren} onChange={e => setEditUren(e.target.value)} min="0" step="0.5"
                            className="w-full border border-black/20 rounded-xl px-3 py-2 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Rol</label>
                          <div className="flex gap-2 mt-1">
                            {(['employee', 'admin'] as const).map(r => (
                              <button key={r} type="button" onClick={() => setEditRol(r)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 ${editRol === r ? 'bg-dark text-brand border-dark' : 'bg-transparent text-muted border-black/20 hover:border-dark/40'}`}>
                                {r === 'employee' ? 'Medewerker' : 'Admin'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {editBericht && <p className="text-xs text-red-500 mt-2">{editBericht}</p>}
                      <button onClick={slaEditOp} disabled={editSaving || !editNaam.trim()}
                        className="mt-3 px-5 py-2 bg-brand text-dark text-sm font-medium rounded-full border border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-50 transition-all duration-150">
                        {editSaving ? 'Opslaan…' : 'Opslaan'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Weekdoelen overzicht ── */}
      {view === 'weekdoelen' && (
        <div className="space-y-3">
          {medewerkers.map(profiel => {
            const doelen = weekGoals.filter(g => g.userId === profiel.id)
            if (doelen.length === 0) return (
              <div key={profiel.id} className="bg-light rounded-2xl border border-black/20 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={profiel.name} avatarUrl={profiel.avatar_url} />
                  <p className="text-sm font-medium text-dark">{profiel.name}</p>
                </div>
                <span className="text-xs text-muted bg-grey px-2.5 py-1 rounded-full">Geen weekdoelen</span>
              </div>
            )
            const nOpen     = doelen.filter(d => !d.voltooid).length
            const nVoltooid = doelen.filter(d => d.voltooid).length
            return (
              <div key={profiel.id} className="bg-light rounded-2xl border border-black/20 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-dark text-brand text-sm font-medium flex items-center justify-center shrink-0">
                      {profiel.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm font-medium text-dark">{profiel.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    {nVoltooid > 0 && <span className="bg-brand/20 text-dark px-2.5 py-0.5 rounded-full font-medium">{nVoltooid} ✓</span>}
                    {nOpen     > 0 && <span className="bg-grey text-muted px-2.5 py-0.5 rounded-full font-medium">{nOpen} open</span>}
                  </div>
                </div>
                <ul className="border-t border-black/10 divide-y divide-black/10">
                  {doelen.map(doel => (
                    <li key={doel.id} className={`flex items-center gap-2.5 px-5 py-3 ${doel.voltooid ? 'bg-brand/10' : ''}`}>
                      <span className={`text-xs font-medium w-4 shrink-0 ${doel.voltooid ? 'text-brand-600' : 'text-black/20'}`}>
                        {doel.voltooid ? '✓' : '○'}
                      </span>
                      <span className={`flex-1 text-sm ${doel.voltooid ? 'line-through text-muted' : 'text-dark'}`}>{doel.goal_text}</span>
                      {doel.client_id && clientMap[doel.client_id] && (
                        <span className="text-xs bg-dark text-brand px-2 py-0.5 rounded-full font-medium shrink-0">{clientMap[doel.client_id]}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {medewerkers.length === 0 && <div className="text-center py-12 text-muted text-sm">Geen medewerkers gevonden.</div>}
        </div>
      )}

      {/* ── Hulpverzoeken banner ── */}
      {view === 'overzicht' && hulpVerzoeken.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 mb-5 space-y-2">
          <p className="text-xs font-medium text-orange-600 uppercase tracking-wider">Hulpverzoeken deze week</p>
          {hulpVerzoeken.map((h, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="font-medium text-orange-900 shrink-0">{h.naam} ({h.dag}):</span>
              <span className="text-orange-800">{h.tekst}</span>
            </div>
          ))}
        </div>
      )}

      {/* Medewerker kaarten */}
      {view === 'overzicht' && <div className="space-y-3">
        {medewerkers.map(profiel => {
          const wp      = weekplannen.find(w => w.user_id === profiel.id)
          const dps     = wp?.day_plans ?? []
          const totaal  = dps.reduce((s, d) => s + (d.is_working ? berekenUren(d.start_time, d.end_time) : 0), 0)
          const opKoers = Math.abs(totaal - profiel.contract_hours) <= 0.5
          const heeftPlan = dps.some(d => d.is_working)
          const heeftHulp = dps.some(d => d.help_text)

          return (
            <div key={profiel.id} className="bg-light rounded-2xl border border-black/20 overflow-hidden">
              <button onClick={() => setOpen(p => ({ ...p, [profiel.id]: !p[profiel.id] }))}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-grey/40 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <Avatar name={profiel.name} avatarUrl={profiel.avatar_url} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-dark">{profiel.name}</p>
                      {heeftHulp && <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">Hulp nodig</span>}
                    </div>
                    <p className="text-xs text-muted">{profiel.contract_hours}u/week</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {heeftPlan ? (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${opKoers ? 'bg-brand/20 text-dark' : 'bg-orange-100 text-orange-700'}`}>
                      {totaal.toFixed(1)}u / {profiel.contract_hours}u
                    </span>
                  ) : (
                    <span className="text-xs text-muted bg-grey px-2.5 py-1 rounded-full">Geen planning</span>
                  )}
                  <span className="text-muted text-sm">{open[profiel.id] ? '▲' : '▼'}</span>
                </div>
              </button>

              {open[profiel.id] && (
                <div className="border-t border-black/10 divide-y divide-black/10">
                  {dps.length === 0 && <p className="px-5 py-4 text-sm text-muted italic">Geen weekplanning ingevuld.</p>}
                  {DAGEN.map((_, i) => {
                    const dp = dps.find(d => d.day_of_week === i); if (!dp?.is_working) return null
                    const uren  = berekenUren(dp.start_time, dp.end_time)
                    const taken = [...(dp.tasks ?? [])].sort((a, b) => a.sort_order - b.sort_order)
                    return (
                      <div key={i} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-medium text-muted uppercase tracking-wider">{DAGEN[i]}</p>
                          <span className="text-xs text-muted">{dp.start_time?.slice(0, 5)} – {dp.end_time?.slice(0, 5)} ({uren.toFixed(1)}u)</span>
                        </div>

                        {/* Hulpvraag voor deze dag */}
                        {dp.help_text && (
                          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3">
                            <p className="text-xs font-medium text-orange-600 mb-0.5">Hulpvraag</p>
                            <p className="text-xs text-orange-800">{dp.help_text}</p>
                          </div>
                        )}

                        {taken.length > 0 ? (
                          <ul className="space-y-2">
                            {taken.map(taak => {
                              const rev = taak.task_reviews?.[0]
                              return (
                                <li key={taak.id} className="flex items-start gap-2.5">
                                  <span className={`text-xs font-medium mt-0.5 shrink-0 w-4 ${rev?.completed === true ? 'text-brand-600' : rev?.completed === false ? 'text-red-400' : 'text-black/20'}`}>
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
                        ) : (
                          <p className="text-xs text-muted italic">Geen taken ingevoerd</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {medewerkers.length === 0 && <div className="text-center py-12 text-muted text-sm">Geen medewerkers gevonden.</div>}
      </div>}
    </div>
  )
}
