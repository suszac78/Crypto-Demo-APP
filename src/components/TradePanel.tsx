import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Coin, OrderType, Side } from '../lib/types'
import { usePortfolio } from '../state/PortfolioContext'
import { useMarket } from '../state/MarketContext'
import { useToast } from '../state/ToastContext'
import { fmtPct, fmtPrice, fmtQty, fmtUsd } from '../lib/format'
import { Segmented } from './ui'

export interface TradePreset {
  side: Side
  type: 'market' | OrderType
  price?: number
  stop?: number
  target?: number
  nonce: number
}

const num = (s: string) => {
  const v = parseFloat(s.replace(/[$,\s]/g, ''))
  return isFinite(v) ? v : NaN
}
const priceStr = (p?: number | null) => (p == null || !isFinite(p) ? '' : String(Number(p.toPrecision(6))))

export function TradePanel({ coin, preset }: { coin: Coin; preset: TradePreset | null }) {
  const { acct, availableCash, buy, sell, placeOrder, cancelOrder, setExits } = usePortfolio()
  const { settings } = useMarket()
  const toast = useToast()
  const [side, setSide] = useState<Side>('buy')
  const [type, setType] = useState<'market' | OrderType>('market')
  const [trigger, setTrigger] = useState('')
  const [amount, setAmount] = useState('')
  const [sl, setSl] = useState('')
  const [tp, setTp] = useState('')
  const [showExits, setShowExits] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const pos = acct.positions[coin.id]
  const price = coin.current_price
  const fee = settings.feePct / 100

  useEffect(() => {
    if (!preset) return
    setSide(preset.side)
    setType(preset.type)
    setTrigger(priceStr(preset.price))
    setSl(priceStr(preset.stop))
    setTp(priceStr(preset.target))
    setShowExits(!!(preset.stop || preset.target))
    setMsg(null)
  }, [preset])

  useEffect(() => {
    setMsg(null)
    setAmount('')
  }, [coin.id])

  const execPrice = type === 'market' ? price : num(trigger) || price
  const amt = num(amount)
  const buyQty = amt > 0 ? (amt * (1 - fee)) / execPrice : 0
  const sellProceeds = amt > 0 ? amt * execPrice * (1 - fee) : 0

  const setPct = (p: number) => {
    if (side === 'buy') setAmount((Math.floor(availableCash * p * 100) / 100).toFixed(2))
    else if (pos) setAmount(String(p === 1 ? pos.qty : Number((pos.qty * p).toPrecision(8))))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const stopLoss = num(sl) > 0 ? num(sl) : undefined
    const takeProfit = num(tp) > 0 ? num(tp) : undefined
    if (side === 'buy' && stopLoss && stopLoss >= execPrice) return setMsg({ ok: false, text: 'Stop-loss must be below your buy price.' })
    if (side === 'buy' && takeProfit && takeProfit <= execPrice) return setMsg({ ok: false, text: 'Take-profit must be above your buy price.' })
    let r
    if (type === 'market') {
      r = side === 'buy' ? buy(coin, amt, { stopLoss, takeProfit }) : sell(coin, amt)
    } else {
      r = placeOrder(
        {
          coinId: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          image: coin.image,
          side,
          type,
          triggerPrice: num(trigger),
          usdAmount: side === 'buy' ? amt : undefined,
          qty: side === 'sell' ? amt : undefined,
          stopLoss: side === 'buy' ? stopLoss : undefined,
          takeProfit: side === 'buy' ? takeProfit : undefined,
        },
        coin,
      )
    }
    setMsg({ ok: r.ok, text: r.msg })
    if (r.ok) {
      setAmount('')
      toast({ title: r.msg, tone: side === 'buy' ? 'bull' : 'info' })
    }
  }

  const typeHint =
    type === 'limit'
      ? side === 'buy'
        ? 'Buys when the price drops to or below your price.'
        : 'Sells when the price rises to or above your price.'
      : type === 'stop'
        ? side === 'buy'
          ? 'Breakout buy: triggers when price rises to or above your price.'
          : 'Protective sell: triggers when price falls to or below your price.'
        : 'Fills immediately at the current price.'

  const orders = acct.orders.filter((o) => o.coinId === coin.id)
  const pnl = pos ? pos.qty * price - pos.qty * pos.avgCost : 0

  return (
    <div className="card trade">
      <div className="trade__tabs" role="tablist" aria-label="Buy or sell">
        {(['buy', 'sell'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'on' : ''} onClick={() => (setSide(s), setAmount(''), setMsg(null))}>
            {side === s && <motion.span layoutId="trade-tab" className="trade__tabbg" style={{ background: s === 'buy' ? 'var(--bull)' : 'var(--bear)' }} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Segmented
            full
            label="Order type"
            value={type}
            onChange={setType}
            options={[
              { value: 'market', label: 'Market' },
              { value: 'limit', label: 'Limit' },
              { value: 'stop', label: side === 'buy' ? 'Stop (breakout)' : 'Stop' },
            ]}
          />
          <p className="hint" style={{ margin: '8px 0 0' }}>{typeHint}</p>
        </div>

        <AnimatePresence initial={false}>
          {type !== 'market' && (
            <motion.div className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <label htmlFor="trigger">{type === 'limit' ? 'Limit price' : 'Trigger price'}</label>
              <div className="input-wrap">
                <input id="trigger" className="input" inputMode="decimal" placeholder={priceStr(price)} value={trigger} onChange={(e) => setTrigger(e.target.value)} />
                <span>USD</span>
              </div>
              {num(trigger) > 0 && <span className="hint" style={{ margin: 0 }}>{fmtPct(((num(trigger) - price) / price) * 100)} from current price</span>}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="field">
          <label htmlFor="amount">{side === 'buy' ? 'Amount to spend' : `Quantity to sell`}</label>
          <div className="input-wrap">
            <input id="amount" className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span>{side === 'buy' ? 'USD' : coin.symbol.toUpperCase()}</span>
          </div>
        </div>
        <div className="pcts">
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <button type="button" key={p} onClick={() => setPct(p)} disabled={side === 'sell' && !pos}>
              {p === 1 ? 'Max' : `${p * 100}%`}
            </button>
          ))}
        </div>

        {side === 'buy' && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowExits((v) => !v)}>
              {showExits ? '− Hide' : '+ Add'} stop-loss / take-profit
            </button>
            <AnimatePresence initial={false}>
              {showExits && (
                <motion.div className="two" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <div className="field">
                    <label htmlFor="sl">Stop-loss</label>
                    <input id="sl" className="input" inputMode="decimal" placeholder="optional" value={sl} onChange={(e) => setSl(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="tp">Take-profit</label>
                    <input id="tp" className="input" inputMode="decimal" placeholder="optional" value={tp} onChange={(e) => setTp(e.target.value)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        <div className="divider" />
        {side === 'buy' ? (
          <>
            <div className="kv"><span>Available cash</span><span>{fmtUsd(availableCash)}</span></div>
            <div className="kv"><span>You get (est.)</span><span>{fmtQty(buyQty)} {coin.symbol.toUpperCase()}</span></div>
          </>
        ) : (
          <>
            <div className="kv"><span>You hold</span><span>{fmtQty(pos?.qty ?? 0)} {coin.symbol.toUpperCase()}</span></div>
            <div className="kv"><span>You receive (est.)</span><span>{fmtUsd(sellProceeds)}</span></div>
          </>
        )}
        <div className="kv"><span>Fee ({settings.feePct}%)</span><span>{fmtUsd(side === 'buy' ? (amt || 0) * fee : (amt || 0) * execPrice * fee)}</span></div>

        {msg && <div className={`msg ${msg.ok ? 'msg--ok' : 'msg--err'}`}>{msg.text}</div>}
        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} type="submit" className={`btn btn--block ${side === 'buy' ? 'btn--bull' : 'btn--bear'}`} disabled={!(amt > 0) || (type !== 'market' && !(num(trigger) > 0))}>
          {type === 'market' ? (side === 'buy' ? 'Buy' : 'Sell') : `Place ${type} ${side}`} {coin.symbol.toUpperCase()}
        </motion.button>
      </form>

      {pos && (
        <>
          <div className="divider" />
          <h3 style={{ margin: 0 }}>Your position</h3>
          <div className="kv"><span>Quantity</span><span>{fmtQty(pos.qty)}</span></div>
          <div className="kv"><span>Avg cost</span><span>{fmtPrice(pos.avgCost)}</span></div>
          <div className="kv"><span>Value</span><span>{fmtUsd(pos.qty * price)}</span></div>
          <div className="kv"><span>Unrealized P&L</span><span className={pnl >= 0 ? 'up' : 'down'}>{fmtUsd(pnl, { sign: true })} ({fmtPct(((price - pos.avgCost) / pos.avgCost) * 100)})</span></div>
          <ExitsEditor key={`${pos.stopLoss}-${pos.takeProfit}`} stopLoss={pos.stopLoss} takeProfit={pos.takeProfit} onSave={(e) => (setExits(coin.id, e), toast({ title: 'Exits updated', tone: 'info' }))} />
        </>
      )}

      {orders.length > 0 && (
        <>
          <div className="divider" />
          <h3 style={{ margin: 0 }}>Open orders</h3>
          {orders.map((o) => (
            <div key={o.id} className="kv" style={{ alignItems: 'center' }}>
              <span>
                <span className={o.side === 'buy' ? 'up' : 'down'}>{o.type} {o.side}</span> @ {fmtPrice(o.triggerPrice)}
                <br />
                <span className="faint mono">{o.side === 'buy' ? fmtUsd(o.usdAmount) : `${fmtQty(o.qty ?? 0)} ${o.symbol.toUpperCase()}`}</span>
              </span>
              <button className="btn btn--sm btn--ghost" onClick={() => cancelOrder(o.id)}>Cancel</button>
            </div>
          ))}
          <p className="hint" style={{ margin: 0 }}>Orders are checked every time prices refresh.</p>
        </>
      )}
    </div>
  )
}

function ExitsEditor({ stopLoss, takeProfit, onSave }: { stopLoss?: number; takeProfit?: number; onSave: (e: { stopLoss?: number; takeProfit?: number }) => void }) {
  const [sl, setSl] = useState(priceStr(stopLoss))
  const [tp, setTp] = useState(priceStr(takeProfit))
  const dirty = sl !== priceStr(stopLoss) || tp !== priceStr(takeProfit)
  return (
    <>
      <div className="two">
        <div className="field">
          <label>Stop-loss</label>
          <input className="input" inputMode="decimal" placeholder="none" value={sl} onChange={(e) => setSl(e.target.value)} />
        </div>
        <div className="field">
          <label>Take-profit</label>
          <input className="input" inputMode="decimal" placeholder="none" value={tp} onChange={(e) => setTp(e.target.value)} />
        </div>
      </div>
      {dirty && (
        <button className="btn btn--sm" onClick={() => onSave({ stopLoss: num(sl) > 0 ? num(sl) : undefined, takeProfit: num(tp) > 0 ? num(tp) : undefined })}>
          Save exits
        </button>
      )}
    </>
  )
}
