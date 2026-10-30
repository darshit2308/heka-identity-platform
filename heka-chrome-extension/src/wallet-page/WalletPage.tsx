import React, { useEffect, useState } from 'react'

import { getOrCreateAgent } from '../credo/lazy-agent'

type WalletStatus = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string }

export const WalletPage: React.FC = () => {
  const [status, setStatus] = useState<WalletStatus>({ state: 'loading' })
  const offer = new URLSearchParams(window.location.search).get('offer')

  useEffect(() => {
    let cancelled = false
    void getOrCreateAgent()
      .then(() => {
        if (!cancelled) setStatus({ state: 'ready' })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Wallet initialization failed'
        if (!cancelled) setStatus({ state: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 640 }}>
      <h1>Heka Wallet</h1>
      <p id="credo-status">
        {status.state === 'loading' && 'Starting the wallet…'}
        {status.state === 'ready' && 'Wallet ready'}
        {status.state === 'error' && status.message}
      </p>
      {offer && <p>Credential offer received. Receiving it into this wallet is the next step.</p>}
    </main>
  )
}
