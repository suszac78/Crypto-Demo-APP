// The display currency is set once by the market provider whenever prices load,
// so every formatter below shows amounts in the currency the data is in.
let CURRENCY = 'usd'
export function setDisplayCurrency(code: string) {
  CURRENCY = code
}
export function displayCurrency(): string {
  return CURRENCY
}

/** Currencies like JPY and KRW have no minor unit, so whole amounts drop the decimals. */
function wholeUnitCurrency(): boolean {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY.toUpperCase() }).resolvedOptions().maximumFractionDigits === 0
  } catch {
    return false
  }
}

function money(n: number, min: number, max: number, compact = false): string {
  if (Math.abs(n) >= 1 && wholeUnitCurrency()) min = max = 0
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: CURRENCY.toUpperCase(),
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: Math.min(min, max),
      maximumFractionDigits: max,
    }).format(n)
  } catch {
    return `${n.toLocaleString('en-US', { maximumFractionDigits: max })} ${CURRENCY.toUpperCase()}`
  }
}

export function fmtMoney(n: number | null | undefined, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (n == null || !isFinite(n)) return '—'
  const sign = opts.sign && n > 0 ? '+' : ''
  if (opts.compact && Math.abs(n) >= 1e5) return sign + money(n, 0, 2, true)
  return sign + money(n, 2, 2)
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
  return money(n, 2, digits)
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
