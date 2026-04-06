'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-sm text-muted">Er is iets misgegaan.</p>
      <button onClick={reset} className="text-sm text-dark underline">Opnieuw proberen</button>
    </div>
  )
}
