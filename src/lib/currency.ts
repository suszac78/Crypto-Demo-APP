// Currencies CoinGecko can price coins in. `approx` is a rough units-per-USD
// rate, used only for simulated data and as a fallback if live rates are missing.
export const CURRENCIES = [
  { code: 'usd', name: 'US Dollar', approx: 1 },
  { code: 'eur', name: 'Euro', approx: 0.92 },
  { code: 'gbp', name: 'British Pound', approx: 0.78 },
  { code: 'jpy', name: 'Japanese Yen', approx: 150 },
  { code: 'cad', name: 'Canadian Dollar', approx: 1.37 },
  { code: 'aud', name: 'Australian Dollar', approx: 1.52 },
  { code: 'nzd', name: 'New Zealand Dollar', approx: 1.65 },
  { code: 'chf', name: 'Swiss Franc', approx: 0.88 },
  { code: 'sek', name: 'Swedish Krona', approx: 10.5 },
  { code: 'nok', name: 'Norwegian Krone', approx: 10.8 },
  { code: 'dkk', name: 'Danish Krone', approx: 6.9 },
  { code: 'pln', name: 'Polish Złoty', approx: 3.95 },
  { code: 'inr', name: 'Indian Rupee', approx: 84 },
  { code: 'cny', name: 'Chinese Yuan', approx: 7.2 },
  { code: 'hkd', name: 'Hong Kong Dollar', approx: 7.8 },
  { code: 'sgd', name: 'Singapore Dollar', approx: 1.34 },
  { code: 'krw', name: 'South Korean Won', approx: 1380 },
  { code: 'brl', name: 'Brazilian Real', approx: 5.6 },
  { code: 'mxn', name: 'Mexican Peso', approx: 18 },
  { code: 'zar', name: 'South African Rand', approx: 18.5 },
  { code: 'try', name: 'Turkish Lira', approx: 34 },
  { code: 'aed', name: 'UAE Dirham', approx: 3.67 },
  { code: 'php', name: 'Philippine Peso', approx: 57 },
  { code: 'idr', name: 'Indonesian Rupiah', approx: 15800 },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export function isCurrency(c: string): c is CurrencyCode {
  return CURRENCIES.some((x) => x.code === c)
}

export function approxRate(code: string): number {
  return CURRENCIES.find((c) => c.code === code)?.approx ?? 1
}

/** A round amount worth about `usd` US dollars in `code` (for quick-pick buttons). */
export function niceAmount(usd: number, code: string): number {
  const v = usd * approxRate(code)
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.round(v / mag) * mag
}
