import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Coin } from '../lib/types'
import { fetchTop500 } from '../lib/coingecko'
import { load, save } from './storage'

export interface Settings {
  apiKey: string
  refreshMinutes: number
  feePct: number
  watchlist: string[]
}

const ENV_KEY = (import.meta.env.VITE_COINGECKO_API_KEY as string | undefined) ?? ''
const DEFAULT_SETTINGS: Settings = { apiKey: ENV_KEY, refreshMinutes: 5, feePct: 0.1, watchlist: ['bitcoin', 'ethereum', 'solana'] }

interface MarketState {
  coins: Coin[]
  byId: Map<string, Coin>
  loading: boolean
  error: string | null
  lastUpdated: number | null
  nextRefresh: number | null
  simulated: boolean
  refresh: () => void
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
  toggleWatch: (id: string) => void
  onPrices: (cb: (coins: Coin[]) => void) => () => void
}

const Ctx = createContext<MarketState | null>(null)

export function MarketProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => load('pd.settings', DEFAULT_SETTINGS))
  const [coins, setCoins] = useState<Coin[]>(() => load<{ coins: Coin[] }>('pd.marketCache', { coins: [] }).coins)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => load<{ at: number | null }>('pd.marketCache', { at: null }).at)
  const [nextRefresh, setNextRefresh] = useState<number | null>(null)
  const listeners = useRef(new Set<(c: Coin[]) => void>())
  const inflight = useRef(false)
  const apiKey = settings.apiKey.trim() || null

  const refresh = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    setLoading(true)
    try {
      const data = await fetchTop500(apiKey)
      setCoins(data)
      setError(null)
      const at = Date.now()
      setLastUpdated(at)
      if (apiKey) save('pd.marketCache', { coins: data, at })
      listeners.current.forEach((cb) => cb(data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach CoinGecko')
    } finally {
      inflight.current = false
      setLoading(false)
    }
  }, [apiKey])

  // Fetch on start and every N minutes. While the tab is hidden we skip fetches
  // (saves API quota) and catch up as soon as it's visible again.
  useEffect(() => {
    const periodMs = Math.max(1, settings.refreshMinutes) * 60_000
    let last = 0
    const tick = () => {
      if (document.hidden) return
      if (Date.now() - last >= periodMs - 1000) {
        last = Date.now()
        setNextRefresh(last + periodMs)
        refresh()
      }
    }
    tick()
    const id = window.setInterval(tick, 5_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh, settings.refreshMinutes])

  const updateSettings = useCallback((s: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...s }
      save('pd.settings', next)
      return next
    })
  }, [])

  const toggleWatch = useCallback(
    (id: string) => {
      setSettings((prev) => {
        const watchlist = prev.watchlist.includes(id) ? prev.watchlist.filter((x) => x !== id) : [...prev.watchlist, id]
        const next = { ...prev, watchlist }
        save('pd.settings', next)
        return next
      })
    },
    [],
  )

  const onPrices = useCallback((cb: (c: Coin[]) => void) => {
    listeners.current.add(cb)
    return () => {
      listeners.current.delete(cb)
    }
  }, [])

  const byId = useMemo(() => new Map(coins.map((c) => [c.id, c])), [coins])

  const value: MarketState = {
    coins,
    byId,
    loading,
    error,
    lastUpdated,
    nextRefresh,
    simulated: !apiKey,
    refresh,
    settings,
    updateSettings,
    toggleWatch,
    onPrices,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMarket() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMarket outside provider')
  return v
}
