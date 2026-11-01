import { useEffect, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { MarketProvider, useMarket } from './state/MarketContext'
import { PortfolioProvider, usePortfolio } from './state/PortfolioContext'
import { ToastProvider } from './state/ToastContext'
import { Markets } from './pages/Markets'
import { CoinPage } from './pages/CoinPage'
import { Portfolio } from './pages/Portfolio'
import { Settings } from './pages/Settings'
import { FundsModal } from './components/FundsModal'
import { fmtMoney } from './lib/format'
import { Pct } from './components/ui'
import { CurrencySelect } from './components/CurrencySelect'

function RefreshRing() {
  const { nextRefresh, loading, refresh, settings, lastUpdated } = useMarket()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const period = settings.refreshMinutes * 60_000
  const left = nextRefresh ? Math.max(0, nextRefresh - now) : period
  const frac = 1 - left / period
  const r = 8
  const circ = 2 * Math.PI * r
  const mm = Math.floor(left / 60000)
  const ss = Math.floor((left % 60000) / 1000)
  return (
    <div className="refresh" title={lastUpdated ? `Last update ${new Date(lastUpdated).toLocaleTimeString()}` : undefined}>
      <button onClick={refresh} aria-label="Refresh prices now">
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="11" cy="11" r={r} fill="none" stroke="rgba(148,163,205,0.18)" strokeWidth="2.5" />
          <motion.circle
            cx="11"
            cy="11"
            r={r}
            fill="none"
            stroke={loading ? 'var(--warn)' : 'var(--accent)'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            animate={{ strokeDashoffset: loading ? circ * 0.75 : circ * (1 - frac) }}
            transition={{ duration: 0.6 }}
          />
        </svg>
      </button>
      <span className="refresh__text mono">{loading ? 'updating…' : `${mm}:${String(ss).padStart(2, '0')}`}</span>
    </div>
  )
}

function TopBar() {
  const { equity, pnlPct, acct } = usePortfolio()
  const [funds, setFunds] = useState(false)
  const links = [
    { to: '/', label: 'Markets', end: true },
    { to: '/portfolio', label: 'Portfolio' },
    { to: '/settings', label: 'Settings' },
  ]
  const loc = useLocation()
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand" aria-label="PaperDesk home">
          <span className="brand__mark">P</span>
          <span>
            PaperDesk
            <small>demo trading</small>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((l) => {
            const active = l.end ? loc.pathname === '/' || loc.pathname.startsWith('/coin') : loc.pathname.startsWith(l.to)
            return (
              <NavLink key={l.to} to={l.to} className={active ? 'active' : ''} end={l.end}>
                {active && <motion.span layoutId="nav-pill" className="nav__pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                {l.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="topbar__right">
          <RefreshRing />
          <CurrencySelect id="currency-top" compact />
          <div className="acct-pill">
            <div className="acct-pill__val">
              <span>Equity</span>
              <span>{fmtMoney(equity)} <Pct v={pnlPct} digits={1} /></span>
            </div>
            <div className="acct-pill__val acct-pill__val--hide-sm">
              <span>Cash</span>
              <span>{fmtMoney(acct.cash)}</span>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} className="btn btn--sm btn--accent" onClick={() => setFunds(true)}>
              ± Funds
            </motion.button>
          </div>
        </div>
      </div>
      <FundsModal open={funds} onClose={() => setFunds(false)} />
    </header>
  )
}

function Banners() {
  const { simulated, error } = useMarket()
  return (
    <div className="shell" style={{ paddingBottom: 0 }}>
      {simulated && (
        <div className="banner banner--warn">
          <b>Simulated prices.</b> Add your free CoinGecko API key in <Link to="/settings">Settings</Link> to trade on live data for the top 500 coins.
        </div>
      )}
      {!simulated && error && (
        <div className="banner banner--bear">
          <b>Live data problem:</b> {error} Showing the last prices we have.
        </div>
      )}
    </div>
  )
}

function AnimatedRoutes() {
  const loc = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
        <Routes location={loc}>
          <Route path="/" element={<Markets />} />
          <Route path="/coin/:id" element={<CoinPage />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Markets />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <ToastProvider>
          <MarketProvider>
            <PortfolioProvider>
              <TopBar />
              <Banners />
              <AnimatedRoutes />
            </PortfolioProvider>
          </MarketProvider>
        </ToastProvider>
      </HashRouter>
    </MotionConfig>
  )
}
