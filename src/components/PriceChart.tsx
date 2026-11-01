import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time } from 'lightweight-charts'
import type { Candle, ChartPoint, Pattern, Plan, Trade } from '../lib/types'

interface Props {
  candles: Candle[]
  sma20: ChartPoint[]
  sma50: ChartPoint[]
  patterns: Pattern[]
  activePattern: string | null
  plan: Plan | null
  trades: Trade[]
}

const ts = (t: number) => t as UTCTimestamp

function priceFormat(p: number) {
  const precision = p >= 1000 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 5 : p >= 0.0001 ? 7 : 9
  return { type: 'price' as const, precision, minMove: Math.pow(10, -precision) }
}

export function PriceChart({ candles, sma20, sma50, patterns, activePattern, plan, trades }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candleS = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volS = useRef<ISeriesApi<'Histogram'> | null>(null)
  const smaS = useRef<ISeriesApi<'Line'>[]>([])
  const overlay = useRef<ISeriesApi<'Line'>[]>([])

  // Create chart once.
  useEffect(() => {
    if (!el.current) return
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#8a93ad', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(148,163,205,0.06)' }, horzLines: { color: 'rgba(148,163,205,0.06)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(148,163,205,0.15)' },
      timeScale: { borderColor: 'rgba(148,163,205,0.15)', timeVisible: true, rightOffset: 6 },
    })
    candleS.current = c.addCandlestickSeries({
      upColor: '#2ee6a6',
      downColor: '#ff5f7e',
      wickUpColor: '#2ee6a6',
      wickDownColor: '#ff5f7e',
      borderVisible: false,
    })
    volS.current = c.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    smaS.current = [
      c.addLineSeries({ color: 'rgba(143,155,255,0.8)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
      c.addLineSeries({ color: 'rgba(255,193,94,0.7)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
    ]
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [])

  // Data.
  useEffect(() => {
    const cs = candleS.current
    if (!cs || !candles.length) return
    cs.applyOptions({ priceFormat: priceFormat(candles[candles.length - 1].close) })
    cs.setData(candles.map((k) => ({ time: ts(k.time), open: k.open, high: k.high, low: k.low, close: k.close })))
    volS.current?.setData(candles.map((k) => ({ time: ts(k.time), value: k.volume, color: k.close >= k.open ? 'rgba(46,230,166,0.22)' : 'rgba(255,95,126,0.22)' })))
    smaS.current[0]?.setData(sma20.map((p) => ({ time: ts(p.time), value: p.value })))
    smaS.current[1]?.setData(sma50.map((p) => ({ time: ts(p.time), value: p.value })))
    chart.current?.timeScale().fitContent()
  }, [candles, sma20, sma50])

  // Pattern overlays, plan levels and trade markers.
  useEffect(() => {
    const c = chart.current
    const cs = candleS.current
    if (!c || !cs) return
    overlay.current.forEach((s) => c.removeSeries(s))
    overlay.current = []
    const shown = activePattern ? patterns.filter((p) => p.id === activePattern) : patterns.filter((p) => p.status !== 'failed').slice(0, 2)
    for (const p of shown) {
      for (const line of p.lines) {
        // Line series need strictly increasing, unique times.
        const pts = [...line.points].sort((a, b) => a.time - b.time).filter((x, i, arr) => i === 0 || x.time > arr[i - 1].time)
        if (pts.length < 2) continue
        const s = c.addLineSeries({
          color: line.color,
          lineWidth: 2,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: priceFormat(pts[0].value),
        })
        s.setData(pts.map((x) => ({ time: ts(x.time), value: x.value })))
        overlay.current.push(s)
      }
    }

    // Price lines for the selected pattern, or the overall plan.
    const lines: ReturnType<typeof cs.createPriceLine>[] = []
    const src = activePattern ? patterns.find((p) => p.id === activePattern) : plan && plan.entry ? plan : null
    if (src && src.entry && src.stop && src.target) {
      lines.push(cs.createPriceLine({ price: src.entry, color: '#8f9bff', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Entry' }))
      lines.push(cs.createPriceLine({ price: src.stop, color: '#ff5f7e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Stop' }))
      lines.push(cs.createPriceLine({ price: src.target, color: '#2ee6a6', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Target' }))
    }

    // Your demo trades on this coin, snapped to the candle they happened in.
    const first = candles[0]?.time ?? 0
    const markers: SeriesMarker<Time>[] = []
    for (const t of trades) {
      const sec = Math.floor(t.time / 1000)
      if (sec < first) continue
      let k = candles.length - 1
      while (k > 0 && candles[k].time > sec) k--
      markers.push({
        time: ts(candles[k].time),
        position: t.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: t.side === 'buy' ? '#2ee6a6' : '#ff5f7e',
        shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: t.side === 'buy' ? 'B' : 'S',
      })
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    cs.setMarkers(markers)
    return () => {
      // Skip if the chart was already torn down (unmount).
      if (chart.current) lines.forEach((l) => cs.removePriceLine(l))
    }
  }, [patterns, activePattern, plan, trades, candles])

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />
}
