import { useEffect, useId, useState } from 'react'
import { motion } from 'framer-motion'
import type { Bias } from '../lib/types'

export function CoinIcon({ src, symbol, large }: { src?: string; symbol: string; large?: boolean }) {
  const [bad, setBad] = useState(false)
  const cls = `coin-icon${large ? ' coin-icon--lg' : ''}`
  if (!src || bad) return <span className={cls} aria-hidden>{symbol.slice(0, 3).toUpperCase()}</span>
  return <img className={cls} src={src} alt="" loading="lazy" onError={() => setBad(true)} />
}

export function Sparkline({ data, width = 120, height = 34 }: { data?: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <span className="faint">—</span>
  // Downsample to ~60 points; plenty for a thumbnail.
  const step = Math.max(1, Math.floor(data.length / 60))
  const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1)
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={d} fill="none" stroke={up ? 'var(--bull)' : 'var(--bear)'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Segmented<T extends string>({ value, options, onChange, full, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; full?: boolean; label?: string }) {
  const id = useId()
  return (
    <div className={`seg${full ? ' seg--full' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="seg__bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function BiasChip({ bias, children }: { bias: Bias | 'warn'; children: React.ReactNode }) {
  const cls = bias === 'bullish' ? 'bull' : bias === 'bearish' ? 'bear' : bias === 'warn' ? 'warn' : 'neutral'
  return <span className={`chip chip--${cls}`}>{children}</span>
}

export function Pct({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  if (v == null || !isFinite(v)) return <span className="faint">—</span>
  return <span className={v >= 0 ? 'up' : 'down'}>{(v > 0 ? '+' : '') + v.toFixed(digits)}%</span>
}

/** Number that briefly flashes green/red when it changes. */
export function Flash({ value, children }: { value: number; children: React.ReactNode }) {
  const [prev, setPrev] = useState(value)
  const [dir, setDir] = useState<0 | 1 | -1>(0)
  useEffect(() => {
    if (value !== prev) {
      setDir(value > prev ? 1 : -1)
      setPrev(value)
      const t = setTimeout(() => setDir(0), 900)
      return () => clearTimeout(t)
    }
  }, [value, prev])
  return (
    <motion.span animate={{ color: dir === 1 ? 'var(--bull)' : dir === -1 ? 'var(--bear)' : 'var(--text)' }} transition={{ duration: 0.4 }}>
      {children}
    </motion.span>
  )
}

export const Icon = {
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  star: (on: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  ),
  back: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
}
