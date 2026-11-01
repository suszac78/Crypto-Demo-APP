import type { Candle, Coin } from './types'
import { mockMarkets, mockSeries } from './mock'

const BASE = 'https://api.coingecko.com/api/v3'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function cg<T>(path: string, apiKey: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  // The free "Demo" key can be sent as a header or query param. Query param avoids a CORS preflight.
  const res = await fetch(`${BASE}${path}${sep}x_cg_demo_api_key=${encodeURIComponent(apiKey)}`)
  if (!res.ok) {
    let msg = `CoinGecko returned ${res.status}`
    if (res.status === 429) msg = 'CoinGecko rate limit hit — will retry on the next refresh.'
    if (res.status === 401 || res.status === 403) msg = 'CoinGecko rejected the API key. Check it in Settings.'
    throw new ApiError(msg, res.status)
  }
  return res.json() as Promise<T>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Top 500 coins by market cap (2 pages x 250, the API max page size). */
export async function fetchTop500(apiKey: string | null, currency = 'usd'): Promise<Coin[]> {
  if (!apiKey) return mockMarkets(Date.now(), currency)
  const q = `vs_currency=${currency}&order=market_cap_desc&per_page=250&sparkline=true&price_change_percentage=1h,24h,7d`
  const page1 = await cg<Coin[]>(`/coins/markets?${q}&page=1`, apiKey)
  await sleep(400)
  const page2 = await cg<Coin[]>(`/coins/markets?${q}&page=2`, apiKey)
  const seen = new Set<string>()
  return [...page1, ...page2].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
}

interface MarketChart {
  prices: [number, number][]
  total_volumes: [number, number][]
}

const chartCache = new Map<string, { at: number; data: MarketChart }>()
const CHART_TTL = 5 * 60_000

/** 90 days of hourly prices + volumes (CoinGecko auto-picks hourly for 2–90 days). */
export async function fetchHourly90d(coinId: string, apiKey: string | null, currency = 'usd'): Promise<MarketChart> {
  const key = `${apiKey ? 'live' : 'sim'}:${currency}:${coinId}`
  const hit = chartCache.get(key)
  if (hit && Date.now() - hit.at < CHART_TTL) return hit.data
  const data = apiKey
    ? await cg<MarketChart>(`/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${currency}&days=90`, apiKey)
    : mockSeries(coinId, 24 * 90, Date.now(), currency)
  chartCache.set(key, { at: Date.now(), data })
  return data
}

/** Group hourly ticks into OHLC candles of `hours` length. */
export function toCandles(chart: MarketChart, hours: number): Candle[] {
  const bucketMs = hours * 3_600_000
  const vols = new Map<number, number>()
  for (const [t, v] of chart.total_volumes) vols.set(Math.floor(t / bucketMs), v)
  const out: Candle[] = []
  let cur: Candle | null = null
  let curKey = -1
  for (const [t, p] of chart.prices) {
    if (!isFinite(p) || p <= 0) continue
    const k = Math.floor(t / bucketMs)
    if (k !== curKey) {
      if (cur) out.push(cur)
      const open: number = cur ? cur.close : p
      cur = { time: Math.floor((k * bucketMs) / 1000), open, high: Math.max(open, p), low: Math.min(open, p), close: p, volume: vols.get(k) ?? 0 }
      curKey = k
    } else if (cur) {
      cur.high = Math.max(cur.high, p)
      cur.low = Math.min(cur.low, p)
      cur.close = p
      cur.volume = vols.get(k) ?? cur.volume
    }
  }
  if (cur) out.push(cur)
  return out
}
