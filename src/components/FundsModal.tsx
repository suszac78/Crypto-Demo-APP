import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePortfolio } from '../state/PortfolioContext'
import { fmtUsd } from '../lib/format'
import { Icon, Segmented } from './ui'

type Mode = 'add' | 'withdraw' | 'set'

export function FundsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { acct, adjustCash, setCash } = usePortfolio()
  const [mode, setMode] = useState<Mode>('add')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = parseFloat(amount.replace(/[$,]/g, ''))
    if (!isFinite(v)) return setMsg({ ok: false, text: 'Enter a number.' })
    const r = mode === 'add' ? adjustCash(Math.abs(v)) : mode === 'withdraw' ? adjustCash(-Math.abs(v)) : setCash(v)
    setMsg({ ok: r.ok, text: r.msg })
    if (r.ok) setAmount('')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.form
            className="card modal"
            style={{ position: 'relative' }}
            role="dialog"
            aria-modal="true"
            aria-label="Adjust demo funds"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onSubmit={submit}
          >
            <button type="button" className="btn btn--ghost btn--sm modal__close" onClick={onClose} aria-label="Close">
              {Icon.close}
            </button>
            <h2>Demo funds</h2>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              This is fake money for practice. Cash balance: <b className="mono">{fmtUsd(acct.cash)}</b>
            </p>
            <Segmented
              full
              value={mode}
              onChange={(m) => (setMode(m), setMsg(null))}
              options={[
                { value: 'add', label: 'Add' },
                { value: 'withdraw', label: 'Withdraw' },
                { value: 'set', label: 'Set balance' },
              ]}
            />
            <div className="field">
              <label htmlFor="funds-amt">{mode === 'set' ? 'New cash balance' : 'Amount'}</label>
              <div className="input-wrap">
                <input id="funds-amt" className="input" inputMode="decimal" autoFocus placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span>USD</span>
              </div>
            </div>
            <div className="pcts">
              {[1000, 10000, 50000, 100000].map((v) => (
                <button type="button" key={v} onClick={() => setAmount(String(v))}>
                  {fmtUsd(v, { compact: true }).replace('.00', '')}
                </button>
              ))}
            </div>
            {msg && <div className={`msg ${msg.ok ? 'msg--ok' : 'msg--err'}`}>{msg.text}</div>}
            <motion.button whileTap={{ scale: 0.97 }} className="btn btn--accent btn--block" type="submit">
              {mode === 'add' ? 'Add funds' : mode === 'withdraw' ? 'Withdraw' : 'Set balance'}
            </motion.button>
            <p className="hint" style={{ margin: 0 }}>Deposits and withdrawals don't count as profit or loss — P&L tracks trading only.</p>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
