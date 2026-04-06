'use client'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#888' }}>Er is iets misgegaan.</p>
          <button onClick={reset} style={{ fontSize: '0.875rem', textDecoration: 'underline' }}>Opnieuw proberen</button>
        </div>
      </body>
    </html>
  )
}
