import { useMarket } from '../state/MarketContext'
import { CURRENCIES } from '../lib/currency'

/** Picks the currency for prices and the demo account. */
export function CurrencySelect({ id = 'currency', compact }: { id?: string; compact?: boolean }) {
  const { settings, updateSettings, currency } = useMarket()
  const pending = settings.currency !== currency
  return (
    <select
      id={id}
      className={`select${compact ? ' select--compact' : ''}`}
      value={settings.currency}
      onChange={(e) => updateSettings({ currency: e.target.value })}
      aria-label="Currency"
      title={pending ? 'Loading prices in the new currency…' : 'Currency for prices and your demo account'}
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {compact ? c.code.toUpperCase() : `${c.code.toUpperCase()} — ${c.name}`}
        </option>
      ))}
    </select>
  )
}
