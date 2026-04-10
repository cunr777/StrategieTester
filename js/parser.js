/**
 * StrategyParser v2 — vollständige Freitext-Analyse.
 * Liest ALLES aus dem Text: Bedingungen, Zahlen, Symbole, Richtungen, RR/SL/TP.
 * Kein starres Stichwort-Matching — kontextuelle Extraktion.
 */
const StrategyParser = (() => {

  // ── Symbol-Mapping ────────────────────────────────────────────
  const COIN_MAP = {
    bitcoin: 'BTCUSDT', btc: 'BTCUSDT',
    ethereum: 'ETHUSDT', eth: 'ETHUSDT',
    solana: 'SOLUSDT', sol: 'SOLUSDT',
    bnb: 'BNBUSDT', binance: 'BNBUSDT',
    xrp: 'XRPUSDT', ripple: 'XRPUSDT',
    cardano: 'ADAUSDT', ada: 'ADAUSDT',
    dogecoin: 'DOGEUSDT', doge: 'DOGEUSDT',
    avalanche: 'AVAXUSDT', avax: 'AVAXUSDT',
    polkadot: 'DOTUSDT', dot: 'DOTUSDT',
    chainlink: 'LINKUSDT', link: 'LINKUSDT',
    polygon: 'MATICUSDT', matic: 'MATICUSDT',
    litecoin: 'LTCUSDT', ltc: 'LTCUSDT',
    uniswap: 'UNIUSDT', uni: 'UNIUSDT',
    pepe: 'PEPEUSDT',
    shib: 'SHIBUSDT', shiba: 'SHIBUSDT',
    near: 'NEARUSDT',
    atom: 'ATOMUSDT', cosmos: 'ATOMUSDT',
    filecoin: 'FILUSDT', fil: 'FILUSDT',
    aave: 'AAVEUSDT',
    sui: 'SUIUSDT',
    aptos: 'APTUSDT', apt: 'APTUSDT',
    arbitrum: 'ARBUSDT', arb: 'ARBUSDT',
    optimism: 'OPUSDT', op: 'OPUSDT',
    injective: 'INJUSDT', inj: 'INJUSDT',
    ton: 'TONUSDT',
    trx: 'TRXUSDT', tron: 'TRXUSDT',
    ftm: 'FTMUSDT', fantom: 'FTMUSDT',
    hbar: 'HBARUSDT', hedera: 'HBARUSDT',
    ldo: 'LDOUSDT', lido: 'LDOUSDT',
    stx: 'STXUSDT', stacks: 'STXUSDT',
    grt: 'GRTUSDT', graph: 'GRTUSDT',
    mkr: 'MKRUSDT', maker: 'MKRUSDT',
    snx: 'SNXUSDT', synthetix: 'SNXUSDT',
    imx: 'IMXUSDT', immutable: 'IMXUSDT',
    sei: 'SEIUSDT',
    blur: 'BLURUSDT',
    wld: 'WLDUSDT', worldcoin: 'WLDUSDT',
  };

  const DEFAULT_WATCHLIST = [
    'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
    'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT'
  ];

  // ── Normalisierung ────────────────────────────────────────────
  // Ziffern-Wörter (deutsch & englisch) → Zahlen
  const NUM_WORDS = {
    null:0, nul:0, zero:0,
    ein:1, eine:1, eins:1, one:1,
    zwei:2, two:2,
    drei:3, three:3,
    vier:4, four:4,
    fünf:5, funf:5, five:5,
    sechs:6, six:6,
    sieben:7, seven:7,
    acht:8, eight:8,
    neun:9, nine:9,
    zehn:10, ten:10,
    zwanzig:20, twenty:20,
    dreißig:30, dreissig:30, thirty:30,
    vierzig:40, forty:40,
    fünfzig:50, funfzig:50, fifty:50,
    sechzig:60, sixty:60,
    siebzig:70, seventy:70,
    achtzig:80, eighty:80,
    neunzig:90, ninety:90,
    hundert:100, hundred:100,
    zweihundert:200,
  };

  function normalizeText(raw) {
    let t = raw.toLowerCase();
    // Umlaute
    t = t.replace(/ü/g,'ue').replace(/ö/g,'oe').replace(/ä/g,'ae').replace(/ß/g,'ss');
    // Ziffern-Wörter ersetzen
    for (const [word, num] of Object.entries(NUM_WORDS)) {
      t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), String(num));
    }
    // Komma als Dezimalpunkt
    t = t.replace(/(\d),(\d)/g, '$1.$2');
    return t;
  }

  // ── Richtung ───────────────────────────────────────────────────
  function extractDirection(t) {
    const longWords  = /\b(long|buy|bull|kaufen?|kauf|aufwaerts|steigen?|rauf|green candle|call)\b/;
    const shortWords = /\b(short|sell|bear|verkaufen?|verkauf|abwaerts|fallen?|runter|red candle|put)\b/;
    const dirs = [];
    if (longWords.test(t))  dirs.push('long');
    if (shortWords.test(t)) dirs.push('short');
    // Gibt an ob Richtung explizit genannt wurde
    return { dirs: dirs.length ? [...new Set(dirs)] : ['long','short'], explicit: dirs.length > 0 };
  }

  // ── Symbole ────────────────────────────────────────────────────
  function extractSymbols(raw) {
    const t = normalizeText(raw);
    const found = [];

    // Explizite USDT-Pairs (z.B. "ETHUSDT", "ethusdt")
    const pairRe = /\b([a-z]{2,8}usdt)\b/g;
    let m;
    while ((m = pairRe.exec(t)) !== null) {
      const sym = m[1].toUpperCase();
      if (!found.includes(sym)) found.push(sym);
    }

    // Coin-Namen
    for (const [key, sym] of Object.entries(COIN_MAP)) {
      if (new RegExp(`\\b${key}\\b`).test(t) && !found.includes(sym)) {
        found.push(sym);
      }
    }

    // "alle", "altcoins", "kryptos", "watchlist", "coins"
    const allKeywords = /\b(alle|all|altcoins?|kryptos?|crypto|coins?|watchlist|standard|portfolio)\b/;
    if (allKeywords.test(t) && found.length === 0) {
      return { symbols: DEFAULT_WATCHLIST, mode: 'watchlist' };
    }

    if (!found.length) return { symbols: DEFAULT_WATCHLIST, mode: 'watchlist' };
    return { symbols: found, mode: 'specific' };
  }

  // ── Timeframe ──────────────────────────────────────────────────
  function extractTimeframe(t) {
    // Explizite TF-Kürzel
    const m = t.match(/\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)\b/);
    if (m) return m[1];

    // Wort-Varianten
    if (/\b(woechentlich|weekly|1\s*woche|1\s*week)\b/.test(t)) return '1w';
    if (/\b(taeglich|daily|1\s*tag|1\s*day)\b/.test(t))         return '1d';
    if (/\b(4\s*stunde|4\s*hour|vier\s*stunde)\b/.test(t))      return '4h';
    if (/\b(1\s*stunde|1\s*hour|stündlich|hourly)\b/.test(t))   return '1h';
    if (/\b(15\s*min)\b/.test(t))                                return '15m';
    if (/\b(5\s*min)\b/.test(t))                                 return '5m';

    return '1h'; // default
  }

  // ── Zahlen-Extraktor (Kontext-basiert) ────────────────────────
  // Sucht nach "SCHLÜSSELWORT [Vergleich] ZAHL" oder "ZAHL [Vergleich] SCHLÜSSELWORT"
  function findNumber(t, keyword, defaultVal = null) {
    const ops = '(?:unter|below|kleiner|<|ueberverkauft|oversold|ueber|above|groesser|>|ueberkauft|overbought|=|bei|at|on|of|period|periode|laenge)?';
    const re = new RegExp(`${keyword}\\s*${ops}\\s*(\\d+(?:\\.\\d+)?)`, 'i');
    const re2 = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:er|period)?\\s*${keyword}`, 'i');
    const m = t.match(re) || t.match(re2);
    return m ? +m[1] : defaultVal;
  }

  function findOperator(t, keyword) {
    const re = new RegExp(`${keyword}\\s*(unter|below|kleiner als?|<|ueber|above|groesser als?|>)`, 'i');
    const m = t.match(re);
    if (!m) {
      // Kontext: "oversold"/"ueberverkauft" → <, "overbought"/"ueberkauft" → >
      if (/oversold|ueberverkauft|unten|unten|tief/.test(t)) return '<';
      if (/overbought|ueberkauft|hoch|oben/.test(t)) return '>';
      return '<'; // default
    }
    return /unter|below|kleiner|</.test(m[1]) ? '<' : '>';
  }

  // ── RSI ────────────────────────────────────────────────────────
  function extractRSI(t) {
    if (!/\brsi\b/.test(t)) return [];
    const rules = [];

    // Alle RSI-Bedingungen im Text suchen
    const re = /rsi\s*(?:(?:unter|below|<|kleiner)\s*(\d+)|(?:ueber|above|>|groesser)\s*(\d+)|(\d+))/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (m[1]) rules.push({ type:'rsi', op:'<', val:+m[1], signal:'long',  period:14 });
      if (m[2]) rules.push({ type:'rsi', op:'>', val:+m[2], signal:'short', period:14 });
      if (m[3]) {
        const val = +m[3];
        const op = findOperator(t, 'rsi');
        rules.push({ type:'rsi', op, val, signal: op === '<' ? 'long' : 'short', period:14 });
      }
    }

    // "RSI oversold" ohne Zahl
    if (!rules.length) {
      if (/oversold|ueberverkauft/.test(t)) rules.push({ type:'rsi', op:'<', val:30, signal:'long',  period:14 });
      if (/overbought|ueberkauft/.test(t))  rules.push({ type:'rsi', op:'>', val:70, signal:'short', period:14 });
    }

    // RSI-Periode aus dem Text (z.B. "RSI(14)", "14er RSI")
    const perM = t.match(/rsi\s*\(?\s*(\d+)\s*\)?/) || t.match(/(\d+)\s*(?:er|period)?\s*rsi/);
    if (perM) rules.forEach(r => r.period = +perM[1]);

    return rules;
  }

  // ── EMA / SMA ──────────────────────────────────────────────────
  function extractEMACross(t) {
    const rules = [];
    // "EMA 50 kreuzt EMA 200", "50er EMA über 200er EMA", "EMA(50) crosses EMA(200)"
    const re = /(?:ema|sma)\s*\(?\s*(\d+)\s*\)?\s*(?:kreuzt?|crosses?|schneidet?|ueber|above|unter|below)\s*(?:ema|sma)?\s*\(?\s*(\d+)\s*\)?/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
      const fast = +m[1], slow = +m[2];
      const bullish = /von unten|crosses?\s*(up|above)|golden cross|aufwaerts|ueber/.test(t);
      const bearish = /von oben|crosses?\s*(down|below)|death cross|abwaerts|unter/.test(t);
      if (bullish) rules.push({ type:'emacross', fast, slow, signal:'long' });
      else if (bearish) rules.push({ type:'emacross', fast, slow, signal:'short' });
      else { // Richtung unbekannt → beide
        rules.push({ type:'emacross', fast, slow, signal:'long' });
        rules.push({ type:'emacross', fast, slow, signal:'short' });
      }
    }
    // Shortcuts
    if (/golden\s*cross/.test(t)) rules.push({ type:'emacross', fast:50, slow:200, signal:'long' });
    if (/death\s*cross/.test(t))  rules.push({ type:'emacross', fast:50, slow:200, signal:'short' });
    return rules;
  }

  // ── MACD ────────────────────────────────────────────────────────
  function extractMACD(t) {
    if (!/\bmacd\b/.test(t)) return [];
    const rules = [];
    const isBull = /bull|long|buy|kaufen?|positiv|ueber null|kreuz.*oben|crosses?\s*(up|above)|histogram.*positiv/.test(t);
    const isBear = /bear|short|sell|verkaufen?|negativ|unter null|kreuz.*unten|crosses?\s*(down|below)|histogram.*negativ/.test(t);
    if (isBull) rules.push({ type:'macd', signal:'long' });
    if (isBear) rules.push({ type:'macd', signal:'short' });
    if (!rules.length) { // MACD erwähnt, Richtung unklar → beide
      rules.push({ type:'macd', signal:'long' });
      rules.push({ type:'macd', signal:'short' });
    }
    // Optionale Periode (z.B. "MACD 12 26 9")
    const perM = t.match(/macd\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (perM) rules.forEach(r => { r.fast=+perM[1]; r.slow=+perM[2]; r.sig=+perM[3]; });
    return rules;
  }

  // ── Bollinger Bands ─────────────────────────────────────────────
  function extractBollinger(t) {
    if (!/\b(bollinger|bband|bb)\b/.test(t)) return [];
    const rules = [];
    const lower = /unten|lower|unteres?|unterschreitet?|unten berührt?|touches?\s*lower|break.*unten/.test(t);
    const upper = /oben|upper|oberes?|ueberschreitet?|oben berührt?|touches?\s*upper|break.*oben/.test(t);
    if (lower) rules.push({ type:'bb', touch:'lower', signal:'long',  period:20, mult:2 });
    if (upper) rules.push({ type:'bb', touch:'upper', signal:'short', period:20, mult:2 });
    if (!rules.length) { rules.push({ type:'bb', touch:'lower', signal:'long', period:20, mult:2 }); }
    // Periode aus Text (z.B. "BB(20,2)")
    const perM = t.match(/(?:bb|bollinger)\s*\(?\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?))?\s*\)?/);
    if (perM) rules.forEach(r => { r.period = +perM[1]; if (perM[2]) r.mult = +perM[2]; });
    return rules;
  }

  // ── Candlestick-Muster ─────────────────────────────────────────
  const PATTERN_MAP = {
    'hammer':        { signal:'long'  },
    'inverted hammer': { signal:'long' },
    'doji':          { signal:'both'  },
    'engulfing':     { signal:'both'  },
    'bullish engulfing': { signal:'long' },
    'bearish engulfing': { signal:'short' },
    'marubozu':      { signal:'both'  },
    'pinbar':        { signal:'both'  },
    'pin bar':       { signal:'both'  },
    'shooting star': { signal:'short' },
    'morning star':  { signal:'long'  },
    'evening star':  { signal:'short' },
    'three white soldiers': { signal:'long' },
    'three black crows':    { signal:'short' },
    'inside bar':    { signal:'both'  },
    'outside bar':   { signal:'both'  },
    'tweezer':       { signal:'both'  },
  };

  function extractPatterns(t) {
    const rules = [];
    for (const [pat, meta] of Object.entries(PATTERN_MAP)) {
      if (t.includes(pat)) {
        rules.push({ type:'pattern', pattern:pat, signal:meta.signal });
      }
    }
    return rules;
  }

  // ── SL-Modus ───────────────────────────────────────────────────
  function extractSLMode(t) {
    if (/sl\s*(an|at|auf|=)\s*(die|the|der)?\s*(kante|edge|rand|grenze)/.test(t)) return 'gap-edge';
    if (/(kante|edge|rand)\s*(des|of|vom)?\s*(gap|fvg|luecke)/.test(t))           return 'gap-edge';
    if (/stop\s*(an|at)\s*(die|the|der)?\s*(kante|edge)/.test(t))                 return 'gap-edge';
    if (/sl\s*=?\s*(gap|fvg|luecke)/.test(t))                                     return 'gap-edge';
    return 'percent';
  }

  // ── SL / TP / RR ─────────────────────────────────────────────
  function extractSL(t) {
    // "SL 1%", "Stop Loss 2%", "stop 0.5%", "1.5% SL"
    const m = t.match(/(?:sl|stop[\s-]?loss|stop)\s*[=:]?\s*(\d+(?:\.\d+)?)\s*%/)
           || t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:sl|stop[\s-]?loss|stop)/);
    if (m) return +m[1];
    return null; // default wird unten gesetzt
  }

  function extractTP(t) {
    // "TP 3%", "take profit 5%", "3% TP"
    const m = t.match(/(?:tp|take[\s-]?profit|ziel)\s*[=:]?\s*(\d+(?:\.\d+)?)\s*%/)
           || t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:tp|take[\s-]?profit)/);
    return m ? +m[1] : null;
  }

  function extractRR(t) {
    // "1:3", "RR 1:3", "Risk Reward 1 zu 2", "1 zu 3"
    const m = t.match(/(?:rr|risk.?reward|r\/r|rr\s*ratio)\s*[=:]?\s*1\s*[:/]\s*(\d+(?:\.\d+)?)/i)
           || t.match(/\b1\s*(?::|zu|to)\s*(\d+(?:\.\d+)?)\b/i);
    if (m) return +m[1];

    // TP% / SL% → RR berechnen
    const tp = extractTP(t);
    const sl = extractSL(t);
    if (tp && sl && sl > 0) return +(tp / sl).toFixed(2);

    return 2; // default
  }

  // ── Haupt-Parse ────────────────────────────────────────────────
  function parse(raw) {
    const t = normalizeText(raw);
    const errors = [], warnings = [];

    const { dirs: directions, explicit: directionExplicit } = extractDirection(t);
    const { symbols, mode } = extractSymbols(raw);

    // Timeframe: nur explizit erkannt?
    const tfExplicit = /\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|woechentlich|weekly|taeglich|daily|stunde|hour|minute|min)\b/.test(t);
    const timeframe = tfExplicit ? extractTimeframe(t) : null; // null = KI wählt automatisch

    const slMode = extractSLMode(t);
    const slRaw  = extractSL(t);
    const tpRaw  = extractTP(t);
    const rrRaw  = (() => {
      // RR nur explizit wenn direkt genannt
      const m = t.match(/(?:rr|risk.?reward|r\/r)\s*[=:]?\s*1\s*[:/]\s*(\d+(?:\.\d+)?)/i)
             || t.match(/\b1\s*(?::|zu|to)\s*(\d+(?:\.\d+)?)\b/i);
      if (m) return +m[1];
      if (tpRaw && slRaw && slRaw > 0) return +(tpRaw / slRaw).toFixed(2);
      return null; // nicht explizit genannt
    })();
    const rr = rrRaw ?? 2;

    // slPct: wenn gap-edge → null, sonst aus Text oder default 1
    const slPct = slMode === 'gap-edge' ? null : (slRaw ?? 1);

    // Alle Indikator-Regeln sammeln
    const indicatorRules = [
      ...extractRSI(t),
      ...extractEMACross(t),
      ...extractMACD(t),
      ...extractBollinger(t),
      ...extractPatterns(t),
    ];

    // Kein Indikator → Preis-Action / FVG
    if (indicatorRules.length === 0) {
      if (/\b(price.?action|preis.?action|pa|breakout|ausbruch|momentum|trend)\b/.test(t)) {
        indicatorRules.push({ type:'always', signal: directions[0] });
      } else {
        indicatorRules.push({ type:'fvg', signal: directions[0] });
      }
    }

    return {
      directions,
      directionExplicit,
      symbols,
      symbolMode: mode,
      timeframe,
      tfExplicit,
      indicatorRules,
      rr,
      rrExplicit: rrRaw !== null,
      slPct,
      slExplicit: slRaw !== null,
      slMode,
      tpPct: tpRaw,
      errors,
      warnings,
      raw,
    };
  }

  return { parse, DEFAULT_WATCHLIST };
})();
