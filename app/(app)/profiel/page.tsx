'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateProfiel } from './actions'

export default function ProfielPage() {
  const supabase = createClient()
  const [naam,      setNaam]      = useState('')
  const [email,     setEmail]     = useState('')
  const [ww,        setWw]        = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [bericht,   setBericht]   = useState<{ ok?: boolean; tekst: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: p } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      setNaam(p?.name ?? '')
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function slaOp(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setBericht(null)
    const fd = new FormData()
    fd.set('name', naam)
    if (ww) fd.set('password', ww)
    const res = await updateProfiel(fd)
    if (res.error) {
      setBericht({ tekst: res.error })
    } else {
      setBericht({ ok: true, tekst: 'Wijzigingen opgeslagen.' })
      setWw('')
    }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center items-center h-48 text-muted text-sm">Laden…</div>

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-medium text-dark tracking-tight mb-6">Mijn profiel</h1>

      <form onSubmit={slaOp} className="bg-light rounded-2xl border border-black/20 px-6 py-6 space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1">Naam</label>
          <input type="text" value={naam} onChange={e => setNaam(e.target.value)} required
            className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">E-mailadres</label>
          <input type="email" value={email} disabled
            className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm text-muted bg-grey/30 cursor-not-allowed" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Nieuw wachtwoord <span className="text-muted/50">(laat leeg om niet te wijzigen)</span></label>
          <input type="password" value={ww} onChange={e => setWw(e.target.value)} minLength={8} placeholder="Minimaal 8 tekens"
            className="w-full border border-black/20 rounded-xl px-4 py-2.5 text-sm text-dark bg-cream focus:outline-none focus:border-dark/40 placeholder-muted/40" />
        </div>
        {bericht && (
          <p className={`text-sm ${bericht.ok ? 'text-green-600' : 'text-red-500'}`}>{bericht.tekst}</p>
        )}
        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-full text-sm font-medium border bg-brand text-dark border-brand hover:bg-dark hover:text-white hover:border-dark disabled:opacity-50 transition-all duration-150">
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </form>
    </div>
  )
}
