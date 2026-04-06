'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  return (
    <Link href={href}
      className={`block px-3 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap ${
        active ? 'text-brand bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'
      }`}>
      {label}
    </Link>
  )
}
