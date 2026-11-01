import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { createChart, type UTCTimestamp } from 'lightweight-charts'
import { usePortfolio } from '../state/PortfolioContext'
import { useMarket } from '../state/MarketContext'
import { fmtPct, fmtPrice, fmtQty, fmtTime, fmtMoney } from '../lib/format'
import { CoinIcon, Segmented } from '../components/ui'
import { SignalChip } from '../components/SignalChip'
import { FundsModal } from '../components/FundsModal'

function EquityChart({ data }: { data: { t: number; v: number }[] }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current || data.length < 2) return
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#8a93ad', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(148,163,205,0.06)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      handleScroll: false,
      handleScale: false,
    })
    const up = data[data.length - 1].v >= 0
    const s = c.addAreaSeries({
      lineColor: up ? '#2ee6a6' : '#ff5f7e',
      topColor: up ? 'rgba(46,230,166,0.25)' : 'rgba(255,95,126,0.25)',
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    // One point per second at most; chart needs unique ascending times.
    const pts = new Map<number, number>()
    data.forEach((d) => pts.set(Math.floor(d.t / 1000), d.v))
    s.setData([...pts].map(([t, v]) => ({ time: t as UTCTimestamp, value: v })))
    c.timeScale().fitContent()
    return () => c.remove()
  }, [data])
  if (data.length < 2) return <div className="chart-box__msg" style={{ position: 'static', height: '100%' }}>Your P&amp;L curve appears here after a couple of price refreshes.</div>
  return <div ref={el} style={{ height: '100%' }} />
}

export function Portfolio() {
  const { acct, equity, holdingsValue, pnl, pnlPct, reservedCash, cancelOrder } = usePortfolio()
  const { byId, signals } = useMarket()
  const nav = useNavigate()
  const [tab, setTab] = useState<'trades' | 'orders' | 'funds'>('trades')
  const [funds, setFunds] = useState(false)
  const positions = Object.values(acct.positions).sort((a, b) => b.qty * (byId.get(b.coinId)?.current_price ?? b.avgCost) - a.qty * (byId.get(a.coinId)?.current_price ?? a.avgCost))
  const realized = acct.trades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0)
  const sells = acct.trades.filter((t) => t.side === 'sell' && t.realizedPnl != null)
  const winRate = sells.length ? (sells.filter((t) => (t.realizedPnl ?? 0) > 0).length / sells.length) * 100 : null

  return (
    <div className="shell">
      <section className="hero" style={{ paddingBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>Portfolio</h1>
          <p>Your demo account. All money here is pretend.</p>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} className="btn btn--accent" onClick={() => setFunds(true)}>
          Adjust demo funds
        </motion.button>
      </section>

      <div className="stats-row">
        {[
          ['Total equity', fmtMoney(equity), <span className="faint">cash + holdings</span>],
          ['Cash', fmtMoney(acct.cash), <span className="faint">{reservedCash > 0 ? `${fmtMoney(reservedCash)} reserved for orders` : 'available to trade'}</span>],
          ['Holdings value', fmtMoney(holdingsValue), <span className="faint">{positions.length} position{positions.length === 1 ? '' : 's'}</span>],
          ['Total P&L', <span className={pnl >= 0 ? 'up' : 'down'}>{fmtMoney(pnl, { sign: true })}</span>, <span className={pnl >= 0 ? 'up' : 'down'}>{fmtPct(pnlPct)}</span>],
          ['Realized P&L', <span className={realized >= 0 ? 'up' : 'down'}>{fmtMoney(realized, { sign: true })}</span>, <span className="faint">{winRate != null ? `${winRate.toFixed(0)}% winning sells` : 'no closed trades yet'}</span>],
        ].map(([l, v, s], i) => (
          <motion.div key={i} className="card stat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <div className="stat__label">{l}</div>
            <div className="stat__value">{v}</div>
            <div className="stat__sub">{s}</div>
          </motion.div>
        ))}
      </div>

      <div className="port-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="card card__pad">
            <h3>Holdings</h3>
            {positions.some((p) => signals.get(p.coinId)?.sell) && (
              <div className="banner banner--bear" style={{ margin: '0 0 12px' }}>
                <b>Sell signal:</b> {positions.filter((p) => signals.get(p.coinId)?.sell).map((p) => p.symbol.toUpperCase()).join(', ')} broke down from a bearish pattern. Consider selling or setting a stop-loss.
              </div>
            )}
            {positions.length === 0 ? (
              <div className="empty">
                No holdings yet. <Link to="/">Pick a coin</Link> and make your first practice trade.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="list">
                  <thead>
                    <tr>
                      <th>Coin</th>
                      <th>Qty</th>
                      <th>Avg cost</th>
                      <th>Price</th>
                      <th>Value</th>
                      <th>P&L</th>
                      <th>Stop / Target</th>
                      <th>Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const px = byId.get(p.coinId)?.current_price ?? p.avgCost
                      const pl = (px - p.avgCost) * p.qty
                      return (
                        <tr key={p.coinId} className="link" onClick={() => nav(`/coin/${p.coinId}`)}>
                          <td>
                            <div className="coin-cell">
                              <CoinIcon src={p.image} symbol={p.symbol} />
                              <b>{p.name}</b>
                              <small>{p.symbol}</small>
                            </div>
                          </td>
                          <td>{fmtQty(p.qty)}</td>
                          <td>{fmtPrice(p.avgCost)}</td>
                          <td>{fmtPrice(px)}</td>
                          <td>{fmtMoney(p.qty * px)}</td>
                          <td className={pl >= 0 ? 'up' : 'down'}>
                            {fmtMoney(pl, { sign: true })}
                            <br />
                            <span style={{ fontSize: 'var(--fs-xs)' }}>{fmtPct(((px - p.avgCost) / p.avgCost) * 100)}</span>
                          </td>
                          <td className="faint">
                            {p.stopLoss ? fmtPrice(p.stopLoss) : '—'} / {p.takeProfit ? fmtPrice(p.takeProfit) : '—'}
                          </td>
                          <td><SignalChip signal={signals.get(p.coinId)} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card card__pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Activity</h3>
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'trades', label: `Trades (${acct.trades.length})` },
                  { value: 'orders', label: `Open orders (${acct.orders.length})` },
                  { value: 'funds', label: 'Funds' },
                ]}
              />
            </div>
            <div className="table-wrap">
              {tab === 'trades' &&
                (acct.trades.length === 0 ? (
                  <div className="empty">No trades yet.</div>
                ) : (
                  <table className="list">
                    <thead>
                      <tr><th>Time</th><th>Coin</th><th>Side</th><th>Qty</th><th>Price</th><th>Total</th><th>Fee</th><th>P&L</th><th>Reason</th></tr>
                    </thead>
                    <tbody>
                      {acct.trades.slice(0, 200).map((t) => (
                        <tr key={t.id}>
                          <td className="faint" style={{ fontFamily: 'var(--mono)' }}>{fmtTime(t.time)}</td>
                          <td>{t.symbol.toUpperCase()}</td>
                          <td className={t.side === 'buy' ? 'up' : 'down'}>{t.side.toUpperCase()}</td>
                          <td>{fmtQty(t.qty)}</td>
                          <td>{fmtPrice(t.price)}</td>
                          <td>{fmtMoney(t.total)}</td>
                          <td className="faint">{fmtMoney(t.fee)}</td>
                          <td className={t.realizedPnl == null ? 'faint' : t.realizedPnl >= 0 ? 'up' : 'down'}>{t.realizedPnl == null ? '—' : fmtMoney(t.realizedPnl, { sign: true })}</td>
                          <td className="faint">{t.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              {tab === 'orders' &&
                (acct.orders.length === 0 ? (
                  <div className="empty">No open orders. Use Limit or Stop orders on a coin page to buy dips or breakouts automatically.</div>
                ) : (
                  <table className="list">
                    <thead>
                      <tr><th>Placed</th><th>Coin</th><th>Order</th><th>Trigger</th><th>Now</th><th>Size</th><th /></tr>
                    </thead>
                    <tbody>
                      {acct.orders.map((o) => (
                        <tr key={o.id}>
                          <td className="faint" style={{ fontFamily: 'var(--mono)' }}>{fmtTime(o.createdAt)}</td>
                          <td><Link to={`/coin/${o.coinId}`}>{o.symbol.toUpperCase()}</Link></td>
                          <td className={o.side === 'buy' ? 'up' : 'down'}>{o.type} {o.side}</td>
                          <td>{fmtPrice(o.triggerPrice)}</td>
                          <td className="faint">{fmtPrice(byId.get(o.coinId)?.current_price)}</td>
                          <td>{o.side === 'buy' ? fmtMoney(o.usdAmount) : fmtQty(o.qty ?? 0)}</td>
                          <td><button className="btn btn--sm btn--ghost" onClick={() => cancelOrder(o.id)}>Cancel</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              {tab === 'funds' && (
                <table className="list">
                  <thead>
                    <tr><th>Time</th><th>Change</th><th style={{ textAlign: 'left' }}>Note</th></tr>
                  </thead>
                  <tbody>
                    {acct.funds.map((f) => (
                      <tr key={f.id}>
                        <td className="faint" style={{ fontFamily: 'var(--mono)', textAlign: 'left' }}>{fmtTime(f.time)}</td>
                        <td className={f.amount >= 0 ? 'up' : 'down'}>{fmtMoney(f.amount, { sign: true })}</td>
                        <td style={{ textAlign: 'left', fontFamily: 'var(--font)' }} className="muted">{f.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card card__pad">
            <h3>P&amp;L over time</h3>
            <div style={{ height: 220 }}>
              <EquityChart data={acct.equityHistory} />
            </div>
          </section>
          <section className="card card__pad">
            <h3>Allocation</h3>
            {equity > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[{ label: 'Cash', v: acct.cash, color: 'var(--text-3)' }, ...positions.slice(0, 6).map((p, i) => ({ label: p.symbol.toUpperCase(), v: p.qty * (byId.get(p.coinId)?.current_price ?? p.avgCost), color: ['#8f9bff', '#2ee6a6', '#ffc15e', '#ff5f7e', '#5ec8ff', '#c38fff'][i] }))].map((a) => (
                  <div key={a.label}>
                    <div className="kv" style={{ fontSize: 'var(--fs-xs)' }}>
                      <span>{a.label}</span>
                      <span>{((a.v / equity) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="conf" style={{ marginTop: 4 }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(a.v / equity) * 100}%` }} transition={{ duration: 0.6 }} style={{ background: a.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <FundsModal open={funds} onClose={() => setFunds(false)} />
    </div>
  )
}
