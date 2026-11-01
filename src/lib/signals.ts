/**
 * Quick screener: runs the pattern rules on each coin's 7-day hourly price line
 * (already included in the market list, so it costs no extra API calls) and sorts
 * every coin into Buy or Don't buy, with Sell flagged on bearish breakdowns.
 * Coin pages run the fuller 90-day analysis.
 */
import type { Candle, Coin, Pattern, VerdictKey } from './types'
import { analyze, VERDICT_META } from './patterns'

export type SignalGroup = 'buy' | 'dont'

export interface Signal {
  group: SignalGroup
  sell: boolean
  verdict: VerdictKey
  label: string
  tone: 'bull' | 'bear' | 'neutral' | 'warn'
  score: number
  reason: string // short why, e.g. "Bull Flag forming"
}

/** Hourly candles from close prices only (open = previous close). */
export function sparklineCandles(prices: number[], endMs: number): Candle[] {
  const hour = 3_600_000
  const start = Math.floor(endMs / hour) * hour - (prices.length - 1) * hour
  const out: Candle[] = []
  for (let i = 0; i < prices.length; i++) {
    const close = prices[i]
    if (!(close > 0)) continue
    const open = out.length ? out[out.length - 1].close : close
    out.push({ time: Math.floor((start + i * hour) / 1000), open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 0 })
  }
  return out
}

const SELL_VERDICTS: VerdictKey[] = ['avoid']

function isBearishBreak(p: Pattern) {
  return p.bias === 'bearish' && p.status === 'confirmed' && p.confidence >= 50
}

export function quickSignal(coin: Coin): Signal | null {
  const prices = coin.sparkline_in_7d?.price
  if (!prices || prices.length < 48) return null
  const end = coin.last_updated ? Date.parse(coin.last_updated) || Date.now() : Date.now()
  const candles = sparklineCandles(prices, end)
  if (candles.length < 48) return null
  // The newest point should match the live price.
  const last = candles[candles.length - 1]
  last.close = coin.current_price
  last.high = Math.max(last.high, last.close)
  last.low = Math.min(last.low, last.close)

  const a = analyze(candles, '1h')
  const v = a.plan.verdict
  const bearBreak = a.patterns.find(isBearishBreak)
  const buy = v === 'strong-buy' || v === 'buy-breakout' || v === 'buy-dip'
  const sell = !buy && (SELL_VERDICTS.includes(v) || !!bearBreak)
  const lead = bearBreak && sell ? bearBreak : a.patterns.find((p) => p.status !== 'failed')
  const meta = VERDICT_META[v]
  return {
    group: buy ? 'buy' : 'dont',
    sell,
    verdict: v,
    label: sell ? 'Sell' : meta.label,
    tone: sell ? 'bear' : meta.tone,
    score: a.plan.score,
    reason: lead ? `${lead.name} ${lead.status}` : a.indicators.trend === 'up' ? 'Uptrend, no pattern' : a.indicators.trend === 'down' ? 'Downtrend, no pattern' : 'No clear pattern',
  }
}

export function computeSignals(coins: Coin[]): Map<string, Signal> {
  const out = new Map<string, Signal>()
  for (const c of coins) {
    try {
      const s = quickSignal(c)
      if (s) out.set(c.id, s)
    } catch {
      /* skip a coin with odd data rather than break the list */
    }
  }
  return out
}
