/**
 * Chart pattern scanner.
 *
 * Detects the classic patterns from beginner crypto chart-pattern guides —
 * double top/bottom, head & shoulders (and inverse), ascending / descending /
 * symmetrical triangles, rising / falling wedges, bull / bear flags and
 * cup & handle — then turns them into a plain-English "when and where to buy" plan.
 *
 * Educational only: patterns are probabilistic and fail often.
 */
import type { Analysis, Bias, Candle, Indicators, Level, Pattern, PatternLine, Plan } from './types'
import { atrPct, fitLine, lineAt, pivots, rsi, sma, type Pivot } from './indicators'
import { clamp, fmtPrice } from './format'

export type Timeframe = '1h' | '4h' | '1d'

export function tfLabel(tf: Timeframe): string {
  return tf === '1d' ? 'daily' : tf === '4h' ? '4-hour' : '1-hour'
}

export const COLORS = {
  bull: '#2ee6a6',
  bear: '#ff5f7e',
  neutral: '#8f9bff',
  neck: '#ffc15e',
}

interface Ctx {
  c: Candle[]
  n: number
  price: number
  atr: number
  tol: number
  piv: Pivot[]
  rsi: (number | null)[]
  recent: number // patterns must have their last pivot at/after this index
  tf: Timeframe
  tfLabel: string
}

const PARAMS = {
  '1d': { w: 3, lookback: 90, maxAge: 18, minGap: 5, triWindow: 45, poleLen: 10, minPole: 0.12, consMax: 15, cupMin: 15, cupWindow: 90, minDepth: 0.12 },
  // 7 days of hourly closes (the market list's sparkline), used by the screener.
  '1h': { w: 4, lookback: 168, maxAge: 24, minGap: 6, triWindow: 72, poleLen: 12, minPole: 0.05, consMax: 24, cupMin: 30, cupWindow: 168, minDepth: 0.05 },
  '4h': { w: 5, lookback: 240, maxAge: 40, minGap: 10, triWindow: 120, poleLen: 18, minPole: 0.08, consMax: 30, cupMin: 40, cupWindow: 300, minDepth: 0.08 },
}

function biasColor(b: Bias) {
  return b === 'bullish' ? COLORS.bull : b === 'bearish' ? COLORS.bear : COLORS.neutral
}

function avgVol(c: Candle[], i: number, len = 20): number {
  const s = c.slice(Math.max(0, i - len), i).map((x) => x.volume).filter((v) => v > 0)
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0
}

/** First candle after `from` that closed beyond `level` in direction `dir`. */
function breakoutIndex(ctx: Ctx, from: number, level: (i: number) => number, dir: 1 | -1): number {
  for (let i = from + 1; i < ctx.n; i++) {
    if (dir === 1 ? ctx.c[i].close > level(i) * 1.003 : ctx.c[i].close < level(i) * 0.997) return i
  }
  return -1
}

function volConfirmed(ctx: Ctx, idx: number): boolean {
  if (idx < 0) return false
  const a = avgVol(ctx.c, idx)
  return a > 0 && ctx.c[idx].volume > a * 1.1
}

function pt(ctx: Ctx, i: number, value: number) {
  return { time: ctx.c[Math.min(i, ctx.n - 1)].time, value }
}

function hLine(ctx: Ctx, from: number, value: number, color = COLORS.neck): PatternLine {
  return { points: [pt(ctx, from, value), pt(ctx, ctx.n - 1, value)], color, dashed: true }
}

// ---------- Double bottom / double top ----------
function doubles(ctx: Ctx): Pattern[] {
  const out: Pattern[] = []
  const { piv, price, tol, c, atr } = ctx
  const p = PARAMS[ctx.tf]
  for (const kind of ['bottom', 'top'] as const) {
    const outer = kind === 'bottom' ? 'L' : 'H'
    for (let k = piv.length - 1; k >= Math.max(2, piv.length - 3); k--) {
      const a = piv[k - 2]
      const m = piv[k - 1]
      const b = piv[k]
      if (a.type !== outer || b.i < ctx.recent || b.i - a.i < p.minGap) continue
      const diff = Math.abs(a.price - b.price) / Math.min(a.price, b.price)
      if (diff > tol) continue
      const extreme = kind === 'bottom' ? Math.min(a.price, b.price) : Math.max(a.price, b.price)
      const height = Math.abs(m.price - extreme) / extreme
      if (height < Math.max(2 * tol, 0.03)) continue
      // Needs a prior trend into the first touch.
      const prior = c.slice(Math.max(0, a.i - 20), a.i)
      if (prior.length < 3) continue
      if (kind === 'bottom' && Math.max(...prior.map((x) => x.high)) < m.price * 0.97) continue
      if (kind === 'top' && Math.min(...prior.map((x) => x.low)) > m.price * 1.03) continue

      const neck = m.price
      const dir = kind === 'bottom' ? 1 : -1
      const bi = breakoutIndex(ctx, b.i, () => neck, dir)
      const target = kind === 'bottom' ? neck + (neck - extreme) : Math.max(neck - (extreme - neck), neck * 0.2)
      const broke = kind === 'bottom' ? Math.min(...c.slice(b.i + 1).map((x) => x.close), Infinity) < extreme * (1 - tol) : Math.max(...c.slice(b.i + 1).map((x) => x.close), -Infinity) > extreme * (1 + tol)
      let status: Pattern['status'] = 'forming'
      if (broke) status = 'failed'
      else if (bi >= 0) status = 'confirmed'
      if (status === 'confirmed' && (kind === 'bottom' ? price >= target : price <= target)) continue // move already played out

      const rA = ctx.rsi[a.i]
      const rB = ctx.rsi[b.i]
      const divergence = rA != null && rB != null && (kind === 'bottom' ? rB > rA : rB < rA)
      const vol = volConfirmed(ctx, bi)
      let conf = 48 + (1 - diff / tol) * 14 + (divergence ? 10 : 0) + (vol ? 10 : 0) + (status === 'confirmed' ? 12 : 0)
      if (status === 'failed') conf = 25
      const bias: Bias = kind === 'bottom' ? 'bullish' : 'bearish'
      const col = biasColor(bias)
      const stop = kind === 'bottom' ? extreme * (1 - atr * 0.6) : extreme * (1 + atr * 0.6)
      out.push({
        id: `double-${kind}-${a.time}`,
        name: kind === 'bottom' ? 'Double Bottom (W)' : 'Double Top (M)',
        bias,
        category: 'reversal',
        status,
        confidence: Math.round(clamp(conf, 10, 92)),
        startTime: a.time,
        endTime: c[ctx.n - 1].time,
        lines: [
          { points: [pt(ctx, a.i, a.price), pt(ctx, m.i, m.price), pt(ctx, b.i, b.price), pt(ctx, ctx.n - 1, price)], color: col },
          hLine(ctx, a.i, neck),
        ],
        entry: kind === 'bottom' ? neck * 1.003 : neck * 0.997,
        stop,
        target,
        volumeConfirmed: vol,
        summary:
          kind === 'bottom'
            ? `Price tested ~${fmtPrice(extreme)} twice and bounced each time, with a ${fmtPrice(neck)} "neckline" peak between. Sellers failed to push lower twice — a classic bullish reversal shape.${divergence ? ' RSI made a higher low on the second test (bullish divergence).' : ''}`
            : `Price was rejected near ~${fmtPrice(extreme)} twice, with a ${fmtPrice(neck)} neckline trough between. Buyers failed to break higher twice — a classic bearish reversal shape.${divergence ? ' RSI made a lower high on the second test (bearish divergence).' : ''}`,
        howToTrade:
          kind === 'bottom'
            ? status === 'confirmed'
              ? `Breakout confirmed above the neckline. Buy on a hold above ${fmtPrice(neck)} (or a pullback that retests it). Stop below ${fmtPrice(stop)}. Measured target ${fmtPrice(target)}.`
              : status === 'failed'
                ? `Price broke below the two lows — the pattern failed. Don't buy until a new base forms.`
                : `Wait for a ${ctx.tfLabel} close above the ${fmtPrice(neck)} neckline (ideally on rising volume), then buy. Stop below the lows at ${fmtPrice(stop)}. Target ${fmtPrice(target)}.`
            : status === 'confirmed'
              ? `Neckline broke — bearish. Avoid buying; if holding, consider selling. Downside target ${fmtPrice(target)}.`
              : status === 'failed'
                ? `Price pushed above both highs — the top failed, which is often bullish.`
                : `A ${ctx.tfLabel} close below ${fmtPrice(neck)} would confirm the top. Avoid new buys near the ${fmtPrice(extreme)} highs.`,
      })
      break
    }
  }
  return out
}

// ---------- Head & shoulders / inverse ----------
function headShoulders(ctx: Ctx): Pattern[] {
  const out: Pattern[] = []
  const { piv, price, tol, c, atr, n } = ctx
  for (const kind of ['top', 'inverse'] as const) {
    const outer = kind === 'top' ? 'H' : 'L'
    for (let k = piv.length - 1; k >= Math.max(4, piv.length - 2); k--) {
      const [ls, t1, head, t2, rs] = piv.slice(k - 4, k + 1)
      if (ls.type !== outer || rs.i < ctx.recent) continue
      const up = kind === 'top'
      const headOk = up ? head.price > ls.price * (1 + tol) && head.price > rs.price * (1 + tol) : head.price < ls.price * (1 - tol) && head.price < rs.price * (1 - tol)
      if (!headOk) continue
      if (Math.abs(ls.price - rs.price) / Math.min(ls.price, rs.price) > 2 * tol) continue
      if (Math.abs(t1.price - t2.price) / Math.min(t1.price, t2.price) > 3 * tol) continue
      const neckAt = (x: number) => lineAt(t1.i, t1.price, t2.i, t2.price, x)
      const dir = up ? -1 : 1
      const bi = breakoutIndex(ctx, rs.i, neckAt, dir)
      const neckNow = neckAt(n - 1)
      const depth = Math.abs(head.price - neckAt(head.i))
      const target = up ? Math.max(neckNow - depth, neckNow * 0.2) : neckNow + depth
      let status: Pattern['status'] = 'forming'
      if (up ? price > head.price : price < head.price) status = 'failed'
      else if (bi >= 0) status = 'confirmed'
      if (status === 'confirmed' && (up ? price <= target : price >= target)) continue
      const vol = volConfirmed(ctx, bi)
      const sym = 1 - Math.abs(ls.price - rs.price) / Math.min(ls.price, rs.price) / (2 * tol)
      let conf = 52 + sym * 12 + (vol ? 10 : 0) + (status === 'confirmed' ? 14 : 0)
      if (status === 'failed') conf = 25
      const bias: Bias = up ? 'bearish' : 'bullish'
      const stop = up ? rs.price * (1 + atr * 0.6) : rs.price * (1 - atr * 0.6)
      out.push({
        id: `hs-${kind}-${ls.time}`,
        name: up ? 'Head & Shoulders' : 'Inverse Head & Shoulders',
        bias,
        category: 'reversal',
        status,
        confidence: Math.round(clamp(conf, 10, 92)),
        startTime: ls.time,
        endTime: c[n - 1].time,
        lines: [
          { points: [ls, t1, head, t2, rs].map((p) => pt(ctx, p.i, p.price)).concat(pt(ctx, n - 1, price)), color: biasColor(bias) },
          { points: [pt(ctx, t1.i, neckAt(t1.i)), pt(ctx, n - 1, neckNow)], color: COLORS.neck, dashed: true },
        ],
        entry: up ? neckNow * 0.997 : neckNow * 1.003,
        stop,
        target,
        volumeConfirmed: vol,
        summary: up
          ? `Three peaks: a higher "head" at ${fmtPrice(head.price)} between two lower "shoulders". The neckline sits near ${fmtPrice(neckNow)}. This is one of the most reliable bearish reversal patterns.`
          : `Three troughs: a deeper "head" at ${fmtPrice(head.price)} between two shallower "shoulders". The neckline sits near ${fmtPrice(neckNow)}. This is one of the most reliable bullish reversal patterns.`,
        howToTrade: up
          ? status === 'confirmed'
            ? `Neckline broken — trend likely turning down. Avoid buying; if holding, consider selling. Target ${fmtPrice(target)}.`
            : status === 'failed'
              ? `Price rallied above the head — the pattern failed.`
              : `Watch the ${fmtPrice(neckNow)} neckline. A ${ctx.tfLabel} close below it confirms the reversal. Don't buy near the right shoulder.`
          : status === 'confirmed'
            ? `Neckline broken upward — buy on a hold above ${fmtPrice(neckNow)} or a retest of it. Stop below the right shoulder at ${fmtPrice(stop)}. Target ${fmtPrice(target)}.`
            : status === 'failed'
              ? `Price fell below the head — the pattern failed. Stand aside.`
              : `Wait for a ${ctx.tfLabel} close above the ${fmtPrice(neckNow)} neckline with rising volume, then buy. Stop ${fmtPrice(stop)}, target ${fmtPrice(target)}.`,
      })
      break
    }
  }
  return out
}

// ---------- Triangles & wedges ----------
function trianglesWedges(ctx: Ctx): Pattern[] {
  const { piv, price, tol, c, atr, n } = ctx
  const p = PARAMS[ctx.tf]
  const win = piv.filter((x) => x.i >= n - p.triWindow)
  const highs = win.filter((x) => x.type === 'H').slice(-3)
  const lows = win.filter((x) => x.type === 'L').slice(-3)
  if (highs.length < 2 || lows.length < 2) return []
  const lastPiv = Math.max(highs[highs.length - 1].i, lows[lows.length - 1].i)
  if (lastPiv < ctx.recent) return []
  const start = Math.min(highs[0].i, lows[0].i)
  const up = fitLine(highs.map((h) => ({ x: h.i, y: h.price })))
  const lo = fitLine(lows.map((l) => ({ x: l.i, y: l.price })))
  const end = n - 1
  const mean = c.slice(start).reduce((a, x) => a + x.close, 0) / (n - start)
  const dH = (up.at(lastPiv) - up.at(start)) / mean
  const dL = (lo.at(lastPiv) - lo.at(start)) / mean
  const w0 = up.at(start) - lo.at(start)
  const wEnd = up.at(end) - lo.at(end)
  if (w0 <= 0 || wEnd <= 0) return []
  if (wEnd > w0 * 0.8) return [] // not converging
  // Price must have respected the lines.
  let outside = 0
  for (let i = start; i <= lastPiv; i++) {
    if (c[i].close > up.at(i) * (1 + tol / 2) || c[i].close < lo.at(i) * (1 - tol / 2)) outside++
  }
  if (outside / (lastPiv - start + 1) > 0.15) return []

  const flat = tol
  let name = ''
  let bias: Bias = 'neutral'
  let category: Pattern['category'] = 'continuation'
  if (Math.abs(dH) <= flat && dL > flat) {
    name = 'Ascending Triangle'
    bias = 'bullish'
  } else if (Math.abs(dL) <= flat && dH < -flat) {
    name = 'Descending Triangle'
    bias = 'bearish'
  } else if (dH < -flat && dL > flat) {
    name = 'Symmetrical Triangle'
    bias = 'neutral'
    category = 'bilateral'
  } else if (dH > flat * 0.5 && dL > dH) {
    name = 'Rising Wedge'
    bias = 'bearish'
    category = 'reversal'
  } else if (dL < -flat * 0.5 && dH < dL) {
    name = 'Falling Wedge'
    bias = 'bullish'
    category = 'reversal'
  } else return []

  const upper = (i: number) => up.at(i)
  const lower = (i: number) => lo.at(i)
  const biUp = breakoutIndex(ctx, lastPiv, upper, 1)
  const biDn = breakoutIndex(ctx, lastPiv, lower, -1)
  const brokeUp = price > upper(end) * 1.003
  const brokeDn = price < lower(end) * 0.997
  let status: Pattern['status'] = 'forming'
  let effBias = bias
  if (bias === 'neutral') {
    if (brokeUp) (status = 'confirmed'), (effBias = 'bullish')
    else if (brokeDn) (status = 'confirmed'), (effBias = 'bearish')
    else {
      // Lean with the prior trend while undecided.
      const before = c[Math.max(0, start - 20)].close
      effBias = c[start].close >= before ? 'bullish' : 'bearish'
    }
  } else if (bias === 'bullish') status = brokeUp ? 'confirmed' : brokeDn ? 'failed' : 'forming'
  else status = brokeDn ? 'confirmed' : brokeUp ? 'failed' : 'forming'

  const bullSide = effBias === 'bullish'
  const entry = bullSide ? upper(end) * 1.003 : lower(end) * 0.997
  const stop = bullSide ? lower(end) * (1 - atr * 0.4) : upper(end) * (1 + atr * 0.4)
  const target = bullSide ? entry + w0 : Math.max(entry - w0, entry * 0.2)
  if (status === 'confirmed' && (bullSide ? price >= target : price <= target)) return []
  const vol = volConfirmed(ctx, bullSide ? biUp : biDn)
  const touches = highs.length + lows.length
  let conf = 45 + (touches - 4) * 6 + (1 - outside / (lastPiv - start + 1) / 0.15) * 10 + (vol ? 10 : 0) + (status === 'confirmed' ? 14 : 0)
  if (bias === 'neutral' && status === 'forming') conf -= 8
  if (status === 'failed') conf = 25

  const desc: Record<string, string> = {
    'Ascending Triangle': `Flat resistance near ${fmtPrice(upper(end))} with a series of higher lows. Buyers are getting more aggressive each dip — usually resolves upward.`,
    'Descending Triangle': `Flat support near ${fmtPrice(lower(end))} with a series of lower highs. Sellers keep pressing — usually resolves downward.`,
    'Symmetrical Triangle': `Lower highs and higher lows squeezing price into a narrowing range (${fmtPrice(lower(end))}–${fmtPrice(upper(end))}). Volatility is compressing; a breakout is coming but the direction isn't decided yet.`,
    'Rising Wedge': `Price is climbing, but the rises are getting smaller and lows are rising faster than highs. Momentum is fading — often breaks down.`,
    'Falling Wedge': `Price is falling, but each drop is smaller and highs are falling faster than lows. Selling pressure is fading — often breaks up.`,
  }
  let how = ''
  if (status === 'failed') how = `Price broke the wrong way — the pattern failed. Respect the new direction.`
  else if (bias === 'neutral' && status === 'forming')
    how = `Don't guess the direction. Buy only on a ${ctx.tfLabel} close above ${fmtPrice(upper(end))}; a close below ${fmtPrice(lower(end))} is a warning to stay out or sell.`
  else if (bullSide)
    how =
      status === 'confirmed'
        ? `Breakout confirmed. Buy on strength or on a retest of ${fmtPrice(upper(end))} from above. Stop ${fmtPrice(stop)}, target ${fmtPrice(target)}.`
        : `Place a breakout buy just above ${fmtPrice(entry)} (wait for a ${ctx.tfLabel} close above the upper line, ideally on higher volume). Stop ${fmtPrice(stop)}, target ${fmtPrice(target)}.`
  else
    how =
      status === 'confirmed'
        ? `Broke down. Avoid buying; if holding, consider selling. Target ${fmtPrice(target)}.`
        : `Avoid buying near the upper line. A close below ${fmtPrice(lower(end))} confirms weakness.`

  const col = biasColor(effBias)
  return [
    {
      id: `tri-${name}-${c[start].time}`,
      name,
      bias: effBias,
      category,
      status,
      confidence: Math.round(clamp(conf, 10, 90)),
      startTime: c[start].time,
      endTime: c[end].time,
      lines: [
        { points: [pt(ctx, start, upper(start)), pt(ctx, end, upper(end))], color: col },
        { points: [pt(ctx, start, lower(start)), pt(ctx, end, lower(end))], color: col },
      ],
      entry,
      stop,
      target,
      volumeConfirmed: vol,
      summary: desc[name],
      howToTrade: how,
    },
  ]
}

// ---------- Bull / bear flags ----------
function flags(ctx: Ctx): Pattern[] {
  const out: Pattern[] = []
  const { c, n, price, atr, tol } = ctx
  const p = PARAMS[ctx.tf]
  const minPole = Math.max(p.minPole, atr * 4)
  for (const kind of ['bull', 'bear'] as const) {
    let best: { s: number; pk: number; move: number } | null = null
    for (let pk = n - 4; pk >= Math.max(p.poleLen, n - 1 - p.consMax); pk--) {
      const seg = c.slice(pk - p.poleLen, pk + 1)
      if (kind === 'bull') {
        let s = pk - p.poleLen
        seg.forEach((x, j) => x.low < c[s].low && (s = pk - p.poleLen + j))
        const move = (c[pk].high - c[s].low) / c[s].low
        if (move < minPole || Math.max(...c.slice(s, pk + 1).map((x) => x.high)) > c[pk].high) continue
        if (!best || move > best.move) best = { s, pk, move }
      } else {
        let s = pk - p.poleLen
        seg.forEach((x, j) => x.high > c[s].high && (s = pk - p.poleLen + j))
        const move = (c[s].high - c[pk].low) / c[s].high
        if (move < minPole || Math.min(...c.slice(s, pk + 1).map((x) => x.low)) < c[pk].low) continue
        if (!best || move > best.move) best = { s, pk, move }
      }
    }
    if (!best) continue
    const { s, pk } = best
    const cons = c.slice(pk + 1, n - 1)
    if (cons.length < 2) continue
    const bull = kind === 'bull'
    const poleH = bull ? c[pk].high - c[s].low : c[s].high - c[pk].low
    const upL = fitLine(c.slice(pk, n - 1).map((x, j) => ({ x: pk + j, y: x.high })))
    const loL = fitLine(c.slice(pk + 1, n - 1).map((x, j) => ({ x: pk + 1 + j, y: x.low })))
    const consLow = Math.min(...cons.map((x) => x.low))
    const consHigh = Math.max(...cons.map((x) => x.high))
    const retrace = bull ? (c[pk].high - consLow) / poleH : (consHigh - c[pk].low) / poleH
    if (retrace > 0.5 || retrace < 0.05) continue
    const drift = ((upL.at(n - 2) - upL.at(pk)) / price) * (bull ? 1 : -1)
    if (drift > tol * 0.5) continue // flag should drift against the pole
    const upperNow = upL.at(n - 1)
    const lowerNow = loL.at(n - 1)
    if (upperNow <= lowerNow) continue
    let status: Pattern['status'] = 'forming'
    if (bull) status = price > upperNow * 1.003 ? 'confirmed' : price < lowerNow * 0.997 ? 'failed' : 'forming'
    else status = price < lowerNow * 0.997 ? 'confirmed' : price > upperNow * 1.003 ? 'failed' : 'forming'
    const entry = bull ? upperNow * 1.003 : lowerNow * 0.997
    const stop = bull ? lowerNow * (1 - atr * 0.4) : upperNow * (1 + atr * 0.4)
    const target = bull ? entry + poleH : Math.max(entry - poleH, entry * 0.2)
    const vol = status === 'confirmed' && volConfirmed(ctx, n - 1)
    const consVolDown = avgVol(c, n - 1, cons.length) < avgVol(c, pk + 1, pk - s + 1)
    let conf = 50 + Math.min(best.move / minPole - 1, 1) * 10 + (consVolDown ? 8 : 0) + (vol ? 8 : 0) + (status === 'confirmed' ? 12 : 0)
    if (status === 'failed') conf = 25
    const bias: Bias = bull ? 'bullish' : 'bearish'
    const col = biasColor(bias)
    out.push({
      id: `flag-${kind}-${c[s].time}`,
      name: bull ? 'Bull Flag' : 'Bear Flag',
      bias,
      category: 'continuation',
      status,
      confidence: Math.round(clamp(conf, 10, 88)),
      startTime: c[s].time,
      endTime: c[n - 1].time,
      lines: [
        { points: [pt(ctx, s, bull ? c[s].low : c[s].high), pt(ctx, pk, bull ? c[pk].high : c[pk].low)], color: col },
        { points: [pt(ctx, pk, upL.at(pk)), pt(ctx, n - 1, upperNow)], color: col, dashed: true },
        { points: [pt(ctx, pk + 1, loL.at(pk + 1)), pt(ctx, n - 1, lowerNow)], color: col, dashed: true },
      ],
      entry,
      stop,
      target,
      volumeConfirmed: vol,
      summary: bull
        ? `A sharp ${(best.move * 100).toFixed(0)}% rally (the "pole") followed by a tight, slightly downward pause (the "flag").${consVolDown ? ' Volume cooled during the pause, as it should.' : ''} Trend continuation is the usual outcome.`
        : `A sharp ${(best.move * 100).toFixed(0)}% drop (the "pole") followed by a weak, slightly upward bounce (the "flag"). The downtrend often resumes.`,
      howToTrade: bull
        ? status === 'confirmed'
          ? `Flag breakout underway. Buy while price holds above ${fmtPrice(upperNow)}. Stop ${fmtPrice(stop)}, target ${fmtPrice(target)} (pole height projected).`
          : status === 'failed'
            ? `Price fell out the bottom of the flag — momentum is gone. Stand aside.`
            : `Set a breakout buy just above ${fmtPrice(entry)}. Stop below the flag at ${fmtPrice(stop)}. Target ${fmtPrice(target)}.`
        : status === 'confirmed'
          ? `Bear flag broke down — avoid buying. If holding, consider selling.`
          : status === 'failed'
            ? `Price broke up out of the flag — bearish setup failed.`
            : `Avoid buying this bounce. A close below ${fmtPrice(lowerNow)} likely continues the drop.`,
    })
  }
  return out
}

// ---------- Cup & handle ----------
function cupHandle(ctx: Ctx): Pattern[] {
  const { piv, c, n, price, tol, atr } = ctx
  const p = PARAMS[ctx.tf]
  const highs = piv.filter((x) => x.type === 'H' && x.i >= n - p.cupWindow)
  const R = [...highs].reverse().find((h) => h.i >= n - 1 - p.maxAge && n - 1 - h.i >= 2)
  if (!R) return []
  const L = [...highs].reverse().find((h) => h.i <= R.i - p.cupMin && Math.abs(h.price - R.price) / Math.max(h.price, R.price) <= 2 * tol)
  if (!L) return []
  const rim = Math.min(L.price, R.price)
  const inner = c.slice(L.i + 1, R.i)
  if (inner.some((x) => x.high > Math.max(L.price, R.price) * (1 + tol / 2))) return []
  let bi = L.i + 1
  inner.forEach((x, j) => x.low < c[bi].low && (bi = L.i + 1 + j))
  const B = c[bi].low
  const depth = (rim - B) / rim
  if (depth < p.minDepth || depth > 0.5) return []
  const pos = (bi - L.i) / (R.i - L.i)
  if (pos < 0.25 || pos > 0.75) return []
  const lowZone = B + (rim - B) * 0.25
  if (inner.filter((x) => x.low <= lowZone).length < inner.length * 0.15) return [] // V not U
  const handle = c.slice(R.i + 1)
  const hLow = Math.min(...handle.map((x) => x.low))
  const hDepth = (R.price - hLow) / (R.price - B)
  const brokeOut = price > R.price * 1.003
  if (!brokeOut && (hDepth > 0.5 || hDepth < 0.05)) return []
  let status: Pattern['status'] = brokeOut ? 'confirmed' : 'forming'
  if (price < B + (R.price - B) * 0.5) status = 'failed'
  const entry = R.price * 1.003
  const target = R.price + (R.price - B)
  if (status === 'confirmed' && price >= target) return []
  const stop = hLow * (1 - atr * 0.4)
  const vol = brokeOut && volConfirmed(ctx, breakoutIndex(ctx, R.i, () => R.price, 1))
  let conf = 55 + (1 - Math.abs(pos - 0.5) * 2) * 10 + (vol ? 10 : 0) + (status === 'confirmed' ? 12 : 0)
  if (status === 'failed') conf = 25
  return [
    {
      id: `cup-${L.time}`,
      name: 'Cup & Handle',
      bias: 'bullish',
      category: 'continuation',
      status,
      confidence: Math.round(clamp(conf, 10, 90)),
      startTime: L.time,
      endTime: c[n - 1].time,
      lines: [
        { points: [pt(ctx, L.i, L.price), pt(ctx, bi, B), pt(ctx, R.i, R.price), pt(ctx, n - 1, price)], color: COLORS.bull },
        hLine(ctx, L.i, R.price),
      ],
      entry,
      stop,
      target,
      volumeConfirmed: vol,
      summary: `A rounded "U" bottom (${(depth * 100).toFixed(0)}% deep) back up to the ${fmtPrice(R.price)} rim, followed by a small pullback "handle". Shows patient accumulation — a bullish continuation pattern.`,
      howToTrade:
        status === 'confirmed'
          ? `Rim breakout confirmed. Buy on a hold above ${fmtPrice(R.price)}. Stop ${fmtPrice(stop)}, target ${fmtPrice(target)}.`
          : status === 'failed'
            ? `The handle dropped too deep — pattern failed.`
            : `Buy on a ${ctx.tfLabel} close above the ${fmtPrice(R.price)} rim. Stop below the handle low at ${fmtPrice(stop)}. Target ${fmtPrice(target)}.`,
    },
  ]
}

// ---------- Support & resistance ----------
function levels(ctx: Ctx): Level[] {
  const { piv, price, tol } = ctx
  const clusters: { sum: number; n: number }[] = []
  for (const p of piv) {
    const cl = clusters.find((k) => Math.abs(k.sum / k.n - p.price) / p.price <= tol)
    if (cl) (cl.sum += p.price), cl.n++
    else clusters.push({ sum: p.price, n: 1 })
  }
  const lv = clusters.map((k) => ({ price: k.sum / k.n, touches: k.n }))
  const sup = lv.filter((l) => l.price < price * 0.995).sort((a, b) => b.price - a.price)
  const res = lv.filter((l) => l.price > price * 1.005).sort((a, b) => a.price - b.price)
  const pick = (arr: typeof lv) => {
    const strong = arr.filter((l) => l.touches >= 2)
    return (strong.length >= 2 ? strong : arr).slice(0, 3)
  }
  return [
    ...pick(sup).map((l) => ({ ...l, kind: 'support' as const })),
    ...pick(res).map((l) => ({ ...l, kind: 'resistance' as const })),
  ]
}

// ---------- Plan synthesis ----------
function buildPlan(ctx: Ctx, pats: Pattern[], lv: Level[], ind: Indicators): Plan {
  const { price, tfLabel } = ctx
  const reasons: string[] = []
  let score = 0
  for (const p of pats) {
    const w = (p.confidence / 100) * (p.status === 'confirmed' ? 2 : 1)
    if (p.status === 'failed') score += p.bias === 'bullish' ? -0.4 : p.bias === 'bearish' ? 0.4 : 0
    else score += p.bias === 'bullish' ? w : p.bias === 'bearish' ? -w : 0
    reasons.push(`${p.name} (${p.status}, ${p.confidence}% confidence) — ${p.bias}`)
  }
  if (ind.trend === 'up') (score += 0.6), reasons.push('Trend is up: price above its 20 & 50-period averages')
  if (ind.trend === 'down') (score -= 0.6), reasons.push('Trend is down: price below its 20 & 50-period averages')
  if (ind.rsi != null) {
    if (ind.rsi < 30) (score += 0.4), reasons.push(`RSI ${ind.rsi.toFixed(0)} — oversold, bounce potential`)
    else if (ind.rsi > 70) (score -= 0.4), reasons.push(`RSI ${ind.rsi.toFixed(0)} — overbought, chasing is risky`)
    else reasons.push(`RSI ${ind.rsi.toFixed(0)} — neutral momentum`)
  }
  if (ind.volumeRatio != null && ind.volumeRatio > 1.3) reasons.push(`Volume is ${ind.volumeRatio.toFixed(1)}× its recent average`)

  const support = lv.find((l) => l.kind === 'support')
  const resistance = lv.find((l) => l.kind === 'resistance')
  const rr = (e: number, s: number, t: number) => (e - s > 0 ? (t - e) / (e - s) : null)
  const bull = pats
    .filter((p) => p.bias === 'bullish' && p.status !== 'failed' && p.target > price)
    .sort((a, b) => b.confidence + (b.status === 'confirmed' ? 10 : 0) - (a.confidence + (a.status === 'confirmed' ? 10 : 0)))[0]

  const base = { reasons, score: Math.round(score * 100) / 100 }

  if (bull && bull.status === 'confirmed' && score >= 1) {
    if (price <= bull.entry * 1.04) {
      return {
        ...base,
        verdict: 'strong-buy',
        headline: `${bull.name} breakout confirmed — buy zone is now`,
        when: `Now, while price holds above ${fmtPrice(bull.entry / 1.003)}. Skip it if a ${tfLabel} candle closes back below that level.`,
        where: `Around ${fmtPrice(price)} — don't chase above ${fmtPrice(bull.entry * 1.04)}.`,
        entry: price,
        stop: bull.stop,
        target: bull.target,
        orderType: 'market',
        riskReward: rr(price, bull.stop, bull.target),
      }
    }
    const retest = bull.entry / 1.003
    return {
      ...base,
      verdict: 'buy-dip',
      headline: `${bull.name} broke out, but price is stretched — wait for a retest`,
      when: `On a pullback to the old breakout level. Broken resistance often turns into support.`,
      where: `Limit buy near ${fmtPrice(retest)}.`,
      entry: retest,
      stop: bull.stop,
      target: bull.target,
      orderType: 'limit',
      riskReward: rr(retest, bull.stop, bull.target),
    }
  }
  if (bull && bull.status === 'forming' && score > 0) {
    return {
      ...base,
      verdict: 'buy-breakout',
      headline: `${bull.name} forming — buy the breakout, not before`,
      when: `When a ${tfLabel} candle closes above ${fmtPrice(bull.entry)}, ideally on above-average volume. Until then the pattern isn't confirmed.`,
      where: `Breakout (stop) buy order at ${fmtPrice(bull.entry)}.`,
      entry: bull.entry,
      stop: bull.stop,
      target: bull.target,
      orderType: 'stop',
      riskReward: rr(bull.entry, bull.stop, bull.target),
    }
  }
  if (score > -0.5 && support && (ind.rsi == null || ind.rsi < 62)) {
    const entry = support.price * 1.01
    const stop = support.price * (1 - Math.max(ctx.atr, 0.02))
    const target = resistance ? resistance.price : entry * (1 + (entry - stop) / entry * 2)
    const r = rr(entry, stop, target)
    if (r != null && r >= 1.5 && entry < price) {
      return {
        ...base,
        verdict: 'buy-dip',
        headline: 'No clear pattern breakout — buy dips into support',
        when: `If price pulls back to the ${fmtPrice(support.price)} support zone (tested ${support.touches}×) and holds.`,
        where: `Limit buy near ${fmtPrice(entry)}.`,
        entry,
        stop,
        target,
        orderType: 'limit',
        riskReward: r,
      }
    }
  }
  if (score <= -1.2) {
    return {
      ...base,
      verdict: 'avoid',
      headline: 'Bearish setup — avoid buying for now',
      when: `Not now. Wait for the bearish pattern to fail or a new base to form${support ? ` near ${fmtPrice(support.price)}` : ''}.`,
      where: support ? `If you must, only near strong support at ${fmtPrice(support.price)}, with a tight stop.` : 'No safe buy zone identified.',
      entry: null,
      stop: null,
      target: null,
      orderType: 'limit',
      riskReward: null,
    }
  }
  if (score < -0.3) {
    return {
      ...base,
      verdict: 'caution',
      headline: 'Mixed-to-bearish signals — be careful',
      when: 'Wait for a bullish pattern to confirm or for price to reclaim its moving averages.',
      where: support ? `Watch the ${fmtPrice(support.price)} support zone.` : 'No clear buy zone yet.',
      entry: null,
      stop: null,
      target: null,
      orderType: 'limit',
      riskReward: null,
    }
  }
  return {
    ...base,
    verdict: 'wait',
    headline: 'No high-quality setup — patience is a position',
    when: resistance ? `A ${tfLabel} close above ${fmtPrice(resistance.price)} resistance would be a bullish trigger.` : 'Wait for a pattern to form.',
    where: support ? `Better value near ${fmtPrice(support.price)} support.` : 'No clear buy zone yet.',
    entry: null,
    stop: null,
    target: null,
    orderType: 'limit',
    riskReward: null,
  }
}

export function analyze(candles: Candle[], tf: Timeframe): Analysis {
  const p = PARAMS[tf]
  const c = candles
  const n = c.length
  const closes = c.map((x) => x.close)
  const rs = rsi(closes, 14)
  const s20 = sma(closes, 20)
  const s50 = sma(closes, 50)
  const price = closes[n - 1] ?? 0
  const atr = atrPct(c)
  const ind: Indicators = {
    rsi: rs[n - 1] ?? null,
    sma20: s20[n - 1] ?? null,
    sma50: s50[n - 1] ?? null,
    atrPct: atr,
    trend: 'sideways',
    volumeRatio: null,
  }
  if (ind.sma20 && ind.sma50) {
    if (price > ind.sma20 && ind.sma20 > ind.sma50) ind.trend = 'up'
    else if (price < ind.sma20 && ind.sma20 < ind.sma50) ind.trend = 'down'
  }
  const av = avgVol(c, n - 1, 30)
  if (av > 0) ind.volumeRatio = c[n - 1].volume / av

  if (n < 30) {
    const ctx0 = { c, n, price, atr, tol: 0.02, piv: [], rsi: rs, recent: 0, tf, tfLabel: tfLabel(tf) } as Ctx
    return { patterns: [], levels: [], indicators: ind, plan: buildPlan(ctx0, [], [], ind) }
  }
  const allPiv = pivots(c, p.w).filter((x) => x.i >= n - p.lookback)
  const ctx: Ctx = {
    c,
    n,
    price,
    atr,
    tol: clamp(atr * 1.2, 0.012, 0.06),
    piv: allPiv,
    rsi: rs,
    recent: n - 1 - p.maxAge,
    tf,
    tfLabel: tfLabel(tf),
  }
  let pats = [...headShoulders(ctx), ...doubles(ctx), ...trianglesWedges(ctx), ...flags(ctx), ...cupHandle(ctx)]
  // Flat highs with rising lows is a triangle, not a double top (and vice versa).
  const has = (name: string) => pats.some((x) => x.name === name && x.status !== 'failed')
  if (has('Ascending Triangle')) pats = pats.filter((x) => x.name !== 'Double Top (M)')
  if (has('Descending Triangle')) pats = pats.filter((x) => x.name !== 'Double Bottom (W)')
  // Keep the strongest per name; sort by actionable confidence.
  const byName = new Map<string, Pattern>()
  for (const x of pats) if (!byName.has(x.name) || byName.get(x.name)!.confidence < x.confidence) byName.set(x.name, x)
  const patterns = [...byName.values()].sort((a, b) => (a.status === 'failed' ? 1 : 0) - (b.status === 'failed' ? 1 : 0) || b.confidence - a.confidence)
  const lv = levels(ctx)
  return { patterns, levels: lv, indicators: ind, plan: buildPlan(ctx, patterns, lv, ind) }
}

export const VERDICT_META: Record<Plan['verdict'], { label: string; tone: 'bull' | 'bear' | 'neutral' | 'warn' }> = {
  'strong-buy': { label: 'Buy setup', tone: 'bull' },
  'buy-breakout': { label: 'Buy on breakout', tone: 'bull' },
  'buy-dip': { label: 'Buy the dip', tone: 'bull' },
  wait: { label: 'Wait', tone: 'neutral' },
  caution: { label: 'Caution', tone: 'warn' },
  avoid: { label: 'Avoid', tone: 'bear' },
}

/** Short field guide shown on coin pages. */
export const PATTERN_GUIDE: { name: string; bias: Bias; tip: string }[] = [
  { name: 'Double Bottom (W)', bias: 'bullish', tip: 'Two similar lows with a peak between. Buy the close above that peak (neckline).' },
  { name: 'Inverse Head & Shoulders', bias: 'bullish', tip: 'Three lows, middle deepest. Buy the neckline breakout; target = head depth.' },
  { name: 'Ascending Triangle', bias: 'bullish', tip: 'Flat top, rising lows. Buy the break of the flat top.' },
  { name: 'Falling Wedge', bias: 'bullish', tip: 'Converging downward lines. Breaks up more often than not.' },
  { name: 'Bull Flag', bias: 'bullish', tip: 'Sharp rally then tight pause. Buy the flag breakout; target = pole height.' },
  { name: 'Cup & Handle', bias: 'bullish', tip: 'Rounded bottom + small dip. Buy the rim breakout.' },
  { name: 'Symmetrical Triangle', bias: 'neutral', tip: 'Converging lines. Trade the breakout direction, not a guess.' },
  { name: 'Double Top (M)', bias: 'bearish', tip: 'Two similar highs. A break of the trough between confirms a reversal.' },
  { name: 'Head & Shoulders', bias: 'bearish', tip: 'Three peaks, middle highest. Neckline break = trend change down.' },
  { name: 'Descending Triangle', bias: 'bearish', tip: 'Flat bottom, falling highs. Usually breaks down.' },
  { name: 'Rising Wedge', bias: 'bearish', tip: 'Converging upward lines with fading momentum. Often breaks down.' },
  { name: 'Bear Flag', bias: 'bearish', tip: 'Sharp drop then weak bounce. The drop usually resumes.' },
]
