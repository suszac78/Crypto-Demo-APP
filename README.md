# PaperDesk — crypto demo trading

Practice crypto trading with fake money on the top 500 coins, plus a chart-pattern "coach" on every coin page that says **when** and **where** a buy makes sense.

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173), go to **Settings**, and paste your free CoinGecko Demo API key. The key stays in your browser. You can also put it in a `.env` file as `VITE_COINGECKO_API_KEY=...` (see `.env.example`).

Without a key, the app runs on simulated prices so you can try everything.

## Features

- **Top 500 coins** from CoinGecko, refreshed every 5 minutes (you can change this in Settings). Search, sort, gainers/losers, watchlist, 7-day sparklines.
- **Demo account**: start with $10,000. Add, withdraw, or set your cash balance any time with **± Funds**. Deposits don't count toward P&L.
- **Trading**: market, limit, and stop (breakout) orders, plus optional stop-loss / take-profit on each position. Open orders are checked on every price refresh. Simulated fee (default 0.1%).
- **Portfolio**: holdings, unrealized and realized P&L, win rate, P&L chart, allocation, trade, order, and funds history.
- **Pattern coach** (coin page): reads the daily or 4-hour chart (90 days) and detects:
  - Double bottom / double top
  - Head & shoulders / inverse head & shoulders
  - Ascending, descending, and symmetrical triangles
  - Rising / falling wedges
  - Bull / bear flags
  - Cup & handle
  - Support / resistance, RSI, 20/50 moving-average trend, volume confirmation

  Each pattern is drawn on the chart with its entry, stop-loss, and measured-move target. The coach combines them into a verdict (Buy setup, Buy on breakout, Buy the dip, Wait, Caution, Avoid) with a reward-to-risk ratio. One click loads the plan into the order form.

## API usage note

Each refresh uses 2 calls (250 coins per page). Every 5 minutes that's about 17k calls a month if left open 24/7. The free Demo plan allows about 10k a month, so refreshes pause while the tab is hidden. Coin pages use 1 extra call each, cached for 5 minutes.

## Tech

Vite, React, TypeScript, Framer Motion (micro-interactions, reduced-motion aware), TradingView Lightweight Charts. All account data is saved in `localStorage`.

> Educational practice tool. Not financial advice.
