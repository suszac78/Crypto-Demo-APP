import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Coin } from '../lib/types'
import { fetchTop500 } from '../lib/coingecko'
import { load, save } from './storage'
import { setDisplayCurrency } from '../lib/format'
import { approxRate, isCurrency } from '../lib/currency'
import { computeSignals, type Signal } from '../lib/signals'

export interface Settings {
  apiKey: string
  refreshMinutes: number
  feePct: number
  watchlist: string[]
  currency: string
}

const ENV_KEY = (import.meta.env.VITE_COINGECKO_API_KEY as string | undefined) ?? ''
const DEFAULT_SETTINGS: Settings = { apiKey: ENV_KEY, refreshMinutes: 5, feePct: 0.1, watchlist: ['bitcoin', 'ethereum', 'solana'], currency: 'usd' }

interface MarketState {
  coins: Coin[]
  byId: Map<string, Coin>
  loading: boolean
  error: string | null
  lastUpdated: number | null
  nextRefresh: number | null
  simulated: boolean
  /** Currency the loaded prices are in (follows settings.currency once new data arrives). */
  currency: string
  /** Units of `to` per unit of `from`, from the latest loaded prices. */
  rate: (from: string, to: string) => number
  /** Buy / don't buy / sell screen for every coin, from its 7-day chart. */
  signals: Map<string, Signal>
  refresh: () => void
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
  toggleWatch: (id: string) => void
  onPrices: (cb: (coins: Coin[], currency: string) => void) => () => void
}

const Ctx = createContext<MarketState | null>(null)

const REF_COINS = ['tether', 'usd-coin', 'bitcoin']
/** Prices of a few reference coins. Stablecoins barely move, so their price ratio across currencies is a clean exchange rate. */
function refsFrom(coins: Coin[]): Record<string, number> {
  const refs: Record<string, number> = {}
  for (const c of coins) if (REF_COINS.includes(c.id) && c.current_price > 0) refs[c.id] = c.current_price
  return refs
}

export function MarketProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => load('pd.settings', DEFAULT_SETTINGS))
  const [cache] = useState(() => load<{ coins: Coin[]; at: number | null; currency: string }>('pd.marketCache', { coins: [], at: null, currency: 'usd' }))
  const [coins, setCoins] = useState<Coin[]>(cache.coins)
  const [currency, setCurrency] = useState(() => (setDisplayCurrency(cache.currency), cache.currency))
  // Reference prices per currency, used to convert the demo account when the currency changes.
  const [initialRefs] = useState(() => ({ [cache.currency]: refsFrom(cache.coins) }))
  const refPrices = useRef<Record<string, Record<string, number>>>(initialRefs)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(cache.at)
  const [nextRefresh, setNextRefresh] = useState<number | null>(null)
  const listeners = useRef(new Set<(c: Coin[], cur: string) => void>())
  const inflight = useRef(false)
  const apiKey = settings.apiKey.trim() || null
  const wanted = isCurrency(settings.currency) ? settings.currency : 'usd'

  const refresh = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    setLoading(true)
    try {
      const cur = wanted
      const data = await fetchTop500(apiKey, cur)
      refPrices.current[cur] = refsFrom(data)
      setDisplayCurrency(cur)
      setCurrency(cur)
      setCoins(data)
      setError(null)
      const at = Date.now()
      setLastUpdated(at)
      if (apiKey) save('pd.marketCache', { coins: data, at, currency: cur })
      listeners.current.forEach((cb) => cb(data, cur))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach CoinGecko')
    } finally {
      inflight.current = false
      setLoading(false)
    }
  }, [apiKey, wanted])

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

  const rate = useCallback((from: string, to: string) => {
    if (from === to) return 1
    const a = refPrices.current[from]
    const b = refPrices.current[to]
    for (const id of REF_COINS) if (a?.[id] && b?.[id]) return b[id] / a[id]
    return approxRate(to) / approxRate(from)
  }, [])

  const onPrices = useCallback((cb: (c: Coin[], cur: string) => void) => {
    listeners.current.add(cb)
    return () => {
      listeners.current.delete(cb)
    }
  }, [])

  const byId = useMemo(() => new Map(coins.map((c) => [c.id, c])), [coins])

  // Screening 500 charts takes a moment, so run it just after the new prices render.
  const [signals, setSignals] = useState<Map<string, Signal>>(() => new Map())
  useEffect(() => {
    const t = setTimeout(() => setSignals(computeSignals(coins)), 50)
    return () => clearTimeout(t)
  }, [coins])

  const value: MarketState = {
    coins,
    byId,
    loading,
    error,
    lastUpdated,
    nextRefresh,
    simulated: !apiKey,
    currency,
    rate,
    signals,
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
