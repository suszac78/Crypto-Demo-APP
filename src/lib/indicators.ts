import type { Candle, ChartPoint } from './types'

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = values.map(() => null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/** Average true range as a fraction of price. */
export function atrPct(c: Candle[], period = 14): number {
  if (c.length < 2) return 0.02
  const trs: number[] = []
  for (let i = 1; i < c.length; i++) {
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close))
    trs.push(tr / c[i].close)
  }
  const recent = trs.slice(-period)
  return recent.reduce((a, b) => a + b, 0) / recent.length
}

export interface Pivot {
  i: number
  time: number
  price: number
  type: 'H' | 'L'
}

/**
 * Swing highs/lows: a candle whose high (low) is the extreme of the `w` candles
 * on each side. Consecutive pivots of the same type are merged (keep the extreme)
 * so the result alternates H, L, H, L...
 */
export function pivots(c: Candle[], w: number): Pivot[] {
  const raw: Pivot[] = []
  for (let i = w; i < c.length - w; i++) {
    let isH = true
    let isL = true
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue
      if (c[j].high > c[i].high) isH = false
      if (c[j].low < c[i].low) isL = false
    }
    if (isH) raw.push({ i, time: c[i].time, price: c[i].high, type: 'H' })
    if (isL) raw.push({ i, time: c[i].time, price: c[i].low, type: 'L' })
  }
  const out: Pivot[] = []
  for (const p of raw) {
    const last = out[out.length - 1]
    if (last && last.type === p.type) {
      if ((p.type === 'H' && p.price > last.price) || (p.type === 'L' && p.price < last.price)) out[out.length - 1] = p
    } else out.push(p)
  }
  return out
}

/** Least-squares line through points (x = candle index). */
export function fitLine(pts: { x: number; y: number }[]): { slope: number; intercept: number; at: (x: number) => number } {
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p.x, 0) / n
  const my = pts.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx
  return { slope, intercept, at: (x: number) => intercept + slope * x }
}

/** Line through two points, evaluated at x. */
export function lineAt(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x2 === x1) return y1
  return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)
}

export function seriesFrom(c: Candle[], values: (number | null)[]): ChartPoint[] {
  const out: ChartPoint[] = []
  values.forEach((v, i) => {
    if (v != null && isFinite(v)) out.push({ time: c[i].time, value: v })
  })
  return out
}
