export interface Coin {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  market_cap: number
  market_cap_rank: number
  total_volume: number
  high_24h: number | null
  low_24h: number | null
  price_change_percentage_24h: number | null
  price_change_percentage_1h_in_currency?: number | null
  price_change_percentage_24h_in_currency?: number | null
  price_change_percentage_7d_in_currency?: number | null
  circulating_supply: number | null
  ath: number | null
  sparkline_in_7d?: { price: number[] }
  last_updated?: string
}

export interface Candle {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number // rolling 24h volume at candle close
}

export interface ChartPoint {
  time: number
  value: number
}

export type Bias = 'bullish' | 'bearish' | 'neutral'
export type PatternStatus = 'forming' | 'confirmed' | 'failed'

export interface PatternLine {
  points: ChartPoint[]
  color: string
  dashed?: boolean
}

export interface Pattern {
  id: string
  name: string
  bias: Bias
  category: 'reversal' | 'continuation' | 'bilateral'
  status: PatternStatus
  confidence: number // 0-100
  startTime: number
  endTime: number
  lines: PatternLine[]
  entry: number
  stop: number
  target: number
  volumeConfirmed: boolean
  summary: string // what we found
  howToTrade: string // what to do with it
}

export interface Level {
  price: number
  touches: number
  kind: 'support' | 'resistance'
}

export interface Indicators {
  rsi: number | null
  sma20: number | null
  sma50: number | null
  atrPct: number
  trend: 'up' | 'down' | 'sideways'
  volumeRatio: number | null // last volume vs average
}

export type VerdictKey = 'strong-buy' | 'buy-breakout' | 'buy-dip' | 'wait' | 'caution' | 'avoid'

export interface Plan {
  verdict: VerdictKey
  headline: string
  when: string
  where: string
  entry: number | null
  stop: number | null
  target: number | null
  orderType: 'market' | 'limit' | 'stop'
  riskReward: number | null
  reasons: string[]
  score: number
}

export interface Analysis {
  patterns: Pattern[]
  levels: Level[]
  indicators: Indicators
  plan: Plan
}

export type OrderType = 'limit' | 'stop'
export type Side = 'buy' | 'sell'

export interface Order {
  id: string
  coinId: string
  symbol: string
  name: string
  image: string
  side: Side
  type: OrderType
  triggerPrice: number
  usdAmount?: number // for buys
  qty?: number // for sells
  stopLoss?: number
  takeProfit?: number
  createdAt: number
  note?: string
}

export interface Position {
  coinId: string
  symbol: string
  name: string
  image: string
  qty: number
  avgCost: number
  stopLoss?: number
  takeProfit?: number
}

export interface Trade {
  id: string
  coinId: string
  symbol: string
  name: string
  image: string
  side: Side
  qty: number
  price: number
  fee: number
  total: number // cash moved (positive number)
  realizedPnl?: number
  reason: string // "Market order", "Limit order filled", "Stop-loss hit" ...
  time: number
}

export interface FundsEvent {
  id: string
  amount: number // +deposit / -withdraw
  time: number
  note: string
}
