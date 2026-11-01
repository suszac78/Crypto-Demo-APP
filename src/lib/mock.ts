// Simulated market data, used when no CoinGecko key is set (or the API is unreachable).
// Deterministic per coin so charts look stable between refreshes.
import type { Coin } from './types'

const SEED_COINS: [string, string, string, number][] = [
  ['bitcoin', 'btc', 'Bitcoin', 68000],
  ['ethereum', 'eth', 'Ethereum', 3400],
  ['tether', 'usdt', 'Tether', 1],
  ['solana', 'sol', 'Solana', 165],
  ['binancecoin', 'bnb', 'BNB', 590],
  ['ripple', 'xrp', 'XRP', 0.62],
  ['usd-coin', 'usdc', 'USDC', 1],
  ['cardano', 'ada', 'Cardano', 0.45],
  ['dogecoin', 'doge', 'Dogecoin', 0.15],
  ['avalanche-2', 'avax', 'Avalanche', 34],
  ['tron', 'trx', 'TRON', 0.12],
  ['chainlink', 'link', 'Chainlink', 15.2],
  ['polkadot', 'dot', 'Polkadot', 6.8],
  ['shiba-inu', 'shib', 'Shiba Inu', 0.000022],
  ['litecoin', 'ltc', 'Litecoin', 82],
  ['near', 'near', 'NEAR Protocol', 5.6],
  ['uniswap', 'uni', 'Uniswap', 9.4],
  ['pepe', 'pepe', 'Pepe', 0.0000105],
  ['aptos', 'apt', 'Aptos', 8.9],
  ['stellar', 'xlm', 'Stellar', 0.11],
]

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed: number) {
  let s = seed || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

function gauss(r: () => number) {
  const u = Math.max(r(), 1e-9)
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function coinList(): [string, string, string, number][] {
  const list = [...SEED_COINS]
  const r = rng(42)
  const syll = ['zen', 'ko', 'ra', 'lux', 'vo', 'na', 'tri', 'qu', 'mi', 'sol', 'or', 'bit', 'ex', 'fi', 'ion', 'dex']
  let i = 0
  while (list.length < 500) {
    const name = syll[Math.floor(r() * syll.length)] + syll[Math.floor(r() * syll.length)] + syll[Math.floor(r() * syll.length)]
    const id = `${name}-${i++}`
    const price = Math.pow(10, r() * 6 - 4)
    list.push([id, name.slice(0, 4), name.charAt(0).toUpperCase() + name.slice(1), price])
  }
  return list
}

const LIST = coinList()

/** Hourly random walk for the last `hours`, ending at the coin's "now" price. */
export function mockSeries(id: string, hours: number, nowMs = Date.now()): { prices: [number, number][]; total_volumes: [number, number][] } {
  const base = LIST.find((c) => c[0] === id)?.[3] ?? 1
  const stable = id.includes('usd') || id === 'tether'
  const r = rng(hash(id))
  const hourMs = 3_600_000
  const end = Math.floor(nowMs / hourMs) * hourMs
  const vol = stable ? 0.0004 : 0.003 + r() * 0.006
  // Build returns with regime shifts so patterns appear.
  const rets: number[] = []
  let drift = 0
  for (let i = 0; i < hours; i++) {
    if (i % 120 === 0) drift = (r() - 0.5) * vol * 0.35
    rets.push(drift + gauss(r) * vol)
  }
  // Walk backwards from current price.
  const prices: [number, number][] = []
  const vols: [number, number][] = []
  let p = currentMockPrice(id, base, nowMs)
  const baseVol = base * (stable ? 5e9 : 1e6 + r() * 5e7)
  for (let i = hours - 1; i >= 0; i--) {
    const t = end - (hours - 1 - i) * hourMs
    prices.push([t, p])
    vols.push([t, (baseVol / base) * p * (0.6 + Math.abs(rets[i]) / vol * 0.4 + r() * 0.3)])
    p = p / Math.exp(rets[i])
    if (stable) p = 1 + (p - 1) * 0.5
  }
  prices.reverse()
  vols.reverse()
  return { prices, total_volumes: vols }
}

function currentMockPrice(id: string, base: number, nowMs: number): number {
  if (id.includes('usd') || id === 'tether') return 1 + Math.sin(nowMs / 1e7) * 0.0005
  // Slow deterministic wiggle so each 5-minute refresh moves the price a bit.
  const h = hash(id)
  const t = nowMs / 300_000
  const w = Math.sin(t * 0.37 + h) * 0.012 + Math.sin(t * 0.05 + h * 0.3) * 0.04
  return base * Math.exp(w)
}

export function mockMarkets(nowMs = Date.now()): Coin[] {
  return LIST.map(([id, symbol, name, base], idx) => {
    const series = mockSeries(id, 24 * 7, nowMs).prices.map((p) => p[1])
    const price = series[series.length - 1]
    const p24 = series[series.length - 25] ?? price
    const p1 = series[series.length - 2] ?? price
    const p7 = series[0]
    const last24 = series.slice(-24)
    const supply = (1e9 / Math.max(base, 0.0001)) * (1 / (idx + 1)) * 50
    return {
      id,
      symbol,
      name,
      image: '',
      current_price: price,
      market_cap: price * supply,
      market_cap_rank: idx + 1,
      total_volume: price * supply * 0.04,
      high_24h: Math.max(...last24),
      low_24h: Math.min(...last24),
      price_change_percentage_24h: ((price - p24) / p24) * 100,
      price_change_percentage_1h_in_currency: ((price - p1) / p1) * 100,
      price_change_percentage_24h_in_currency: ((price - p24) / p24) * 100,
      price_change_percentage_7d_in_currency: ((price - p7) / p7) * 100,
      circulating_supply: supply,
      ath: Math.max(...series) * 1.6,
      sparkline_in_7d: { price: series },
      last_updated: new Date(nowMs).toISOString(),
    }
  })
}
