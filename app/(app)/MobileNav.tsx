'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string }

export default function MobileNav({ navItems, naam }: { navItems: NavItem[]; naam: string | null }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Sluit menu bij navigatie
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark border-b border-white/10 md:hidden">
        <Image src="/logo-light.svg" alt="WYS" width={72} height={16} priority />
        <button onClick={() => setOpen(p => !p)} className="text-white/60 hover:text-white transition-colors p-1">
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <nav className="absolute top-0 left-0 h-full w-60 bg-dark flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10">
              <Image src="/logo-light.svg" alt="WYS" width={72} height={16} priority />
            </div>
            <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {navItems.map(({ href, label }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link key={href} href={href}
                    className={`block px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                      active ? 'text-brand bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'
                    }`}>
                    {label}
                  </Link>
                )
              })}
            </div>
            <div className="px-5 py-4 border-t border-white/10">
              <p className="text-xs text-white/30 truncate">{naam}</p>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
