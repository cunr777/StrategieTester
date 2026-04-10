/**
 * StrategyParser — wandelt Freitext in Handelsregeln um.
 *
 * Erkannte Muster:
 *  - Richtung:  long / short / buy / sell / bullish / bearish / kaufen / verkaufen
 *  - Indikatoren: RSI, MACD, EMA, SMA, Bollinger
 *  - Candlestick-Muster: hammer, engulfing, doji, marubozu, pinbar
 *  - Währungen: z.B. "Bitcoin", "ETH", "SOLUSDT", "alle Kryptos", "altcoins"
 *  - Timeframe: 1m,5m,15m,1h,4h,1d,1w
 *  - Klartext-Zahlen: z.B. "RSI unter 30" oder "EMA 50 kreuzt EMA 200"
 */
const StrategyParser = (() => {

  // ── Symbol-Mapping ────────────────────────────────────────────
  const COIN_MAP = {
    bitcoin:   'BTCUSDT', btc: 'BTCUSDT',
    ethereum:  'ETHUSDT', eth: 'ETHUSDT',
    solana:    'SOLUSDT', sol: 'SOLUSDT',
    bnb:       'BNBUSDT', binance: 'BNBUSDT',
    xrp:       'XRPUSDT', ripple: 'XRPUSDT',
    cardano:   'ADAUSDT', ada: 'ADAUSDT',
    dogecoin:  'DOGEUSDT', doge: 'DOGEUSDT',
    avalanche: 'AVAXUSDT', avax: 'AVAXUSDT',
    polkadot:  'DOTUSDT', dot: 'DOTUSDT',
    chainlink: 'LINKUSDT', link: 'LINKUSDT',
    polygon:   'MATICUSDT', matic: 'MATICUSDT', pol: 'POLUSDT',
    litecoin:  'LTCUSDT', ltc: 'LTCUSDT',
    uniswap:   'UNIUSDT', uni: 'UNIUSDT',
    pepe:      'PEPEUSDT',
    shib:      'SHIBUSDT', shiba: 'SHIBUSDT',
    near:      'NEARUSDT',
    atom:      'ATOMUSDT', cosmos: 'ATOMUSDT',
    filecoin:  'FILUSDT', fil: 'FILUSDT',
    aave:      'AAVEUSDT',
    sui:       'SUIUSDT',
    aptos:     'APTUSDT', apt: 'APTUSDT',
    arbitrum:  'ARBUSDT', arb: 'ARBUSDT',
    optimism:  'OPUSDT', op: 'OPUSDT',
    injective: 'INJUSDT', inj: 'INJUSDT',
  };

  const DEFAULT_WATCHLIST = [
    'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
    'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT'
  ];

  // ── Timeframe-Mapping ─────────────────────────────────────────
  const TF_MAP = {
    '1 minute': '1m', '1min': '1m', '1 min': '1m',
    '5 minute': '5m', '5min': '5m', '5 min': '5m',
    '15 minute':'15m','15min':'15m','15 min':'15m',
    '30 minute':'30m','30min':'30m','30 min':'30m',
    '1 hour':   '1h', '1h': '1h', 'hourly': '1h', 'stunde':'1h', 'stündlich':'1h',
    '4 hour':   '4h', '4h': '4h',
    'daily':    '1d', '1 day': '1d', 'täglich':'1d', 'tag':'1d',
    'weekly':   '1w', '1 week':'1w', 'woche':'1w', 'wöchentlich':'1w',
  };

  // ── Indikator-Definitionen ─────────────────────────────────────
  const INDICATORS = {
    rsi:  { name: 'RSI',  params: ['period'], defaultPeriod: 14 },
    macd: { name: 'MACD', params: ['fast','slow','signal'], defaultFast:12, defaultSlow:26, defaultSignal:9 },
    ema:  { name: 'EMA',  params: ['period'], defaultPeriod: 20 },
    sma:  { name: 'SMA',  params: ['period'], defaultPeriod: 20 },
    bb:   { name: 'Bollinger Bands', params: ['period','mult'], defaultPeriod:20, defaultMult:2 },
  };

  // ── Candlestick-Muster ─────────────────────────────────────────
  const PATTERNS = ['hammer','doji','engulfing','marubozu','pinbar','shooting star','morning star','evening star'];

  // ── Hilfsfunktionen ───────────────────────────────────────────
  const txt = t => t.toLowerCase().replace(/[^a-zäöü0-9\s%:.\/]/g, ' ');

  function extractDirection(t) {
    const dirs = [];
    if (/\b(long|buy|bullish|kaufen|kauf|aufwärts|green candle)\b/.test(t)) dirs.push('long');
    if (/\b(short|sell|bearish|verkaufen|verkauf|abwärts|red candle)\b/.test(t)) dirs.push('short');
    if (dirs.length === 0) dirs.push('long','short'); // both if unspecified
    return [...new Set(dirs)];
  }

  function extractSymbols(raw) {
    const t = txt(raw);
    const found = [];

    // Check explicit coin names
    for (const [key, sym] of Object.entries(COIN_MAP)) {
      const re = new RegExp(`\\b${key}\\b`);
      if (re.test(t) && !found.includes(sym)) found.push(sym);
    }

    // Check raw USDT/BTC pairs like "ETHUSDT", "ethbtc"
    const pairRe = /\b([a-z]{2,8}usdt)\b/g;
    let m;
    while ((m = pairRe.exec(t)) !== null) {
      const sym = m[1].toUpperCase();
      if (!found.includes(sym)) found.push(sym);
    }

    // Keywords for "all crypto"
    if (/\b(alle|all|altcoin|altcoins|kryptos?|crypto|coins?|watchlist|standard)\b/.test(t) && found.length === 0) {
      return { symbols: DEFAULT_WATCHLIST, mode: 'watchlist' };
    }

    if (found.length === 0) return { symbols: DEFAULT_WATCHLIST, mode: 'watchlist' };
    return { symbols: found, mode: 'specific' };
  }

  function extractTimeframe(t) {
    // First try explicit labels
    for (const [key, val] of Object.entries(TF_MAP)) {
      if (t.includes(key)) return val;
    }
    // Regex for "4h" / "1d" patterns
    const m = t.match(/\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)\b/);
    if (m) return m[1];
    return '1h'; // default
  }

  function extractRSI(t) {
    const rules = [];
    // RSI < X → oversold → long signal
    const re1 = /rsi\s*(?:unter|below|<|kleiner|oversold|überverkauft)?\s*(\d{1,3})/g;
    const re2 = /rsi\s*(?:über|above|>|größer|overbought|überkauft)?\s*(\d{1,3})/g;
    let m;
    while ((m = re1.exec(t)) !== null) {
      rules.push({ type:'rsi', op:'<', val: +m[1], signal: 'long' });
    }
    while ((m = re2.exec(t)) !== null) {
      rules.push({ type:'rsi', op:'>', val: +m[1], signal: 'short' });
    }
    // Fallback pattern: "RSI oversold" → < 30
    if (!rules.length && /rsi/.test(t)) {
      if (/oversold|überverkauft|unter/.test(t)) rules.push({ type:'rsi', op:'<', val:30, signal:'long' });
      if (/overbought|überkauft|über/.test(t))   rules.push({ type:'rsi', op:'>', val:70, signal:'short' });
    }
    return rules;
  }

  function extractEMACross(t) {
    const rules = [];
    // "EMA 50 kreuzt EMA 200 von unten"
    const re = /ema\s*(\d+)\s*(?:kreuzt|crosses?|over|unter|cross)\s*(?:ema\s*)?(\d+)/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const fast = +m[1], slow = +m[2];
      const isBull = /von unten|crosses? (up|above)|golden cross/.test(t);
      rules.push({ type:'emacross', fast, slow, signal: isBull ? 'long' : 'short' });
    }
    // Golden/Death cross shortcut
    if (/golden cross/.test(t)) rules.push({ type:'emacross', fast:50, slow:200, signal:'long' });
    if (/death cross/.test(t))  rules.push({ type:'emacross', fast:50, slow:200, signal:'short' });
    return rules;
  }

  function extractMACD(t) {
    const rules = [];
    if (!(/macd/.test(t))) return rules;
    if (/bullish|long|buy|kaufen|positiv|kreuz(?:t|ung)? (?:nach )?oben|crosses? (up|above)/.test(t))
      rules.push({ type:'macd', signal:'long' });
    if (/bearish|short|sell|verkaufen|negativ|kreuz(?:t|ung)? (?:nach )?unten|crosses? (down|below)/.test(t))
      rules.push({ type:'macd', signal:'short' });
    if (!rules.length) rules.push({ type:'macd', signal:'long' }); // ambiguous → long
    return rules;
  }

  function extractBollinger(t) {
    const rules = [];
    if (!(/bollinger|bb/.test(t))) return rules;
    if (/unter(?:es)?|lower band|unten/.test(t)) rules.push({ type:'bb', touch:'lower', signal:'long' });
    if (/ober(?:es)?|upper band|oben/.test(t))   rules.push({ type:'bb', touch:'upper', signal:'short' });
    return rules;
  }

  function extractPatterns(t) {
    const rules = [];
    for (const p of PATTERNS) {
      if (t.includes(p)) rules.push({ type:'pattern', pattern:p });
    }
    return rules;
  }

  function extractRR(raw) {
    // "1:3", "Risk Reward 1 zu 2", "TP 2%"
    const m = raw.match(/(?:rr|risk.?reward|rr-ratio)\s*[=:]\s*1\s*[:/]\s*(\d+(?:\.\d+)?)/i)
             || raw.match(/1\s*:\s*(\d+(?:\.\d+)?)/);
    if (m) return +m[1];
    // TP percentage
    const tp = raw.match(/tp\s*[=:]?\s*(\d+(?:\.\d+)?)%/i);
    if (tp) return +tp[1];
    return 2; // default 1:2
  }

  function extractSL(raw) {
    const m = raw.match(/sl\s*[=:]?\s*(\d+(?:\.\d+)?)%/i)
             || raw.match(/stop[\s-]?loss\s*[=:]?\s*(\d+(?:\.\d+)?)%/i);
    if (m) return +m[1];
    return 1; // default 1%
  }

  // ── Main parse() ──────────────────────────────────────────────
  function parse(raw) {
    const t = txt(raw);
    const errors = [];
    const warnings = [];

    const directions = extractDirection(t);
    const { symbols, mode } = extractSymbols(raw);
    const timeframe = extractTimeframe(t);
    const rr = extractRR(raw);
    const slPct = extractSL(raw);

    const indicatorRules = [
      ...extractRSI(t),
      ...extractEMACross(t),
      ...extractMACD(t),
      ...extractBollinger(t),
      ...extractPatterns(t),
    ];

    // Kein Indikator → FVG / Preis-Action als Standard (kein Fehler)
    if (indicatorRules.length === 0) {
      // Explizit Preis-Action / simple entry?
      if (/\b(preis.?action|price.?action|breakout|ausbruch|momentum|trend|immer|always|every|jede)\b/.test(t)) {
        indicatorRules.push({ type: 'always', signal: directions[0] });
      } else {
        indicatorRules.push({ type: 'fvg', signal: directions[0] });
      }
    }

    return {
      directions,
      symbols,
      symbolMode: mode,
      timeframe,
      indicatorRules,
      rr,
      slPct,
      errors,
      warnings,
      raw,
    };
  }

  return { parse, DEFAULT_WATCHLIST };
})();
