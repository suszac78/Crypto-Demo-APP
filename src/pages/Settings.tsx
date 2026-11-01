import { useState } from 'react'
import { useMarket } from '../state/MarketContext'
import { usePortfolio } from '../state/PortfolioContext'
import { useToast } from '../state/ToastContext'
import { displayCurrency, fmtTime, fmtMoney } from '../lib/format'
import { CurrencySelect } from '../components/CurrencySelect'

export function Settings() {
  const { settings, updateSettings, refresh, error, lastUpdated, simulated, coins } = useMarket()
  const { reset, equity } = usePortfolio()
  const toast = useToast()
  const [key, setKey] = useState(settings.apiKey)
  const [show, setShow] = useState(false)
  const [mins, setMins] = useState(String(settings.refreshMinutes))
  const [fee, setFee] = useState(String(settings.feePct))
  const [start, setStart] = useState('10000')

  // Two API calls per refresh: 5 min ≈ 576 calls/day.
  const perMonth = Math.round(((30 * 24 * 60) / Math.max(1, Number(mins) || 5)) * 2)

  return (
    <div className="shell">
      <div className="settings">
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)', letterSpacing: '-0.03em' }}>Settings</h1>

        <section className="card card__pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>CoinGecko API</h3>
          <p>
            Paste your free CoinGecko <b>Demo</b> API key. It's stored only in this browser and sent only to api.coingecko.com. Without a key the app runs on simulated prices so you can still try everything.
          </p>
          <div className="row">
            <div className="field">
              <label htmlFor="key">API key</label>
              <input id="key" className="input" type={show ? 'text' : 'password'} placeholder="CG-xxxxxxxxxxxxxxxxxxxxxxxx" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <button className="btn btn--ghost" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
            <button
              className="btn btn--accent"
              onClick={() => {
                updateSettings({ apiKey: key.trim() })
                toast({ title: key.trim() ? 'API key saved — fetching live prices' : 'Key cleared — using simulated prices', tone: 'info' })
              }}
            >
              Save key
            </button>
          </div>
          <p className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
            Status: {simulated ? 'Simulated data' : error ? <span className="down">{error}</span> : <span className="up">Live · {coins.length} coins</span>}
            {lastUpdated ? ` · last update ${fmtTime(lastUpdated)}` : ''}{' '}
            <button className="btn btn--sm btn--ghost" onClick={refresh} style={{ marginLeft: 6 }}>Refresh now</button>
          </p>
        </section>

        <section className="card card__pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Currency</h3>
          <p>Prices, charts and your demo account all show in this currency. When you switch, your cash, holdings, orders and history convert at the current exchange rate.</p>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="currency-settings">Display currency</label>
            <CurrencySelect id="currency-settings" />
          </div>
        </section>

        <section className="card card__pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Data refresh</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="mins">Refresh every (minutes)</label>
              <input id="mins" className="input" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} />
            </div>
            <button
              className="btn"
              onClick={() => {
                const m = Math.max(1, Math.min(120, Math.round(Number(mins) || 5)))
                setMins(String(m))
                updateSettings({ refreshMinutes: m })
                toast({ title: `Refreshing every ${m} min`, tone: 'info' })
              }}
            >
              Save
            </button>
          </div>
          <p className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
            Each refresh loads the top 500 coins in 2 calls. Running 24/7 that's about {perMonth.toLocaleString()} calls a month. The free Demo plan allows roughly 10,000 per month, so refreshes pause automatically while this tab is hidden and resume when you come back.
          </p>
        </section>

        <section className="card card__pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Trading fees</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="fee">Simulated fee per trade (%)</label>
              <input id="fee" className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <button
              className="btn"
              onClick={() => {
                const f = Math.max(0, Math.min(5, Number(fee) || 0))
                setFee(String(f))
                updateSettings({ feePct: f })
                toast({ title: `Fee set to ${f}%`, tone: 'info' })
              }}
            >
              Save
            </button>
          </div>
        </section>

        <section className="card card__pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Reset demo account</h3>
          <p>Wipes holdings, orders and history and starts fresh with a new cash balance. Current equity: {fmtMoney(equity)}.</p>
          <div className="row">
            <div className="field">
              <label htmlFor="start">Starting cash ({displayCurrency().toUpperCase()})</label>
              <input id="start" className="input" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <button
              className="btn btn--bear"
              onClick={() => {
                const v = Number(start.replace(/[$,]/g, ''))
                if (!(v >= 0)) return toast({ title: 'Enter a valid amount', tone: 'bear' })
                if (confirm(`Reset your demo account to ${fmtMoney(v)}? This clears all trades and holdings.`)) {
                  reset(v)
                  toast({ title: `Account reset to ${fmtMoney(v)}`, tone: 'info' })
                }
              }}
            >
              Reset account
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
