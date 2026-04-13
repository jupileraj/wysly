'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { stuurSlackBericht } from './actions'

type Client   = { id: string; name: string }
type TaakRij  = { id: string | null; tekst: string; clientId: string | null; completed: boolean | null; reason: string; weekGoalId: string | null; leverage: 'high' | 'low' | null }
type WeekDoel = { id: string; goal_text: string; clientId: string | null }

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
function volgendeWerkdag(d: Date): Date {
  const r = new Date(d); r.setDate(r.getDate() + 1)
  while (r.getDay() === 0 || r.getDay() === 6) r.setDate(r.getDate() + 1); return r
}
function isVandaag(d: Date): boolean {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}
function isVerleden(d: Date): boolean {
  const t = new Date(); t.setHours(0, 0, 0, 0); return d < t
}

const legeRij = (): TaakRij => ({ id: null, tekst: '', clientId: null, completed: null, reason: '', weekGoalId: null, leverage: null })

export default function TakenPage() {
  const supabase = createClient()

  const [dag, setDag] = useState<Date>(() => {
    const v = new Date(); v.setHours(0, 0, 0, 0); return v
  })
  const [dpId,        setDpId]        = useState<string | null>(null)
  const [rijen,       setRijen]       = useState<TaakRij[]>(Array(5).fill(null).map(legeRij))
  const [helpText,    setHelpText]    = useState('')
  const [savingT,     setSavingT]     = useState(false)
  const [savedT,      setSavedT]      = useState(false)
  const [slackFout,   setSlackFout]   = useState<string | null>(null)
  const [savingR,     setSavingR]     = useState<Record<number, boolean>>({})
  const [klanten,     setKlanten]     = useState<Client[]>([])
  const [nieuweKlant, setNieuweKlant] = useState('')
  const [savingKlant, setSavingKlant] = useState(false)
  const [loading,         setLoading]         = useState(true)
  const [weekDoelen,      setWeekDoelen]      = useState<WeekDoel[]>([])
  const [openGisteren,    setOpenGisteren]    = useState(0)
  const [gisterenLabel,   setGisterenLabel]   = useState('')

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => setKlanten(data ?? []))

    // Laad het aantal niet-beoordeelde taken van de vorige werkdag
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) return
      const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
      const gisteren = vorigeWerkdag(vandaag)

      // Nieuwe accounts (aangemaakt vandaag of gisteren) niet blokkeren
      const accountAangemaakt = new Date(user.created_at)
      accountAangemaakt.setHours(0, 0, 0, 0)
      if (accountAangemaakt >= gisteren) return

      setGisterenLabel(gisteren.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))

      const { data: gWp } = await supabase.from('week_plans')
        .select('id').eq('user_id', user.id).eq('week_start', formatDate(getMaandag(gisteren))).maybeSingle()
      if (!gWp) return

      const { data: gDp } = await supabase.from('day_plans')
        .select('id').eq('week_plan_id', gWp.id).eq('day_of_week', dagIdx(gisteren)).maybeSingle()
      if (!gDp) return

      const { data: taken } = await supabase.from('tasks')
        .select('id').eq('day_plan_id', gDp.id)
      const taakIds = (taken ?? []).map(t => t.id)
      if (taakIds.length === 0) return
      const { data: reviews } = await supabase.from('task_reviews')
        .select('task_id').in('task_id', taakIds)
      const beoordeeld = new Set((reviews ?? []).map(r => r.task_id))
      setOpenGisteren(taakIds.filter(id => !beoordeeld.has(id)).length)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const laadDag = useCallback(async (d: Date) => {
    setLoading(true)
    setDpId(null); setRijen(Array(5).fill(null).map(legeRij)); setHelpText(''); setWeekDoelen([])

    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }

    const { data: wp } = await supabase.from('week_plans')
      .select('id').eq('user_id', user.id).eq('week_start', formatDate(getMaandag(d))).maybeSingle()

    if (wp) {
      // Weekdoelen voor deze week als suggesties
      const { data: goals } = await supabase.from('week_goals')
        .select('id, goal_text, client_id').eq('week_plan_id', wp.id).order('sort_order')
      setWeekDoelen(goals?.map(g => ({ id: g.id, goal_text: g.goal_text, clientId: g.client_id ?? null })) ?? [])

      const { data: dp } = await supabase.from('day_plans')
        .select('id, help_text').eq('week_plan_id', wp.id).eq('day_of_week', dagIdx(d)).maybeSingle()

      if (dp) {
        setDpId(dp.id)
        setHelpText(dp.help_text ?? '')

        const { data: taken } = await supabase.from('tasks')
          .select('id, task_text, sort_order, client_id, week_goal_id, leverage')
          .eq('day_plan_id', dp.id).order('sort_order')

        if (taken?.length) {
          // Reviews apart ophalen zodat RLS-embedding ze niet blokkeert
          const taakIds = taken.map(t => t.id)
          const { data: reviews } = await supabase.from('task_reviews')
            .select('task_id, completed, reason').in('task_id', taakIds)
          const revMap = Object.fromEntries((reviews ?? []).map(r => [r.task_id, r]))

          const mapped: TaakRij[] = taken.map(t => {
            const rev = revMap[t.id]
            return {
              id: t.id, tekst: t.task_text, clientId: t.client_id,
              completed: rev?.completed ?? null, reason: rev?.reason ?? '',
              weekGoalId: t.week_goal_id ?? null,
              leverage: (t.leverage as 'high' | 'low' | null) ?? null,
            }
          })
          while (mapped.length < 5) mapped.push(legeRij())
          setRijen(mapped)
        }
      }
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { laadDag(dag) }, [dag, laadDag])

  async function slaaTakenOp() {
    setSavingT(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSavingT(false); return }

    const { data: wp } = await supabase.from('week_plans')
      .upsert({ user_id: user.id, week_start: formatDate(getMaandag(dag)) }, { onConflict: 'user_id,week_start' })
      .select('id').single()
    if (!wp) { setSavingT(false); return }

    const { data: dp } = await supabase.from('day_plans')
      .upsert({ week_plan_id: wp.id, day_of_week: dagIdx(dag), is_working: true }, { onConflict: 'week_plan_id,day_of_week' })
      .select('id').single()
    if (!dp) { setSavingT(false); return }

    setDpId(dp.id)
    await supabase.from('day_plans').update({ help_text: helpText || null }).eq('id', dp.id)

    const nieuweRijen = [...rijen]
    for (let i = 0; i < rijen.length; i++) {
      const rij = rijen[i]; const t = rij.tekst.trim(); const cid = rij.clientId ?? null
      if (rij.id) {
        if (t) await supabase.from('tasks').update({ task_text: t, sort_order: i, client_id: cid, week_goal_id: rij.weekGoalId, leverage: rij.leverage }).eq('id', rij.id)
      } else if (t) {
        const { data: n } = await supabase.from('tasks')
          .insert({ day_plan_id: dp.id, task_text: t, sort_order: i, client_id: cid, week_goal_id: rij.weekGoalId, leverage: rij.leverage }).select('id').single()
        if (n) nieuweRijen[i] = { ...nieuweRijen[i], id: n.id }
      }
    }
    setRijen(nieuweRijen)
    setSavingT(false); setSavedT(true); setTimeout(() => setSavedT(false), 2500)

    // Slack-bericht sturen (niet-blokkerend)
    const takenVoorSlack = nieuweRijen
      .filter(r => r.tekst.trim() && r.id)
      .map(r => ({
        tekst: r.tekst,
        clientNaam: klanten.find(k => k.id === r.clientId)?.name ?? null,
      }))
    stuurSlackBericht(takenVoorSlack, helpText, dagLabel).then(res => {
      if (res.error) { setSlackFout(res.error); setTimeout(() => setSlackFout(null), 5000) }
    }).catch(() => {})
  }

  async function toggleReview(idx: number, completed: boolean) {
    const rij = rijen[idx]; if (!rij.id) return
    setSavingR(p => ({ ...p, [idx]: true }))
    setRijen(p => { const n = [...p]; n[idx] = { ...n[idx], completed }; return n })
    const { error } = await supabase.from('task_reviews').upsert(
      { task_id: rij.id, completed, reason: completed ? null : (rij.reason ?? '') },
      { onConflict: 'task_id' }
    )
    if (error) {
      console.error('toggleReview error:', error)
      setSavingR(p => ({ ...p, [idx]: false }))
      return
    }
    const { data } = await supabase.from('task_reviews').select('completed, reason').eq('task_id', rij.id).single()
    if (data) setRijen(p => { const n = [...p]; n[idx] = { ...n[idx], completed: data.completed, reason: data.reason ?? '' }; return n })
    setSavingR(p => ({ ...p, [idx]: false }))
  }

  async function updateReden(idx: number, reason: string) {
    const rij = rijen[idx]; if (!rij.id) return
    setRijen(p => { const n = [...p]; n[idx] = { ...n[idx], reason }; return n })
    await supabase.from('task_reviews').upsert({ task_id: rij.id, completed: false, reason }, { onConflict: 'task_id' })
  }

  async function voegKlantToe() {
    const naam = nieuweKlant.trim(); if (!naam) return
    setSavingKlant(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: nieuw } = await supabase.from('clients').insert({ name: naam, created_by: user?.id }).select('id, name').single()
    if (nieuw) { setKlanten(p => [...p, nieuw].sort((a, b) => a.name.localeCompare(b.name))); setNieuweKlant('') }
    setSavingKlant(false)
  }

  const vandaag    = isVandaag(dag)
  const verleden   = isVerleden(dag)
  const geblokkeerd = vandaag && openGisteren > 0
  const [dagLabel, setDagLabel] = useState('')
  useEffect(() => {
    setDagLabel(dag.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))
  }, [dag])

  return (
    <div className="space-y-6">

      {/* ── Dag navigatie ── */}
      <div>
        <h1 className="text-2xl font-medium text-dark tracking-tight mb-3">Taken</h1>
        <div className="flex items-center gap-2 bg-light rounded-2xl border border-black/20 px-4 py-3">
          <button onClick={() => { const d = new Date(dag); d.setDate(d.getDate() - 1); setDag(d) }}
            className="p-1.5 rounded-full text-muted hover:text-dark hover:bg-grey transition-colors">←</button>
          <div className="flex-1 text-center">
            <span className="text-sm font-medium text-dark capitalize">{dagLabel}</span>
            {vandaag && <span className="ml-2 text-xs bg-brand/20 text-dark px-2 py-0.5 rounded-full">vandaag</span>}
          </div>
          <button onClick={() => { const d = new Date(dag); d.setDate(d.getDate() + 1); setDag(d) }}
            className="p-1.5 rounded-full text-muted hover:text-dark hover:bg-grey transition-colors">→</button>
        </div>
      </div>

      {/* ── Blokkade banner ── */}
      {openGisteren > 0 && vandaag && (
        <div className="bg-orange-50 border border-orange-300 rounded-2xl px-5 py-4 flex items-start gap-3">
          <span className="text-orange-500 text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-orange-900">
              Je hebt nog <strong>{openGisteren} tak{openGisteren === 1 ? '' : 'en'}</strong> van <span className="capitalize">{gisterenLabel}</span> niet beoordeeld. Vink ze af voordat je de taken van vandaag invult.
            </p>
            <button
              onClick={() => { const g = vorigeWerkdag(new Date()); g.setHours(0,0,0,0); setDag(g) }}
              className="mt-2 text-xs font-medium text-orange-700 underline hover:text-orange-900 transition-colors">
              Ga naar {gisterenLabel} om af te vinken →
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-32 text-muted text-sm">Laden…</div>
      ) : (
        <section>
          {/* Weekdoelen suggesties */}
          {weekDoelen.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-2">Selecteer vanuit je weekplanning:</p>
              <div className="flex flex-wrap gap-2">
                {weekDoelen.map((doel, i) => {
                  const alIngevuld = rijen.some(r => r.weekGoalId === doel.id || r.tekst.trim().toLowerCase() === doel.goal_text.toLowerCase())
                  return (
                    <button key={i} disabled={alIngevuld || geblokkeerd}
                      onClick={() => {
                        setRijen(p => {
                          const n = [...p]
                          const leegIdx = n.findIndex(r => !r.tekst.trim())
                          const nieuw = { ...legeRij(), tekst: doel.goal_text, clientId: doel.clientId, weekGoalId: doel.id }
                          if (leegIdx >= 0) { n[leegIdx] = nieuw; return n }
                          return [...n, nieuw]
                        })
                      }}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${alIngevuld ? 'bg-brand/15 text-dark border-brand/30 opacity-60 cursor-default' : 'bg-light text-dark border-black/20 hover:bg-dark hover:text-white hover:border-dark'}`}>
                      {alIngevuld ? '✓ ' : '+ '}{doel.goal_text}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-black/20 overflow-hidden mb-3">
            {rijen.map((rij, i) => {
              const heeftId     = !!rij.id
              const toonReview  = verleden && heeftId
              const isAfgerond  = rij.completed === true
              const isMislukt   = rij.completed === false
              const rowBg =
                toonReview && isAfgerond ? 'bg-brand/15 border-b-brand/20' :
                toonReview && isMislukt  ? 'bg-red-50'  : 'bg-light'

              return (
                <div key={i}>
                  <div className={`flex items-center gap-2 px-4 py-3 ${rowBg} ${i < rijen.length - 1 ? 'border-b border-black/10' : ''}`}>
                    {toonReview ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => toggleReview(i, true)} disabled={savingR[i]}
                          className={`w-8 h-8 rounded-full text-sm font-medium border transition-all duration-150 ${isAfgerond ? 'bg-brand text-dark border-brand shadow-sm' : 'bg-transparent text-muted border-black/20 hover:bg-brand hover:text-dark hover:border-brand'}`}>✓</button>
                        <button onClick={() => toggleReview(i, false)} disabled={savingR[i]}
                          className={`w-8 h-8 rounded-full text-sm font-medium border transition-all duration-150 ${isMislukt ? 'bg-red-500 text-white border-red-500' : 'bg-transparent text-muted border-black/20 hover:bg-red-500 hover:text-white hover:border-red-500'}`}>✕</button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted w-4 shrink-0 text-right">{i + 1}</span>
                    )}
                    <input type="text" value={rij.tekst}
                      onChange={e => { if (geblokkeerd) return; const n = [...rijen]; n[i] = { ...n[i], tekst: e.target.value }; setRijen(n) }}
                      placeholder={geblokkeerd ? 'Vink eerst gisteren af…' : `Taak ${i + 1}`}
                      readOnly={geblokkeerd}
                      className={`flex-1 text-sm focus:outline-none bg-transparent ${isAfgerond ? 'line-through text-muted' : geblokkeerd ? 'text-muted/50 cursor-not-allowed' : 'text-dark placeholder-muted/40'}`} />
                    <select value={rij.clientId ?? ''}
                      disabled={geblokkeerd}
                      onChange={e => { const n = [...rijen]; n[i] = { ...n[i], clientId: e.target.value || null }; setRijen(n) }}
                      className="text-xs border border-black/20 rounded-lg px-2 py-1 text-muted bg-cream focus:outline-none focus:border-dark/30 transition-colors shrink-0 max-w-28">
                      <option value="">Klant</option>
                      {klanten.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                    {rij.tekst.trim() && (
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          title="High leverage"
                          disabled={geblokkeerd}
                          onClick={() => { const n = [...rijen]; n[i] = { ...n[i], leverage: n[i].leverage === 'high' ? null : 'high' }; setRijen(n) }}
                          className={`text-xs w-6 h-6 rounded-full font-semibold border transition-all duration-150 ${rij.leverage === 'high' ? 'bg-dark text-brand border-dark' : 'text-muted border-black/20 hover:border-dark/40 hover:text-dark'}`}>
                          H
                        </button>
                        <button
                          title="Low leverage"
                          disabled={geblokkeerd}
                          onClick={() => { const n = [...rijen]; n[i] = { ...n[i], leverage: n[i].leverage === 'low' ? null : 'low' }; setRijen(n) }}
                          className={`text-xs w-6 h-6 rounded-full font-semibold border transition-all duration-150 ${rij.leverage === 'low' ? 'bg-dark text-brand border-dark' : 'text-muted border-black/20 hover:border-dark/40 hover:text-dark'}`}>
                          L
                        </button>
                      </div>
                    )}
                  </div>
                  {toonReview && isMislukt && (
                    <div className={`px-4 pb-3 bg-red-50 ${i < rijen.length - 1 ? 'border-b border-black/10' : ''}`}>
                      <textarea value={rij.reason ?? ''} onChange={e => updateReden(i, e.target.value)}
                        placeholder="Wat is er misgegaan?" rows={2}
                        className="w-full text-sm border border-red-200 rounded-xl px-3 py-2 text-dark placeholder-red-300 focus:outline-none focus:border-red-400 bg-white resize-none" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Acties rij */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setRijen(p => [...p, legeRij()])}
              className="text-sm text-muted hover:text-dark border border-black/20 hover:border-dark/40 rounded-full px-4 py-1.5 transition-all duration-150">
              + Taak
            </button>
            <div className="flex gap-1.5 ml-auto">
              <input type="text" value={nieuweKlant} onChange={e => setNieuweKlant(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') voegKlantToe() }}
                placeholder="Nieuwe klant…"
                className="text-xs border border-black/20 rounded-full px-3 py-1.5 text-dark placeholder-muted/50 focus:outline-none focus:border-dark/40 bg-cream w-32 transition-colors" />
              <button onClick={voegKlantToe} disabled={savingKlant || !nieuweKlant.trim()}
                className="text-xs border border-black/20 rounded-full px-3 py-1.5 text-muted hover:text-dark hover:border-dark/40 disabled:opacity-40 transition-all duration-150">
                {savingKlant ? '…' : '+ Klant'}
              </button>
            </div>
          </div>

          {/* Hulpvraag (alleen voor vandaag/toekomst) */}
          {!verleden && (
            <div className="bg-light rounded-2xl border border-black/20 px-5 py-4 mb-4">
              <label className="block text-sm font-medium text-dark mb-2">Heb je ergens hulp bij nodig?</label>
              <textarea value={helpText} onChange={e => setHelpText(e.target.value)}
                placeholder="Beschrijf waar je hulp bij nodig hebt… (optioneel)"
                rows={3}
                className="w-full text-sm border border-black/20 rounded-xl px-4 py-3 text-dark placeholder-muted/40 focus:outline-none focus:border-dark/40 bg-cream resize-none transition-colors" />
            </div>
          )}

          {slackFout && (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 mb-3">
              Taken opgeslagen, maar Slack-melding mislukt: {slackFout}
            </p>
          )}

          <button onClick={slaaTakenOp} disabled={savingT || geblokkeerd}
            title={geblokkeerd ? 'Vink eerst de taken van gisteren af' : undefined}
            className={`w-full py-3 rounded-full text-sm font-medium border transition-all duration-150 ${savedT ? 'bg-brand text-dark border-brand' : 'bg-brand text-dark border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-40 disabled:cursor-not-allowed'}`}>
            {savingT ? 'Opslaan…' : savedT ? '✓ Opgeslagen' : geblokkeerd ? 'Vink eerst gisteren af' : 'Taken opslaan'}
          </button>
        </section>
      )}
    </div>
  )
}
