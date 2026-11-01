import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMarket } from '../state/MarketContext'
import { usePortfolio } from '../state/PortfolioContext'
import type { Coin } from '../lib/types'
import { fmtPrice, fmtMoney } from '../lib/format'
import { CoinIcon, Icon, Pct, Segmented, Sparkline } from '../components/ui'
import { SignalChip } from '../components/SignalChip'

type SortKey = 'rank' | 'price' | 'h1' | 'h24' | 'd7' | 'cap' | 'vol' | 'signal'
type Filter = 'all' | 'watch' | 'gainers' | 'losers' | 'held'
type SigFilter = 'any' | 'buy' | 'dont' | 'sell'
const PAGE = 100

const getters: Record<Exclude<SortKey, 'signal'>, (c: Coin) => number> = {
  rank: (c) => c.market_cap_rank ?? 9999,
  price: (c) => c.current_price,
  h1: (c) => c.price_change_percentage_1h_in_currency ?? -Infinity,
  h24: (c) => c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? -Infinity,
  d7: (c) => c.price_change_percentage_7d_in_currency ?? -Infinity,
  cap: (c) => c.market_cap,
  vol: (c) => c.total_volume,
}

export function Markets() {
  const { coins, settings, toggleWatch, loading, signals } = useMarket()
  const { acct, equity, pnl, pnlPct } = usePortfolio()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sig, setSig] = useState<SigFilter>('any')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 })
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = coins
    if (needle) list = list.filter((c) => c.name.toLowerCase().includes(needle) || c.symbol.toLowerCase().includes(needle))
    if (filter === 'watch') list = list.filter((c) => settings.watchlist.includes(c.id))
    if (filter === 'held') list = list.filter((c) => acct.positions[c.id])
    if (sig === 'buy') list = list.filter((c) => signals.get(c.id)?.group === 'buy')
    if (sig === 'dont') list = list.filter((c) => signals.get(c.id)?.group === 'dont')
    if (sig === 'sell') list = list.filter((c) => signals.get(c.id)?.sell)
    let s = sort
    if (filter === 'gainers') s = { key: 'h24', dir: -1 }
    if (filter === 'losers') s = { key: 'h24', dir: 1 }
    const g = s.key === 'signal' ? (c: Coin) => signals.get(c.id)?.score ?? -Infinity : getters[s.key]
    return [...list].sort((a, b) => (g(a) - g(b)) * s.dir)
  }, [coins, q, filter, sig, sort, settings.watchlist, acct.positions, signals])

  const sigCounts = useMemo(() => {
    let buy = 0, dont = 0, sell = 0
    for (const v of signals.values()) {
      if (v.group === 'buy') buy++
      else dont++
      if (v.sell) sell++
    }
    return { buy, dont, sell }
  }, [signals])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pg = Math.min(page, pages - 1)
  const shown = rows.slice(pg * PAGE, pg * PAGE + PAGE)

  const breadth = useMemo(() => {
    const ch = coins.map((c) => c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0)
    const up = ch.filter((x) => x > 0).length
    const top = [...coins].sort((a, b) => getters.h24(b) - getters.h24(a))[0]
    return { up, down: ch.length - up, top }
  }, [coins])

  const head = (key: SortKey, label: string) => (
    <th
      className={sort.key === key ? 'sorted' : ''}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'rank' ? 1 : -1 }))}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="shell">
      <section className="hero">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1>
            Practice trading.
            <br />
            <em>Zero real risk.</em>
          </h1>
          <p>Trade the top 500 cryptocurrencies with demo money. Every coin page reads its chart for classic patterns and tells you when and where a buy makes sense.</p>
        </motion.div>
      </section>

      <motion.div className="stats-row" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.06 } } }}>
        {[
          { label: 'Demo equity', value: fmtMoney(equity), sub: <Pct v={pnlPct} /> },
          { label: 'Trading P&L', value: <span className={pnl >= 0 ? 'up' : 'down'}>{fmtMoney(pnl, { sign: true })}</span>, sub: <span className="faint">since start</span> },
          { label: 'Market breadth (24h)', value: <><span className="up">{breadth.up}</span><span className="faint"> / </span><span className="down">{breadth.down}</span></>, sub: <span className="faint">coins up / down</span> },
          { label: 'Top gainer (24h)', value: breadth.top ? breadth.top.symbol.toUpperCase() : '—', sub: <Pct v={breadth.top ? getters.h24(breadth.top) : null} /> },
        ].map((s) => (
          <motion.div key={s.label} className="card stat" variants={{ h: { opacity: 0, y: 12 }, s: { opacity: 1, y: 0 } }}>
            <div className="stat__label">{s.label}</div>
            <div className="stat__value">{s.value}</div>
            <div className="stat__sub">{s.sub}</div>
          </motion.div>
        ))}
      </motion.div>

      <section className="card" aria-label="Top 500 cryptocurrencies">
        <div className="toolbar">
          <div className="search">
            {Icon.search}
            <input className="input" placeholder="Search 500 coins by name or symbol…" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} aria-label="Search coins" />
          </div>
          <Segmented
            label="Filter"
            value={filter}
            onChange={(f) => (setFilter(f), setPage(0))}
            options={[
              { value: 'all', label: 'All' },
              { value: 'watch', label: '★ Watchlist' },
              { value: 'held', label: 'Holdings' },
              { value: 'gainers', label: 'Gainers' },
              { value: 'losers', label: 'Losers' },
            ]}
          />
        </div>
        <div className="toolbar toolbar--signals">
          <span className="label">Pattern signal</span>
          <Segmented
            label="Pattern signal"
            value={sig}
            onChange={(v) => (setSig(v), setPage(0), v !== 'any' && setSort({ key: 'signal', dir: v === 'buy' ? -1 : 1 }))}
            options={[
              { value: 'any', label: 'Any' },
              { value: 'buy', label: `Buy (${sigCounts.buy})` },
              { value: 'dont', label: `Don't buy (${sigCounts.dont})` },
              { value: 'sell', label: `Sell (${sigCounts.sell})` },
            ]}
          />
          <span className="hint" style={{ margin: 0 }}>
            {sig === 'buy'
              ? 'A bullish pattern or a support level gives a buy plan. Open a coin for its entry, stop and target.'
              : sig === 'dont'
                ? 'No buy setup yet, or the chart leans bearish. Wait for a pattern to confirm.'
                : sig === 'sell'
                  ? 'A bearish pattern has broken down. If you hold these, consider selling or tightening your stop.'
                  : 'Screened from each coin’s 7-day hourly chart every refresh. Coin pages show the full 90-day analysis.'}
          </span>
        </div>
        <div className="table-wrap">
          <table className="mkt">
            <thead>
              <tr>
                <th style={{ width: 36 }} aria-label="Watchlist" />
                {head('rank', '#')}
                <th style={{ cursor: 'default' }}>Coin</th>
                {head('price', 'Price')}
                {head('h1', '1h')}
                {head('h24', '24h')}
                {head('d7', '7d')}
                {head('cap', 'Market cap')}
                {head('vol', 'Volume 24h')}
                {head('signal', 'Signal')}
                <th style={{ cursor: 'default' }}>Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const on = settings.watchlist.includes(c.id)
                return (
                  <tr key={c.id} onClick={() => nav(`/coin/${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/coin/${c.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className={`star${on ? ' on' : ''}`} onClick={() => toggleWatch(c.id)} aria-label={on ? `Remove ${c.name} from watchlist` : `Add ${c.name} to watchlist`}>
                        {Icon.star(on)}
                      </button>
                    </td>
                    <td className="faint mono">{c.market_cap_rank ?? '—'}</td>
                    <td>
                      <div className="coin-cell">
                        <CoinIcon src={c.image} symbol={c.symbol} />
                        <b>{c.name}</b>
                        <small>{c.symbol}</small>
                        {acct.positions[c.id] && <span className="chip chip--neutral" style={{ marginLeft: 4 }}>held</span>}
                      </div>
                    </td>
                    <td>{fmtPrice(c.current_price)}</td>
                    <td><Pct v={c.price_change_percentage_1h_in_currency} /></td>
                    <td><Pct v={c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h} /></td>
                    <td><Pct v={c.price_change_percentage_7d_in_currency} /></td>
                    <td>{fmtMoney(c.market_cap, { compact: true })}</td>
                    <td>{fmtMoney(c.total_volume, { compact: true })}</td>
                    <td><SignalChip signal={signals.get(c.id)} /></td>
                    <td><Sparkline data={c.sparkline_in_7d?.price} /></td>
                  </tr>
                )
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={11} className="empty">
                    {coins.length === 0 ? (loading ? 'Loading the top 500 coins…' : 'No market data yet.') : filter === 'watch' ? 'Your watchlist is empty — tap ★ on any coin.' : filter === 'held' ? 'You have no holdings yet.' : sig !== 'any' ? 'No coins match this signal filter right now.' : 'No coins match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>
            {rows.length ? `${pg * PAGE + 1}–${Math.min(rows.length, (pg + 1) * PAGE)} of ${rows.length}` : '0 coins'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn--sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>← Prev</button>
            <button className="btn btn--sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next →</button>
          </div>
        </div>
      </section>
    </div>
  )
}
