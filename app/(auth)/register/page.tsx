'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { validateInviteCode, createUser } from './actions'

export default function RegisterPage() {
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')

    const name        = formData.get('name')          as string
    const email       = formData.get('email')         as string
    const password    = formData.get('password')      as string
    const inviteCode  = formData.get('inviteCode')    as string
    const hours       = parseInt(formData.get('contractHours') as string)

    if (!await validateInviteCode(inviteCode)) {
      setError('Toegangscode is onjuist.'); setLoading(false); return
    }
    if (isNaN(hours) || hours < 1 || hours > 80) {
      setError('Contracturen moeten tussen 1 en 80 liggen.'); setLoading(false); return
    }

    const { error: createError } = await createUser(email, password, name, hours)
    if (createError) { setError(createError); setLoading(false); return }

    const supabase = createClient()
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) { setError(loginError.message); setLoading(false) }
    else { router.push('/planning'); router.refresh() }
  }

  const inputClass = "w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand/60 transition-colors"
  const labelClass = "block text-sm text-white/50 mb-1.5"

  return (
    <div className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <span className="text-brand font-medium text-3xl tracking-tight">Wysly</span>
          <p className="text-white/30 mt-1 text-sm">Jouw weekplanner</p>
        </div>

        <div className="bg-dark-800 rounded-2xl border border-white/20 p-7">
          <h2 className="text-lg font-medium text-white tracking-tight mb-6">Account aanmaken</h2>

          <form action={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Toegangscode</label>
              <input name="inviteCode" type="text" required placeholder="Voer de toegangscode in" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Naam</label>
              <input name="name" type="text" required placeholder="Jan de Vries" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>E-mailadres</label>
              <input name="email" type="email" required autoComplete="email" placeholder="naam@bedrijf.nl" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Wachtwoord</label>
              <input name="password" type="password" required minLength={6} autoComplete="new-password" placeholder="Minimaal 6 tekens" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Contracturen per week</label>
              <div className="flex items-center gap-2">
                <input name="contractHours" type="number" required min={1} max={80} defaultValue="40"
                  className="w-24 bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/60 transition-colors" />
                <span className="text-sm text-white/30">uur</span>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-brand text-dark text-sm font-medium rounded-full hover:bg-dark hover:text-white border border-brand hover:border-dark disabled:opacity-50 transition-all duration-150">
              {loading ? 'Account aanmaken…' : 'Account aanmaken'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-white/30 mt-5">
          Al een account?{' '}
          <Link href="/login" className="text-brand hover:text-brand/70 font-medium transition-colors">Inloggen</Link>
        </p>
      </div>
    </div>
  )
}
