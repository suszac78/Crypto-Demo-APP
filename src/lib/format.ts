export function fmtUsd(n: number | null | undefined, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (n == null || !isFinite(n)) return '—'
  const sign = opts.sign && n > 0 ? '+' : ''
  if (opts.compact && Math.abs(n) >= 1e5) {
    return sign + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(n)
  }
  return sign + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/** Price formatting that keeps meaningful digits for sub-cent coins. */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const a = Math.abs(n)
  let digits = 2
  if (a < 1) digits = 4
  if (a < 0.01) digits = 6
  if (a < 0.0001) digits = 8
  if (a < 0.000001) digits = 10
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(digits) + '%'
}

export function fmtQty(n: number): string {
  if (!isFinite(n)) return '—'
  const a = Math.abs(n)
  const digits = a >= 1000 ? 2 : a >= 1 ? 4 : 8
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
