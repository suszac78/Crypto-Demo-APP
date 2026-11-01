import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMarket } from '../state/MarketContext'
import { usePortfolio } from '../state/PortfolioContext'
import { fetchHourly90d, toCandles } from '../lib/coingecko'
import { analyze, type Timeframe } from '../lib/patterns'
import { seriesFrom, sma } from '../lib/indicators'
import type { Candle } from '../lib/types'
import { fmtPrice, fmtMoney } from '../lib/format'
import { CoinIcon, Flash, Icon, Pct, Segmented } from '../components/ui'
import { PriceChart } from '../components/PriceChart'
import { TradePanel, type TradePreset } from '../components/TradePanel'
import { PatternList, VerdictCard } from '../components/SignalPanel'

export function CoinPage() {
  const { id = '' } = useParams()
  const { byId, settings, lastUpdated, toggleWatch, currency } = useMarket()
  const { acct } = usePortfolio()
  const coin = byId.get(id)
  const [tf, setTf] = useState<Timeframe>('1d')
  const [hourly, setHourly] = useState<Awaited<ReturnType<typeof fetchHourly90d>> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [preset, setPreset] = useState<TradePreset | null>(null)
  const apiKey = settings.apiKey.trim() || null

  // Load 90d of hourly data; refresh alongside the market data.
  useEffect(() => {
    let alive = true
    setErr(null)
    fetchHourly90d(id, apiKey, currency)
      .then((d) => alive && setHourly(d))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : 'Could not load chart data'))
    return () => {
      alive = false
    }
  }, [id, apiKey, lastUpdated, currency])

  useEffect(() => {
    setActive(null)
    setHourly(null)
    window.scrollTo({ top: 0 })
  }, [id])

  const candles: Candle[] = useMemo(() => {
    if (!hourly) return []
    const c = toCandles(hourly, tf === '1d' ? 24 : 4)
    // Make the newest candle reflect the latest market price.
    if (coin && c.length) {
      const last = { ...c[c.length - 1] }
      last.close = coin.current_price
      last.high = Math.max(last.high, last.close)
      last.low = Math.min(last.low, last.close)
      c[c.length - 1] = last
    }
    return c
  }, [hourly, tf, coin])

  const analysis = useMemo(() => (candles.length ? analyze(candles, tf) : null), [candles, tf])
  const closes = useMemo(() => candles.map((c) => c.close), [candles])
  const s20 = useMemo(() => seriesFrom(candles, sma(closes, 20)), [candles, closes])
  const s50 = useMemo(() => seriesFrom(candles, sma(closes, 50)), [candles, closes])
  const trades = useMemo(() => acct.trades.filter((t) => t.coinId === id), [acct.trades, id])

  useEffect(() => setActive(null), [tf])

  if (!coin) {
    return (
      <div className="shell">
        <Link to="/" className="back">{Icon.back} Markets</Link>
        <div className="card empty">{byId.size ? "This coin isn't in the top 500 right now." : 'Loading market data…'}</div>
      </div>
    )
  }

  const usePlan = (p: Omit<TradePreset, 'nonce'>) => {
    setPreset({ ...p, nonce: Date.now() })
    document.getElementById('trade-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const watched = settings.watchlist.includes(coin.id)

  return (
    <div className="shell">
      <Link to="/" className="back">{Icon.back} Markets</Link>
      <motion.header className="coin-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <CoinIcon src={coin.image} symbol={coin.symbol} large />
        <div>
          <h1>
            {coin.name}
            <small>{coin.symbol} · #{coin.market_cap_rank}</small>
          </h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="coin-head__price">
              <Flash value={coin.current_price}>{fmtPrice(coin.current_price)}</Flash>
            </span>
            <span className="mono"><Pct v={coin.price_change_percentage_24h_in_currency ?? coin.price_change_percentage_24h} /> <span className="faint">24h</span></span>
            <button className={`star${watched ? ' on' : ''}`} onClick={() => toggleWatch(coin.id)} aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'} title="Watchlist">
              {Icon.star(watched)}
            </button>
          </div>
        </div>
        <div className="coin-head__stats">
          <div><span>Market cap</span><span>{fmtMoney(coin.market_cap, { compact: true })}</span></div>
          <div><span>24h volume</span><span>{fmtMoney(coin.total_volume, { compact: true })}</span></div>
          <div><span>24h range</span><span>{fmtPrice(coin.low_24h)} – {fmtPrice(coin.high_24h)}</span></div>
          <div><span>7d</span><span><Pct v={coin.price_change_percentage_7d_in_currency} /></span></div>
        </div>
      </motion.header>

      <div className="coin-grid">
        <div className="coin-main">
          <section className="card chart-card">
            <div className="chart-toolbar">
              <Segmented
                label="Timeframe"
                value={tf}
                onChange={setTf}
                options={[
                  { value: '1d', label: 'Daily candles' },
                  { value: '4h', label: '4-hour candles' },
                ]}
              />
              <div className="chart-legend">
                <span><i style={{ background: 'rgba(143,155,255,0.9)' }} />SMA 20</span>
                <span><i style={{ background: 'rgba(255,193,94,0.8)' }} />SMA 50</span>
                <span><i style={{ background: '#ffc15e', height: 0, borderTop: '2px dashed #ffc15e' }} />Neckline / rim</span>
                <span className="faint">90 days</span>
              </div>
            </div>
            <div className="chart-box">
              {candles.length > 0 && analysis && <PriceChart candles={candles} sma20={s20} sma50={s50} patterns={analysis.patterns} activePattern={active} plan={analysis.plan} trades={trades} />}
              {!candles.length && <div className="chart-box__msg">{err ? err : <div className="skeleton" style={{ position: 'absolute', inset: 8 }} />}</div>}
            </div>
          </section>

          {analysis ? (
            <>
              <VerdictCard analysis={analysis} price={coin.current_price} tf={tf} onUsePlan={usePlan} />
              <PatternList analysis={analysis} active={active} setActive={setActive} onUsePlan={usePlan} tf={tf} />
            </>
          ) : (
            !err && <div className="card skeleton" style={{ height: 260 }} />
          )}
        </div>

        <aside className="coin-side" id="trade-panel">
          <TradePanel coin={coin} preset={preset} />
        </aside>
      </div>
    </div>
  )
}
