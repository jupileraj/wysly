import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import NavLink from './NavLink'
import SignOutButton from './SignOutButton'
import MobileNav from './MobileNav'
import Avatar from './Avatar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('name, role, avatar_url').eq('id', user.id).single()

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/planning',  label: 'Planning' },
    { href: '/taken',     label: 'Taken' },
    { href: '/logboek',   label: 'Logboek' },
    { href: '/klanten',   label: 'Klanten' },
    ...(profile?.role === 'admin' ? [{ href: '/admin', label: 'Admin' }] : []),
    { href: '/profiel',   label: 'Profiel' },
  ]

  return (
    <div className="min-h-screen bg-cream flex flex-col md:flex-row">

      {/* ── Mobiele topbar + slide-out nav ── */}
      <MobileNav navItems={navItems} naam={profile?.name ?? null} avatarUrl={profile?.avatar_url ?? null} />

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 bg-dark border-r border-white/10 sticky top-0 h-screen">
        <div className="px-5 py-4 border-b border-white/10">
          <Image src="/logo-light.svg" alt="WYS" width={88} height={20} priority />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label }) => (
            <NavLink key={href} href={href} label={label} />
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2">
            <Avatar name={profile?.name ?? '?'} avatarUrl={profile?.avatar_url ?? null} size="sm" />
            <p className="text-xs text-white/50 truncate">{profile?.name}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 md:py-8">{children}</main>
      </div>
    </div>
  )
}
