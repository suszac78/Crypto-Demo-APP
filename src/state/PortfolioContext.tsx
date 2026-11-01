import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Coin, FundsEvent, Order, Position, Trade } from '../lib/types'
import { displayCurrency, fmtPrice, fmtQty, fmtMoney, uid } from '../lib/format'
import { load, save } from './storage'
import { useMarket } from './MarketContext'
import { useToast } from './ToastContext'

export interface Account {
  cash: number
  netDeposits: number
  positions: Record<string, Position>
  orders: Order[]
  trades: Trade[]
  funds: FundsEvent[]
  equityHistory: { t: number; v: number }[]
  /** Currency every money amount in this account is stored in. */
  currency: string
}

const START = 10_000
const fresh = (cash = START, currency = 'usd'): Account => ({
  currency,
  cash,
  netDeposits: cash,
  positions: {},
  orders: [],
  trades: [],
  funds: [{ id: uid(), amount: cash, time: Date.now(), note: 'Starting balance' }],
  equityHistory: [],
})

/** Re-express every money amount in the account in another currency. */
function convertAccount(a: Account, rate: number, currency: string): Account {
  const m = (v: number | undefined) => (v == null ? v : v * rate)
  const positions: Record<string, Position> = {}
  for (const [k, p] of Object.entries(a.positions)) positions[k] = { ...p, avgCost: p.avgCost * rate, stopLoss: m(p.stopLoss), takeProfit: m(p.takeProfit) }
  return {
    ...a,
    currency,
    cash: a.cash * rate,
    netDeposits: a.netDeposits * rate,
    positions,
    orders: a.orders.map((o) => ({ ...o, triggerPrice: o.triggerPrice * rate, usdAmount: m(o.usdAmount), stopLoss: m(o.stopLoss), takeProfit: m(o.takeProfit) })),
    trades: a.trades.map((t) => ({ ...t, price: t.price * rate, fee: t.fee * rate, total: t.total * rate, realizedPnl: m(t.realizedPnl) })),
    funds: a.funds.map((f) => ({ ...f, amount: f.amount * rate })),
    equityHistory: a.equityHistory.map((e) => ({ ...e, v: e.v * rate })),
  }
}

type Result = { ok: true; msg: string } | { ok: false; msg: string }

interface PortfolioState {
  acct: Account
  equity: number
  holdingsValue: number
  reservedCash: number
  availableCash: number
  pnl: number
  pnlPct: number
  buy: (coin: Coin, usd: number, exits?: { stopLoss?: number; takeProfit?: number }) => Result
  sell: (coin: Coin, qty: number) => Result
  placeOrder: (o: Omit<Order, 'id' | 'createdAt'>, coin: Coin) => Result
  cancelOrder: (id: string) => void
  setExits: (coinId: string, exits: { stopLoss?: number; takeProfit?: number }) => void
  adjustCash: (amount: number, note?: string) => Result
  setCash: (value: number) => Result
  reset: (cash: number) => void
}

const Ctx = createContext<PortfolioState | null>(null)

function coinMeta(c: Coin) {
  return { coinId: c.id, symbol: c.symbol, name: c.name, image: c.image }
}

/** Pure trade helpers — return a new account or an error string. */
function doBuy(a: Account, coin: Coin, usd: number, price: number, feePct: number, reason: string): { a: Account; trade: Trade } | string {
  if (!(usd > 0)) return 'Enter an amount greater than $0.'
  if (usd > a.cash + 1e-9) return `Not enough cash. You have ${fmtMoney(a.cash)}.`
  if (!(price > 0)) return 'No price available for this coin yet.'
  const fee = (usd * feePct) / 100
  const qty = (usd - fee) / price
  const pos = a.positions[coin.id]
  const newQty = (pos?.qty ?? 0) + qty
  // Average cost includes fees so P&L reflects what you actually paid.
  const avgCost = ((pos ? pos.qty * pos.avgCost : 0) + usd) / newQty
  const trade: Trade = { id: uid(), ...coinMeta(coin), side: 'buy', qty, price, fee, total: usd, reason, time: Date.now() }
  return {
    a: { ...a, cash: a.cash - usd, positions: { ...a.positions, [coin.id]: { ...(pos ?? coinMeta(coin)), ...coinMeta(coin), qty: newQty, avgCost } }, trades: [trade, ...a.trades].slice(0, 1000) },
    trade,
  }
}

function doSell(a: Account, coin: Pick<Coin, 'id' | 'symbol' | 'name' | 'image'>, qty: number, price: number, feePct: number, reason: string): { a: Account; trade: Trade } | string {
  const pos = a.positions[coin.id]
  if (!pos || pos.qty <= 0) return `You don't hold any ${coin.symbol.toUpperCase()}.`
  if (!(qty > 0)) return 'Enter a quantity greater than 0.'
  const q = Math.min(qty, pos.qty)
  if (qty > pos.qty * 1.000001) return `You only hold ${fmtQty(pos.qty)} ${coin.symbol.toUpperCase()}.`
  const gross = q * price
  const fee = (gross * feePct) / 100
  const realizedPnl = gross - fee - q * pos.avgCost
  const positions = { ...a.positions }
  const left = pos.qty - q
  if (left * price < 0.005 || left / pos.qty < 1e-9) delete positions[coin.id]
  else positions[coin.id] = { ...pos, qty: left }
  const trade: Trade = { id: uid(), coinId: coin.id, symbol: coin.symbol, name: coin.name, image: coin.image, side: 'sell', qty: q, price, fee, total: gross - fee, realizedPnl, reason, time: Date.now() }
  // Drop this coin's pending sell orders if the position is gone.
  const orders = positions[coin.id] ? a.orders : a.orders.filter((o) => !(o.coinId === coin.id && o.side === 'sell'))
  return { a: { ...a, cash: a.cash + gross - fee, positions, orders, trades: [trade, ...a.trades].slice(0, 1000) }, trade }
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { byId, settings, onPrices, coins, currency, rate } = useMarket()
  const toast = useToast()
  const [acct, setAcctState] = useState<Account>(() => load('pd.account.v2', fresh()))
  const ref = useRef(acct)
  const feePct = settings.feePct

  const setAcct = useCallback((a: Account) => {
    ref.current = a
    setAcctState(a)
    save('pd.account.v2', a)
  }, [])

  const priceOf = useCallback((id: string) => byId.get(id)?.current_price ?? 0, [byId])

  /** Check pending orders and stop-loss / take-profit levels against fresh prices. */
  const process = useCallback(
    (list: Coin[], cur: string) => {
      const map = new Map(list.map((c) => [c.id, c]))
      let a = ref.current
      const notes: { title: string; body: string; tone: 'bull' | 'bear' | 'info' }[] = []
      // Prices now arrive in a different currency: convert the account first so every amount matches.
      if (a.currency !== cur) {
        const r = rate(a.currency, cur)
        const from = a.currency
        a = convertAccount(a, r, cur)
        notes.push({ title: `Switched to ${cur.toUpperCase()}`, body: `Account converted from ${from.toUpperCase()} at 1 ${from.toUpperCase()} = ${r.toPrecision(5)} ${cur.toUpperCase()}`, tone: 'info' })
      }
      const remaining: Order[] = []
      for (const o of a.orders) {
        const coin = map.get(o.coinId)
        const px = coin?.current_price
        if (!coin || !px) {
          remaining.push(o)
          continue
        }
        const hit =
          o.side === 'buy' ? (o.type === 'limit' ? px <= o.triggerPrice : px >= o.triggerPrice) : o.type === 'limit' ? px >= o.triggerPrice : px <= o.triggerPrice
        if (!hit) {
          remaining.push(o)
          continue
        }
        const label = `${o.type === 'limit' ? 'Limit' : 'Stop'} ${o.side}`
        const r =
          o.side === 'buy'
            ? doBuy({ ...a, orders: remaining }, coin, Math.min(o.usdAmount ?? 0, a.cash), px, feePct, `${label} filled`)
            : doSell({ ...a, orders: remaining }, coin, o.qty ?? 0, px, feePct, `${label} filled`)
        if (typeof r === 'string') {
          notes.push({ title: `${label} cancelled`, body: `${coin.symbol.toUpperCase()}: ${r}`, tone: 'info' })
          continue
        }
        a = r.a
        if (o.side === 'buy' && (o.stopLoss || o.takeProfit)) {
          const p = a.positions[coin.id]
          if (p) a = { ...a, positions: { ...a.positions, [coin.id]: { ...p, stopLoss: o.stopLoss ?? p.stopLoss, takeProfit: o.takeProfit ?? p.takeProfit } } }
        }
        notes.push({ title: `${label} filled`, body: `${fmtQty(r.trade.qty)} ${coin.symbol.toUpperCase()} @ ${fmtPrice(px)}`, tone: o.side === 'buy' ? 'bull' : 'info' })
      }
      // Unfilled orders stay; sell orders for coins no longer held are dropped.
      a = { ...a, orders: remaining.filter((o) => o.side === 'buy' || a.positions[o.coinId]) }

      for (const pos of Object.values(a.positions)) {
        const px = map.get(pos.coinId)?.current_price
        if (!px) continue
        let reason = ''
        if (pos.stopLoss && px <= pos.stopLoss) reason = 'Stop-loss hit'
        else if (pos.takeProfit && px >= pos.takeProfit) reason = 'Take-profit hit'
        if (!reason) continue
        const r = doSell(a, { id: pos.coinId, symbol: pos.symbol, name: pos.name, image: pos.image }, pos.qty, px, feePct, reason)
        if (typeof r === 'string') continue
        a = r.a
        notes.push({ title: reason, body: `Sold ${fmtQty(r.trade.qty)} ${pos.symbol.toUpperCase()} @ ${fmtPrice(px)} (${fmtMoney(r.trade.realizedPnl, { sign: true })})`, tone: reason.startsWith('Stop') ? 'bear' : 'bull' })
      }

      // P&L snapshot for the portfolio chart.
      const hv = Object.values(a.positions).reduce((s, p) => s + p.qty * (map.get(p.coinId)?.current_price ?? p.avgCost), 0)
      // Track trading P&L (not raw equity) so deposits/withdrawals don't distort the curve.
      const hist = [...a.equityHistory, { t: Date.now(), v: a.cash + hv - a.netDeposits }].slice(-600)
      a = { ...a, equityHistory: hist }
      setAcct(a)
      notes.forEach((n) => toast(n))
    },
    [feePct, setAcct, toast, rate],
  )

  useEffect(() => onPrices(process), [onPrices, process])

  const buy: PortfolioState['buy'] = (coin, usd, exits) => {
    const r = doBuy(ref.current, coin, usd, priceOf(coin.id) || coin.current_price, feePct, 'Market buy')
    if (typeof r === 'string') return { ok: false, msg: r }
    let a = r.a
    if (exits && (exits.stopLoss || exits.takeProfit)) {
      const p = a.positions[coin.id]
      a = { ...a, positions: { ...a.positions, [coin.id]: { ...p, ...exits } } }
    }
    setAcct(a)
    return { ok: true, msg: `Bought ${fmtQty(r.trade.qty)} ${coin.symbol.toUpperCase()} @ ${fmtPrice(r.trade.price)}` }
  }

  const sell: PortfolioState['sell'] = (coin, qty) => {
    const r = doSell(ref.current, coin, qty, priceOf(coin.id) || coin.current_price, feePct, 'Market sell')
    if (typeof r === 'string') return { ok: false, msg: r }
    setAcct(r.a)
    const pnl = r.trade.realizedPnl ?? 0
    return { ok: true, msg: `Sold ${fmtQty(r.trade.qty)} ${coin.symbol.toUpperCase()} @ ${fmtPrice(r.trade.price)} · P&L ${fmtMoney(pnl, { sign: true })}` }
  }

  const reservedCash = acct.orders.filter((o) => o.side === 'buy').reduce((s, o) => s + (o.usdAmount ?? 0), 0)

  const placeOrder: PortfolioState['placeOrder'] = (o, coin) => {
    if (!(o.triggerPrice > 0)) return { ok: false, msg: 'Enter a trigger price.' }
    const a = ref.current
    const reserved = a.orders.filter((x) => x.side === 'buy').reduce((s, x) => s + (x.usdAmount ?? 0), 0)
    if (o.side === 'buy' && !((o.usdAmount ?? 0) > 0)) return { ok: false, msg: 'Enter an amount greater than $0.' }
    if (o.side === 'buy' && (o.usdAmount ?? 0) > a.cash - reserved + 1e-9) return { ok: false, msg: `Not enough free cash (${fmtMoney(a.cash - reserved)} after open orders).` }
    if (o.side === 'sell') {
      const pos = a.positions[o.coinId]
      if (!pos) return { ok: false, msg: `You don't hold any ${o.symbol.toUpperCase()}.` }
      if (!((o.qty ?? 0) > 0) || (o.qty ?? 0) > pos.qty * 1.000001) return { ok: false, msg: `Quantity must be between 0 and ${fmtQty(pos.qty)}.` }
    }
    const order: Order = { ...o, id: uid(), createdAt: Date.now() }
    setAcct({ ...a, orders: [order, ...a.orders] })
    // If the condition is already met, it fills right away.
    setTimeout(() => process(coins.length ? coins : [coin], currency), 0)
    return { ok: true, msg: `${o.type === 'limit' ? 'Limit' : 'Stop'} ${o.side} placed at ${fmtPrice(o.triggerPrice)}` }
  }

  const cancelOrder = (id: string) => setAcct({ ...ref.current, orders: ref.current.orders.filter((o) => o.id !== id) })

  const setExits: PortfolioState['setExits'] = (coinId, exits) => {
    const a = ref.current
    const p = a.positions[coinId]
    if (!p) return
    setAcct({ ...a, positions: { ...a.positions, [coinId]: { ...p, stopLoss: exits.stopLoss || undefined, takeProfit: exits.takeProfit || undefined } } })
  }

  const adjustCash: PortfolioState['adjustCash'] = (amount, note) => {
    const a = ref.current
    if (!isFinite(amount) || amount === 0) return { ok: false, msg: 'Enter an amount.' }
    if (a.cash + amount < 0) return { ok: false, msg: `You can withdraw at most ${fmtMoney(a.cash)}.` }
    setAcct({
      ...a,
      cash: a.cash + amount,
      netDeposits: a.netDeposits + amount,
      funds: [{ id: uid(), amount, time: Date.now(), note: note ?? (amount > 0 ? 'Added funds' : 'Withdrew funds') }, ...a.funds].slice(0, 200),
    })
    return { ok: true, msg: `${amount > 0 ? 'Added' : 'Withdrew'} ${fmtMoney(Math.abs(amount))}` }
  }

  const setCash: PortfolioState['setCash'] = (value) => {
    if (!isFinite(value) || value < 0) return { ok: false, msg: 'Enter a balance of $0 or more.' }
    const diff = value - ref.current.cash
    if (Math.abs(diff) < 0.005) return { ok: true, msg: 'Balance unchanged' }
    const r = adjustCash(diff, `Set cash to ${fmtMoney(value)}`)
    return r.ok ? { ok: true, msg: `Cash balance set to ${fmtMoney(value)}` } : r
  }

  const reset = (cash: number) => setAcct(fresh(cash, displayCurrency()))

  const holdingsValue = useMemo(() => Object.values(acct.positions).reduce((s, p) => s + p.qty * (priceOf(p.coinId) || p.avgCost), 0), [acct.positions, priceOf])
  const equity = acct.cash + holdingsValue
  const pnl = equity - acct.netDeposits
  const value: PortfolioState = {
    acct,
    equity,
    holdingsValue,
    reservedCash,
    availableCash: acct.cash - reservedCash,
    pnl,
    pnlPct: acct.netDeposits > 0 ? (pnl / acct.netDeposits) * 100 : 0,
    buy,
    sell,
    placeOrder,
    cancelOrder,
    setExits,
    adjustCash,
    setCash,
    reset,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePortfolio() {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePortfolio outside provider')
  return v
}
