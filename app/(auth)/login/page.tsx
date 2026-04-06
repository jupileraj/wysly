'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Inloggen mislukt. Controleer je e-mailadres en wachtwoord.')
      setLoading(false)
    } else {
      router.push('/planning')
      router.refresh()
    }
  }

  return (
    <div className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-brand font-medium text-3xl tracking-tight">Wysly</span>
          <p className="text-white/30 mt-1 text-sm">Jouw weekplanner</p>
        </div>

        {/* Card */}
        <div className="bg-dark-800 rounded-2xl border border-white/20 p-7">
          <h2 className="text-lg font-medium text-white tracking-tight mb-6">Inloggen</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-white/50 mb-1.5">E-mailadres</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" placeholder="naam@bedrijf.nl"
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand/60 transition-colors" />
            </div>

            <div>
              <label className="block text-sm text-white/50 mb-1.5">Wachtwoord</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password"
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand/60 transition-colors" />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            {/* WYS Primary button: brand bg → hover inverteert naar dark/white */}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-brand text-dark text-sm font-medium rounded-full hover:bg-dark hover:text-white border border-brand hover:border-dark disabled:opacity-50 transition-all duration-150">
              {loading ? 'Bezig…' : 'Inloggen'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-white/30 mt-5">
          Nog geen account?{' '}
          <Link href="/register" className="text-brand hover:text-brand/70 font-medium transition-colors">
            Account aanmaken
          </Link>
        </p>
      </div>
    </div>
  )
}
