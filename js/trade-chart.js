/**
 * TradeChart — zeichnet Candlestick-Chart mit Kauf/Verkauf-Markierungen.
 * Nutzt lightweight-charts v4.
 */
const TradeChart = (() => {

  let _chart = null;
  let _candleSeries = null;
  let _markers = [];

  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Alten Chart zerstören
    if (_chart) {
      _chart.remove();
      _chart = null;
    }

    const isLight = document.body.classList.contains('light');

    _chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: 420,
      layout: {
        background: { color: isLight ? '#ffffff' : '#0d1117' },
        textColor:  isLight ? '#1f2328' : '#e6edf3',
      },
      grid: {
        vertLines:  { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)' },
        horzLines:  { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: isLight ? '#d0d7de' : '#30363d' },
      timeScale: {
        borderColor: isLight ? '#d0d7de' : '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    _candleSeries = _chart.addCandlestickSeries({
      upColor:   '#26a69a',
      downColor: '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    });

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (_chart) _chart.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return _chart;
  }

  function setCandles(candles) {
    if (!_candleSeries) return;
    const data = candles.map(c => ({
      time:  c.time,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));
    _candleSeries.setData(data);
  }

  function setTrades(trades) {
    if (!_candleSeries) return;

    const markers = [];
    for (const t of trades) {
      // Entry-Marker
      markers.push({
        time:     t.entryTime,
        position: t.dir === 'long' ? 'belowBar' : 'aboveBar',
        color:    t.dir === 'long' ? '#26a69a'  : '#ef5350',
        shape:    t.dir === 'long' ? 'arrowUp'  : 'arrowDown',
        text:     t.dir === 'long' ? '▲ L'      : '▼ S',
        size: 1,
      });

      // Exit-Marker (nur wenn nicht offen)
      if (t.result !== 'open' && t.exitTime) {
        markers.push({
          time:     t.exitTime,
          position: t.result === 'win'
            ? (t.dir === 'long' ? 'aboveBar' : 'belowBar')
            : (t.dir === 'long' ? 'belowBar' : 'aboveBar'),
          color:    t.result === 'win' ? '#26a69a' : '#ef5350',
          shape:    'circle',
          text:     t.result === 'win' ? '✓' : '✗',
          size: 0.8,
        });
      }
    }

    // Nach Zeit sortieren (Pflicht für lightweight-charts)
    markers.sort((a, b) => a.time - b.time);
    _candleSeries.setMarkers(markers);
    _markers = markers;
  }

  function fitContent() {
    if (_chart) _chart.timeScale().fitContent();
  }

  function destroy() {
    if (_chart) { _chart.remove(); _chart = null; _candleSeries = null; }
  }

  return { init, setCandles, setTrades, fitContent, destroy };
})();
