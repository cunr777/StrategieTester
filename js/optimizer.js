/**
 * StrategyOptimizer — testet Variationen der Strategie und findet bessere Parameter.
 * Gibt konkrete Vorschläge mit echten Vorher/Nachher-Zahlen zurück.
 */
const StrategyOptimizer = (() => {

  // ── Variationen generieren ────────────────────────────────────
  function buildVariations(parsed) {
    const vars = [];

    // 1. RSI-Schwelle anpassen
    const rsiRules = parsed.indicatorRules.filter(r => r.type === 'rsi');
    for (const rule of rsiRules) {
      if (rule.op === '<') {
        // Tighter (z.B. 30 → 25, 20)
        for (const v of [rule.val - 5, rule.val - 10].filter(x => x > 5 && x !== rule.val)) {
          vars.push({
            label: `RSI-Grenze verschärfen: ${rule.val} → ${v}`,
            hint: 'Weniger, aber qualitativ bessere Signale',
            modify: p => modifyRSI(p, rule, v),
          });
        }
        // Looser
        for (const v of [rule.val + 5, rule.val + 10].filter(x => x < 50 && x !== rule.val)) {
          vars.push({
            label: `RSI-Grenze lockern: ${rule.val} → ${v}`,
            hint: 'Mehr Trades, evtl. höhere Win-Rate',
            modify: p => modifyRSI(p, rule, v),
          });
        }
      }
      if (rule.op === '>') {
        for (const v of [rule.val + 5, rule.val + 10].filter(x => x < 95 && x !== rule.val)) {
          vars.push({ label: `RSI-Grenze verschärfen: ${rule.val} → ${v}`, hint: 'Strengere Short-Signale', modify: p => modifyRSI(p, rule, v) });
        }
        for (const v of [rule.val - 5, rule.val - 10].filter(x => x > 50 && x !== rule.val)) {
          vars.push({ label: `RSI-Grenze lockern: ${rule.val} → ${v}`, hint: 'Mehr Short-Trades', modify: p => modifyRSI(p, rule, v) });
        }
      }
    }

    // 2. RR-Ratio erhöhen / senken
    if (parsed.rr < 3) vars.push({ label: `RR-Ratio erhöhen: 1:${parsed.rr} → 1:${parsed.rr + 1}`, hint: 'Höheres Gewinnpotenzial pro Trade', modify: p => ({ ...p, rr: p.rr + 1 }) });
    if (parsed.rr > 1) vars.push({ label: `RR-Ratio senken: 1:${parsed.rr} → 1:${parsed.rr - 1}`,  hint: 'TP wird öfter erreicht → mehr Wins', modify: p => ({ ...p, rr: p.rr - 1 }) });
    if (parsed.rr < 4) vars.push({ label: `RR-Ratio 1:${parsed.rr} → 1:3`,  hint: 'Klassisches 1:3 Verhältnis', modify: p => ({ ...p, rr: 3 }) });

    // 3. SL-Prozent anpassen
    if (parsed.slPct != null && parsed.slMode !== 'gap-edge') {
      const sl = parsed.slPct;
      if (sl > 0.5) vars.push({ label: `SL enger: ${sl}% → ${+(sl * 0.7).toFixed(2)}%`, hint: 'Kleinere Verluste bei Losses', modify: p => ({ ...p, slPct: +(sl * 0.7).toFixed(2) }) });
      if (sl < 3)   vars.push({ label: `SL weiter: ${sl}% → ${+(sl * 1.5).toFixed(2)}%`, hint: 'Weniger vorzeitige Ausstopper', modify: p => ({ ...p, slPct: +(sl * 1.5).toFixed(2) }) });
    }

    // 4. Timeframe wechseln
    const tfAlts = { '1m':'5m', '5m':'15m', '15m':'1h', '1h':'4h', '4h':'1d', '1d':'4h', '1w':'1d' };
    const tf2 = tfAlts[parsed.timeframe];
    if (tf2) vars.push({ label: `Timeframe wechseln: ${parsed.timeframe} → ${tf2}`, hint: 'Anderer TF kann Rauschen reduzieren', modify: p => ({ ...p, timeframe: tf2 }) });

    // 5. Richtung einschränken (wenn beide)
    if (parsed.directions.length === 2) {
      vars.push({ label: 'Nur Long-Trades', hint: 'Im Bullenmarkt profitabler', modify: p => ({ ...p, directions: ['long'] }) });
      vars.push({ label: 'Nur Short-Trades', hint: 'Im Bärenmarkt profitabler', modify: p => ({ ...p, directions: ['short'] }) });
    }

    // 6. EMA-Filter hinzufügen (wenn noch nicht vorhanden)
    const hasEMA = parsed.indicatorRules.some(r => r.type === 'emacross');
    if (!hasEMA) {
      vars.push({
        label: 'EMA-200 Trend-Filter hinzufügen',
        hint: 'Nur Long über EMA200, nur Short darunter → filtert Gegentrendtrades',
        modify: p => ({
          ...p,
          indicatorRules: [...p.indicatorRules, { type: 'ema200filter', signal: 'both' }],
        }),
      });
    }

    // Duplikate entfernen (gleiche label)
    const seen = new Set();
    return vars.filter(v => { if (seen.has(v.label)) return false; seen.add(v.label); return true; });
  }

  function modifyRSI(parsed, targetRule, newVal) {
    return {
      ...parsed,
      indicatorRules: parsed.indicatorRules.map(r =>
        r === targetRule ? { ...r, val: newVal } : r
      ),
    };
  }

  // ── EMA200-Filter in generateSignals einbauen ─────────────────
  // (wird in backtest.js als zusätzliche Post-Filter-Logik genutzt)
  function applyEMA200Filter(candles, signals, directions) {
    // EMA200 berechnen
    const closes = candles.map(c => c.close);
    const period = 200;
    if (closes.length < period) return signals;

    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += closes[i];
    let ema = sum / period;
    const ema200 = new Array(closes.length).fill(null);
    ema200[period - 1] = ema;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
      ema200[i] = ema;
    }

    return signals.map((s, i) => {
      if (!s || !ema200[i]) return s;
      if (s === 'long'  && candles[i].close < ema200[i]) return null; // Long unter EMA200 → filter
      if (s === 'short' && candles[i].close > ema200[i]) return null; // Short über EMA200 → filter
      return s;
    });
  }

  // ── Einzelne Variation testen ─────────────────────────────────
  async function testVariation(variation, parsed, klines) {
    const modifiedParsed = variation.modify(parsed);
    const allTrades = [];

    for (const sym of modifiedParsed.symbols) {
      const data = klines[sym];
      if (!data || data.length < 30) continue;

      let combinedSignals = new Array(data.length).fill(null);

      for (const rule of modifiedParsed.indicatorRules) {
        if (rule.type === 'ema200filter') continue; // separat behandelt
        const sigs = BacktestEngine._generateSignals(data, rule, modifiedParsed.directions);
        for (let i = 0; i < sigs.length; i++) {
          if (sigs[i]) combinedSignals[i] = sigs[i];
        }
      }

      // EMA200 Filter anwenden wenn vorhanden
      if (modifiedParsed.indicatorRules.some(r => r.type === 'ema200filter')) {
        combinedSignals = applyEMA200Filter(data, combinedSignals, modifiedParsed.directions);
      }

      const gapEdges = modifiedParsed.slMode === 'gap-edge'
        ? BacktestEngine._calcGapEdges(data, modifiedParsed.directions)
        : null;

      const trades = BacktestEngine._simulateTrades(
        data, combinedSignals,
        modifiedParsed.slPct, modifiedParsed.rr,
        modifiedParsed.slMode, gapEdges, modifiedParsed
      );
      trades.forEach(t => { t.symbol = sym; });
      allTrades.push(...trades);
    }

    return BacktestEngine.calcKPIs(allTrades);
  }

  // ── Haupt-Optimierungs-Funktion ───────────────────────────────
  async function optimize(parsed, klines, baseKPIs, onProgress) {
    const variations = buildVariations(parsed);
    const results = [];

    for (const variation of variations) {
      onProgress?.(`🔍 Teste: ${variation.label}…`);
      try {
        const kpis = await testVariation(variation, parsed, klines);

        const deltaWinRate = kpis.winRate      - baseKPIs.winRate;
        const deltaReturn  = kpis.totalReturn  - baseKPIs.totalReturn;
        const deltaTrades  = kpis.trades       - baseKPIs.trades;

        results.push({
          label:       variation.label,
          hint:        variation.hint,
          kpis,
          deltaWinRate,
          deltaReturn,
          deltaTrades,
          score: deltaWinRate * 0.5 + deltaReturn * 0.5, // Gesamt-Score
        });
      } catch(e) {
        // Variation schlug fehl → überspringen
      }
      await new Promise(r => setTimeout(r, 10));
    }

    // Nach Score sortieren, Top-5 zurückgeben
    return results
      .filter(r => r.kpis.trades > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  return { optimize };
})();
