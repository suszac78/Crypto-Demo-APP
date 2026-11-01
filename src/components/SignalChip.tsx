import type { Signal } from '../lib/signals'

/** Compact buy / don't buy / sell badge with the pattern behind it. */
export function SignalChip({ signal, showReason = true }: { signal?: Signal; showReason?: boolean }) {
  if (!signal) return <span className="faint">—</span>
  return (
    <span className="sig" title={signal.reason}>
      <span className={`chip chip--${signal.tone === 'bull' ? 'bull' : signal.tone === 'bear' ? 'bear' : signal.tone === 'warn' ? 'warn' : 'neutral'}`}>{signal.label}</span>
      {showReason && <small>{signal.reason}</small>}
    </span>
  )
}
