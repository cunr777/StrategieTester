/**
 * BacktestEngine — führt eine geparste Strategie auf OHLCV-Daten aus.
 * Unterstützt: RSI, EMA-Cross, MACD, Bollinger Bands, Pattern (hammer/doji/engulf), FVG-Fallback
 */
const BacktestEngine = (() => {

  // ── Indikatoren ────────────────────────────────────────────────

  function calcRSI(closes, period = 14) {
    const rsi = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return rsi;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    let avgG = gains / period, avgL = losses / period;
    rsi[period] = 100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d >= 0 ? d : 0;
      const l = d <  0 ? -d : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      rsi[i] = 100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL));
    }
    return rsi;
  }

  function calcEMA(closes, period) {
    const ema = new Array(closes.length).fill(null);
    if (closes.length < period) return ema;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += closes[i];
    ema[period - 1] = sum / period;
    for (let i = period; i < closes.length; i++) {
      ema[i] = closes[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }

  function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast   = calcEMA(closes, fast);
    const emaSlow   = calcEMA(closes, slow);
    const macdLine  = closes.map((_, i) =>
      emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
    );
    // Signal line = EMA of macdLine
    const validStart = macdLine.findIndex(v => v !== null);
    const signalLine = new Array(closes.length).fill(null);
    if (validStart >= 0) {
      const macdSlice = macdLine.slice(validStart);
      const sig = calcEMA(macdSlice, signal);
      for (let i = 0; i < sig.length; i++) signalLine[validStart + i] = sig[i];
    }
    const histogram = macdLine.map((v, i) =>
      v !== null && signalLine[i] !== null ? v - signalLine[i] : null
    );
    return { macdLine, signalLine, histogram };
  }

  function calcBB(closes, period = 20, mult = 2) {
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    const mid   = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std  = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
      mid[i]   = mean;
      upper[i] = mean + mult * std;
      lower[i] = mean - mult * std;
    }
    return { upper, lower, mid };
  }

  // ── Candlestick Pattern Checks ─────────────────────────────────

  function isHammer(candle) {
    const body  = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    if (range === 0) return false;
    return lowerWick >= 2 * body && body / range < 0.4;
  }
  function isDoji(candle) {
    const body  = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return range > 0 && body / range < 0.1;
  }
  function isBullEngulf(prev, curr) {
    return prev.close < prev.open && curr.close > curr.open &&
           curr.open  < prev.close && curr.close > prev.open;
  }
  function isBearEngulf(prev, curr) {
    return prev.close > prev.open && curr.close < curr.open &&
           curr.open  > prev.close && curr.close < prev.open;
  }
  function isPinbar(candle) {
    const body     = Math.abs(candle.close - candle.open);
    const range    = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && upperWick >= 2 * body;
  }

  // ── Signal-Generator per Regel ─────────────────────────────────

  function generateSignals(candles, rule, directions) {
    const closes = candles.map(c => c.close);
    let signals  = new Array(candles.length).fill(null); // 'long' | 'short' | null

    if (rule.type === 'rsi') {
      const rsi = calcRSI(closes, 14);
      for (let i = 1; i < candles.length; i++) {
        if (rsi[i] === null) continue;
        if (rule.op === '<' && rsi[i] < rule.val && rsi[i-1] >= rule.val) signals[i] = 'long';
        if (rule.op === '>' && rsi[i] > rule.val && rsi[i-1] <= rule.val) signals[i] = 'short';
      }
    }

    else if (rule.type === 'emacross') {
      const fast = calcEMA(closes, rule.fast);
      const slow = calcEMA(closes, rule.slow);
      for (let i = 1; i < candles.length; i++) {
        if (fast[i] === null || slow[i] === null) continue;
        const crossedUp   = fast[i] > slow[i] && fast[i-1] <= slow[i-1];
        const crossedDown = fast[i] < slow[i] && fast[i-1] >= slow[i-1];
        if (crossedUp   && rule.signal === 'long')  signals[i] = 'long';
        if (crossedDown && rule.signal === 'short')  signals[i] = 'short';
        // If direction not specified: both
        if (crossedUp   && rule.signal !== 'short') signals[i] = 'long';
        if (crossedDown && rule.signal !== 'long')  signals[i] = 'short';
      }
    }

    else if (rule.type === 'macd') {
      const { histogram } = calcMACD(closes);
      for (let i = 1; i < candles.length; i++) {
        if (histogram[i] === null) continue;
        if (histogram[i] > 0 && histogram[i-1] <= 0 && rule.signal !== 'short') signals[i] = 'long';
        if (histogram[i] < 0 && histogram[i-1] >= 0 && rule.signal !== 'long')  signals[i] = 'short';
      }
    }

    else if (rule.type === 'bb') {
      const { upper, lower } = calcBB(closes);
      for (let i = 1; i < candles.length; i++) {
        if (upper[i] === null) continue;
        if (rule.touch === 'lower' && candles[i].low  <= lower[i]) signals[i] = 'long';
        if (rule.touch === 'upper' && candles[i].high >= upper[i]) signals[i] = 'short';
      }
    }

    else if (rule.type === 'pattern') {
      for (let i = 1; i < candles.length; i++) {
        const c = candles[i], p = candles[i-1];
        let sig = null;
        switch(rule.pattern) {
          case 'hammer':        if (isHammer(c))         sig = 'long';  break;
          case 'doji':          if (isDoji(c))            sig = 'long';  break;
          case 'pinbar':        if (isPinbar(c))          sig = 'short'; break;
          case 'shooting star': if (isPinbar(c))          sig = 'short'; break;
          case 'engulfing':
            if (isBullEngulf(p, c)) sig = 'long';
            if (isBearEngulf(p, c)) sig = 'short';
            break;
          case 'marubozu':
            sig = c.close > c.open ? 'long' : 'short'; break;
        }
        if (sig && directions.includes(sig)) signals[i] = sig;
      }
    }

    else if (rule.type === 'fvg') {
      // FVG: Lücke zwischen candle[i-2].high und candle[i].low (bullish)
      for (let i = 2; i < candles.length; i++) {
        const gapBull = candles[i].low  > candles[i-2].high;
        const gapBear = candles[i].high < candles[i-2].low;
        if (gapBull && directions.includes('long'))  signals[i] = 'long';
        if (gapBear && directions.includes('short')) signals[i] = 'short';
      }
    }

    else if (rule.type === 'always') {
      // Kein Indikator — jeden Kerzenabschluss als Signal werten
      // Bullish Kerze → long, Bearish → short
      for (let i = 1; i < candles.length; i++) {
        const bull = candles[i].close > candles[i].open;
        const bear = candles[i].close < candles[i].open;
        if (bull && directions.includes('long'))  signals[i] = 'long';
        if (bear && directions.includes('short')) signals[i] = 'short';
      }
    }

    // Filter by allowed directions
    return signals.map(s => s && directions.includes(s) ? s : null);
  }

  // ── Trade-Simulation ───────────────────────────────────────────

  function simulateTrades(candles, signals, slPct, rrRatio, slMode, gapEdges, parsed) {
    const trades = [];
    let inTrade = false;

    for (let i = 0; i < candles.length - 1; i++) {
      if (inTrade) continue;
      if (!signals[i]) continue;

      const dir    = signals[i];
      const entry  = candles[i + 1].open; // enter next candle open

      // SL: entweder Gap-Kante oder Prozent
      let sl;
      if (slMode === 'gap-edge' && gapEdges && gapEdges[i] != null) {
        sl = gapEdges[i];
      } else {
        const pct = slPct != null ? slPct : 1;
        sl = dir === 'long'
          ? entry * (1 - pct / 100)
          : entry * (1 + pct / 100);
      }

      // TP: entweder direkt aus tpPct oder via RR-Ratio
      let tp;
      if (parsed && parsed.tpPct) {
        tp = dir === 'long'
          ? entry * (1 + parsed.tpPct / 100)
          : entry * (1 - parsed.tpPct / 100);
      } else {
        tp = dir === 'long'
          ? entry + (entry - sl) * rrRatio
          : entry - (sl - entry) * rrRatio;
      }

      const entryTime = candles[i + 1].time;
      let   result    = null, exitPrice = null, exitTime = null;

      for (let j = i + 1; j < candles.length; j++) {
        const c = candles[j];
        if (dir === 'long') {
          if (c.low  <= sl) { result = 'loss'; exitPrice = sl; exitTime = c.time; break; }
          if (c.high >= tp) { result = 'win';  exitPrice = tp; exitTime = c.time; break; }
        } else {
          if (c.high >= sl) { result = 'loss'; exitPrice = sl; exitTime = c.time; break; }
          if (c.low  <= tp) { result = 'win';  exitPrice = tp; exitTime = c.time; break; }
        }
      }

      if (!result) { result = 'open'; exitPrice = candles[candles.length - 1].close; exitTime = candles[candles.length - 1].time; }

      const pnlPct = dir === 'long'
        ? (exitPrice - entry) / entry * 100
        : (entry - exitPrice) / entry * 100;

      trades.push({ dir, entry, sl, tp, exitPrice, entryTime, exitTime, result, pnlPct });
      inTrade = false; // allow multiple trades (no overlap check for simplicity)
    }

    return trades;
  }

  // ── Gap-Kanten für SL berechnen ──────────────────────────────
  function calcGapEdges(candles, directions) {
    const edges = new Array(candles.length).fill(null);
    for (let i = 2; i < candles.length; i++) {
      const gapBull = candles[i].low  > candles[i-2].high;
      const gapBear = candles[i].high < candles[i-2].low;
      // Bullish FVG: SL = untere Kante des Gaps = candles[i-2].high
      if (gapBull && directions.includes('long'))  edges[i] = candles[i-2].high;
      // Bearish FVG: SL = obere Kante des Gaps = candles[i-2].low
      if (gapBear && directions.includes('short')) edges[i] = candles[i-2].low;
    }
    return edges;
  }

  // ── Haupt-Run-Funktion ─────────────────────────────────────────

  async function run(parsed, klines, onProgress) {
    const allTrades = [];

    for (const sym of parsed.symbols) {
      onProgress?.(`Analysiere ${sym}…`);
      const data = klines[sym];
      if (!data || data.length < 30) {
        onProgress?.(`⚠ Nicht genug Daten für ${sym}`);
        continue;
      }

      // Combine signals from all rules (union: any rule fires = trade)
      let combinedSignals = new Array(data.length).fill(null);
      for (const rule of parsed.indicatorRules) {
        const sigs = generateSignals(data, rule, parsed.directions);
        for (let i = 0; i < sigs.length; i++) {
          if (sigs[i]) combinedSignals[i] = sigs[i];
        }
      }

      // Gap-Kanten vorberechnen (für slMode='gap-edge')
      const gapEdges = parsed.slMode === 'gap-edge'
        ? calcGapEdges(data, parsed.directions)
        : null;

      const trades = simulateTrades(data, combinedSignals, parsed.slPct, parsed.rr, parsed.slMode, gapEdges, parsed);
      trades.forEach(t => { t.symbol = sym; });
      allTrades.push(...trades);
    }

    return allTrades;
  }

  // ── KPI-Berechnung ─────────────────────────────────────────────

  function calcKPIs(trades) {
    const closed = trades.filter(t => t.result !== 'open');
    const wins   = closed.filter(t => t.result === 'win');
    const losses = closed.filter(t => t.result === 'loss');
    const open   = trades.filter(t => t.result === 'open');

    const winRate = closed.length > 0 ? (wins.length / closed.length * 100) : 0;

    // Compound equity
    let equity = 100;
    const curve = [100];
    for (const t of trades.sort((a, b) => a.entryTime - b.entryTime)) {
      equity *= (1 + t.pnlPct / 100);
      curve.push(+equity.toFixed(2));
    }
    const totalReturn = equity - 100;

    const avgWin  = wins.length   > 0 ? wins.reduce((s,t)   => s + t.pnlPct, 0) / wins.length   : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s,t) => s + t.pnlPct, 0) / losses.length : 0;

    return { winRate, totalReturn, trades: trades.length, wins: wins.length, losses: losses.length, open: open.length, curve, avgWin, avgLoss };
  }

  return { run, calcKPIs, _generateSignals: generateSignals, _simulateTrades: simulateTrades, _calcGapEdges: calcGapEdges };
})();
