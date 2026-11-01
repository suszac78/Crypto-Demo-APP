import { motion } from 'framer-motion'
import type { Analysis, Pattern } from '../lib/types'
import { PATTERN_GUIDE, VERDICT_META, COLORS, tfLabel, type Timeframe } from '../lib/patterns'
import { fmtPct, fmtPrice } from '../lib/format'
import { BiasChip } from './ui'
import type { TradePreset } from './TradePanel'

interface Props {
  analysis: Analysis
  price: number
  tf: Timeframe
  active: string | null
  setActive: (id: string | null) => void
  onUsePlan: (p: Omit<TradePreset, 'nonce'>) => void
}

const fadeUp = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } }

export function VerdictCard({ analysis, price, tf, onUsePlan }: Pick<Props, 'analysis' | 'price' | 'tf' | 'onUsePlan'>) {
  const { plan, levels } = analysis
  const meta = VERDICT_META[plan.verdict]
  const support = levels.find((l) => l.kind === 'support')
  const resistance = levels.find((l) => l.kind === 'resistance')
  const canTrade = plan.entry != null && plan.stop != null && plan.target != null
  return (
    <motion.section className={`card verdict verdict--${meta.tone}`} {...fadeUp} transition={{ duration: 0.4 }} aria-labelledby="verdict-h">
      <div className="verdict__top">
        <span className="label">Pattern coach · {tfLabel(tf)} chart</span>
        <BiasChip bias={meta.tone === 'bull' ? 'bullish' : meta.tone === 'bear' ? 'bearish' : meta.tone === 'warn' ? 'warn' : 'neutral'}>{meta.label}</BiasChip>
      </div>
      <h2 id="verdict-h">{plan.headline}</h2>
      <div className="plan-grid">
        <div className="plan-box">
          <span className="label">When to buy</span>
          <p>{plan.when}</p>
        </div>
        <div className="plan-box">
          <span className="label">Where to buy</span>
          <p>{plan.where}</p>
        </div>
      </div>
      <div className="levels">
        <div className="level">
          <span>Entry</span>
          <span>{fmtPrice(plan.entry)}</span>
        </div>
        <div className="level">
          <span>Stop-loss</span>
          <span className="down">{fmtPrice(plan.stop)}</span>
        </div>
        <div className="level">
          <span>Target</span>
          <span className="up">{fmtPrice(plan.target)}</span>
        </div>
        <div className="level">
          <span>Reward : risk</span>
          <span>{plan.riskReward != null ? `${plan.riskReward.toFixed(1)} : 1` : '—'}</span>
        </div>
      </div>
      <div className="verdict__actions">
        {canTrade && (
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="btn btn--accent"
            onClick={() => onUsePlan({ side: 'buy', type: plan.orderType, price: plan.orderType === 'market' ? undefined : plan.entry!, stop: plan.stop!, target: plan.target! })}
          >
            Load this plan into the order form
          </motion.button>
        )}
        <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
          {support && <>Support {fmtPrice(support.price)} ({fmtPct(((support.price - price) / price) * 100, 1)}) · </>}
          {resistance && <>Resistance {fmtPrice(resistance.price)} ({fmtPct(((resistance.price - price) / price) * 100, 1)})</>}
        </span>
      </div>
      <ul className="reasons">
        {plan.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="disclaimer">Practice tool only — not financial advice. Chart patterns are probabilities, not promises; always use a stop-loss.</p>
    </motion.section>
  )
}

function statusChip(p: Pattern) {
  if (p.status === 'confirmed') return <span className="chip chip--dim">✓ Confirmed</span>
  if (p.status === 'failed') return <span className="chip chip--dim">✕ Failed</span>
  return <span className="chip chip--dim">◌ Forming</span>
}

export function PatternList({ analysis, active, setActive, onUsePlan, tf }: Omit<Props, 'price'>) {
  const { patterns, indicators: ind } = analysis
  return (
    <>
      <motion.section className="card card__pad" {...fadeUp} transition={{ duration: 0.4, delay: 0.05 }}>
        <h3>Detected patterns</h3>
        {patterns.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
            No classic pattern is clear on the {tfLabel(tf)} chart right now. Try the other timeframe, or lean on the support / resistance levels above.
          </p>
        ) : (
          <div className="patterns">
            {patterns.map((p, i) => {
              const col = p.bias === 'bullish' ? COLORS.bull : p.bias === 'bearish' ? COLORS.bear : COLORS.neutral
              return (
                <motion.div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  className={`pattern${active === p.id ? ' on' : ''}`}
                  onClick={() => setActive(active === p.id ? null : p.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActive(active === p.id ? null : p.id))}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: p.status === 'failed' ? 0.6 : 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="pattern__head">
                    <b>{p.name}</b>
                    <BiasChip bias={p.bias}>{p.bias}</BiasChip>
                    {statusChip(p)}
                    {p.volumeConfirmed && <span className="chip chip--dim">Volume ✓</span>}
                  </div>
                  <p>{p.summary}</p>
                  <p className="how">→ {p.howToTrade}</p>
                  <div className="pattern__levels">
                    <span>Entry <b>{fmtPrice(p.entry)}</b></span>
                    <span>Stop <b>{fmtPrice(p.stop)}</b></span>
                    <span>Target <b>{fmtPrice(p.target)}</b></span>
                    <span>Confidence <b>{p.confidence}%</b></span>
                  </div>
                  <div className="conf">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${p.confidence}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.05 }} style={{ background: col }} />
                  </div>
                  {p.bias === 'bullish' && p.status !== 'failed' && active === p.id && (
                    <button
                      className="btn btn--sm"
                      style={{ marginTop: 10 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onUsePlan({ side: 'buy', type: p.status === 'confirmed' ? 'market' : 'stop', price: p.status === 'confirmed' ? undefined : p.entry, stop: p.stop, target: p.target })
                      }}
                    >
                      Trade this pattern
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
        <p className="disclaimer">Tap a pattern to highlight it on the chart with its entry, stop and target lines.</p>
      </motion.section>

      <motion.section className="card card__pad" {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
        <h3>Indicators</h3>
        <div className="ind-grid">
          <div className="level">
            <span>Trend</span>
            <span className={ind.trend === 'up' ? 'up' : ind.trend === 'down' ? 'down' : ''}>{ind.trend === 'up' ? '▲ Up' : ind.trend === 'down' ? '▼ Down' : '◆ Sideways'}</span>
          </div>
          <div className="level">
            <span>RSI (14)</span>
            <span className={ind.rsi != null && ind.rsi > 70 ? 'down' : ind.rsi != null && ind.rsi < 30 ? 'up' : ''}>
              {ind.rsi != null ? ind.rsi.toFixed(1) : '—'} {ind.rsi != null && (ind.rsi > 70 ? '· overbought' : ind.rsi < 30 ? '· oversold' : '')}
            </span>
          </div>
          <div className="level">
            <span>Volatility (ATR)</span>
            <span>{(ind.atrPct * 100).toFixed(1)}% / candle</span>
          </div>
          <div className="level">
            <span>Volume vs avg</span>
            <span>{ind.volumeRatio != null ? `${ind.volumeRatio.toFixed(2)}×` : '—'}</span>
          </div>
        </div>
      </motion.section>

      <motion.section className="card card__pad" {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
        <h3>Pattern field guide</h3>
        <div className="guide">
          {PATTERN_GUIDE.map((g) => (
            <div key={g.name}>
              <b>
                <span className="dot" style={{ background: g.bias === 'bullish' ? COLORS.bull : g.bias === 'bearish' ? COLORS.bear : COLORS.neutral }} />
                {g.name}
              </b>
              <span className="muted">{g.tip}</span>
            </div>
          ))}
        </div>
        <p className="disclaimer">
          Golden rules: wait for the candle to <em>close</em> beyond the breakout level, look for rising volume on the break, size positions so a stop-out costs only 1–2% of your account, and aim for at least 2 : 1 reward to risk.
        </p>
      </motion.section>
    </>
  )
}
