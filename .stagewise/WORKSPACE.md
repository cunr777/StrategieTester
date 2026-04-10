# WORKSPACE: StrategieTester

## SNAPSHOT

type: single  
langs: HTML5, CSS3, JavaScript (vanilla)  
runtimes: Browser (ES6+)  
pkgManager: none  
deliverables: Static HTML/CSS/JS app  
rootConfigs: none  

## STRUCTURE

`w55eb/index.html` → Main backtest UI | strategy input, KPI dashboard, equity chart, trade table  
`w55eb/info.html` → User guide page | feature reference, examples, disclaimers  
`w55eb/css/style.css` → Design system | dark/light theme, component lib, responsive grid  
`w55eb/js/parser.js` → Strategy parser | NLP → trade rules  
`w55eb/js/backtest.js` → Backtest engine | OHLCV → signals → trades → KPIs  
`w55eb/js/binance.js` → Binance API client | kline data fetcher with rate-limit handling  

## ARCHITECTURE

### Parser (`js/parser.js`)

entry: `StrategyParser.parse(raw: string) → ParsedStrategy`  

Extracts from free-text (German/English):
- **directions**: long | short (default: both)
- **symbols**: Named coins (BTC, ETH, SOL, …) or explicit USDT pairs (ETHUSDT) or watchlist keyword (defaults to 10-coin standard list)
- **timeframe**: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w (default: 1h)
- **indicatorRules**: RSI, EMA-Cross, MACD, Bollinger Bands, candlestick patterns (Hammer, Doji, Engulfing, Pinbar, Marubozu, Shooting Star), FVG fallback
- **rr**: Risk/Reward ratio extracted from "RR 1:X" or "TP X%" (default: 2)
- **slPct**: Stop-loss % from "SL X%" (default: 1%)

Symbols: 40-coin map (bitcoin→BTCUSDT, ethereum→ETHUSDT, … injective→INJUSDT)  
Watchlist (10 coins): BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, AVAXUSDT, DOTUSDT, LINKUSDT  

Returns: `{ directions[], symbols[], symbolMode, timeframe, indicatorRules[], rr, slPct, errors[], warnings[], raw }`

### Backtest Engine (`js/backtest.js`)

entry: `BacktestEngine.run(parsed, klines: {symbol→candles[]}, onProgress) → trades[]`  

Indicators implemented:
- **RSI**: 14-period, crosses threshold → signal
- **EMA**: Parametric period; EMA-Cross detects fast/slow intersection
- **MACD**: 12/26/9; histogram crossover → signal
- **Bollinger Bands**: 20-period, 2σ; price touch upper/lower → signal
- **Candlestick patterns**: Geometric body/wick ratios for hammer, doji, pinbar; engulfing body overlap detection

Signal generation per rule: `generateSignals(candles, rule, directions) → signals[i]`
- Iterates all candles; marks index i with 'long'/'short' if rule condition met
- Multiple rules combined via OR (any rule fire = take trade)

Trade simulation:
- Entry: Next candle open after signal
- Exit: First candle where SL hit (loss) or TP hit (win), else open at end
- SL/TP: Calculated from entry + RR ratio
- P&L: %-based return

KPI calculation: `calcKPIs(trades) → { winRate%, totalReturn%, trades, wins, losses, open, curve[], avgWin, avgLoss }`
- Equity compounding: starting 100 → multiply by (1 + pnlPct/100) per trade
- Curve: equity value after each trade

### Binance API (`js/binance.js`)

entry: `Binance.loadAll(symbols[], interval, startTime, endTime, onProgress) → {symbol→candles[]}`

Kline fetch:
- Endpoint: `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&startTime=X&endTime=Y&limit=1000`
- Pagination: max 10 pages (1000 candles/page); stops if < 1000 returned
- Rate limit: 100ms delay per symbol
- Error handling: Logs warning, returns empty array if symbol unavailable

Candle norm: `{ time (sec), open, high, low, close, volume }`

### UI & Rendering (`index.html`)

**Main Workflow:**
1. User enters strategy text in textarea
2. Live parser preview updates (debounced 600ms)
3. Date range + timeframe override selection
4. "▶ Backtest starten" button
5. Spinner shows progress (log messages from Binance.loadAll + BacktestEngine.run)
6. Results render: KPI grid (6 cards) → Equity chart (Chart.js) → Trade table (9 cols)

**Components:**
- Navbar: Sticky, logo, nav links (Tester/Anleitung), theme toggle
- Strategy input: Textarea with placeholder examples
- Parsed preview: Tag cloud showing detected indicators, direction, symbols, timeframe, RR, SL
- Config row: Start date, end date, TF override, max symbols selector
- KPI grid: 6-card flex grid (Total Return, Win-Rate, Trades, Wins, Losses, Open)
- Equity chart: Chart.js line chart; color green/red based on final equity
- Trade table: 9 cols (ID, Symbol, Direction, Entry, SL, TP, Exit, P&L%, Result); sorted newest first
- Log box: Fixed height, monospace, auto-scroll progress messages
- Empty state: 🔍 hint before backtest run

**Theme:**
- localStorage key: 'theme' (values: 'light' | 'dark')
- CSS vars apply: --bg, --bg2, --bg3, --border, --text, --muted, --accent, --red, --green, --yellow, --blue

### User Guide (`info.html`)

Mirrors index.html navbar + CSS.  
Sections: How parser works, 6 copyable strategy examples, supported indicators, crypto list, limitations & disclaimers.

## KEY FILES

`index.html` → Main app | read for: event handlers (runBacktest, renderKPIs, renderChart, renderTable), config selectors, theme toggle  
`js/parser.js` → Strategy parser | read for: regex patterns for indicators, coin mapping, timeframe aliases, RR/SL extraction  
`js/backtest.js` → Engine logic | read for: indicator calculations (RSI, EMA, MACD, BB), pattern detection, trade simulation, KPI math  
`js/binance.js` → API client | read for: Binance REST endpoint, pagination, rate limiting, candle normalization  
`css/style.css` → Design | read for: color palette (CSS vars), responsive breakpoints, component classes  
`info.html` → Docs | read for: supported indicators, examples, disclaimers  

## STACK

no npm/framework dependencies. External only: **Chart.js 4.4.0** (CDN).

All calculation & parsing: vanilla JS.

## STYLE

- **naming**: camelCase (JS functions: parseRSI, calcKPIs; CSS classes: kpi-card, btn-run)  
- **comments**: Section markers (── ──), brief inline notes  
- **errors**: Try-catch with user-friendly toast messages (log function → UI)  
- **async**: async/await for fetch calls; rate-limit delays via setTimeout  
- **lang**: German UI text; English code comments  
- **formatting**: 2-space indent, 80-char section breaks  

## BUILD

No build step.  
Open `index.html` in browser directly (static file).  
Depends on: Binance REST API (public, no key required), Chart.js CDN, localStorage for theme.

## LOOKUP

add strategy indicator parser rule → `js/parser.js` extractRSI/MACD/etc + INDICATORS const  
add backtest signal logic → `js/backtest.js` generateSignals() case for new rule.type  
add KPI metric → `js/backtest.js` calcKPIs(), `index.html` renderKPIs() + new kpi-card  
add UI input field → `index.html` config-row div + form-group + `index.html` runBacktest() read value  
add new crypto → `js/parser.js` COIN_MAP object  
add CSS component → `css/style.css` new class, tied to --accent/--red/etc vars  
add nav link → `index.html` nav-links + `info.html` nav-links (keep in sync)  
fix UI layout → `css/style.css` .main, .card, .kpi-grid, .config-row  
theme toggle test → localStorage 'theme' key + body.light class toggle  
Binance API error → `js/binance.js` getKlinesRange() error branch + `index.html` log() call  

## NOTES

- **No DB**: All data ephemeral (in-memory klines, no persistence)
- **No auth**: Binance public API; no restrictions
- **No multi-symbol position mgmt**: Multiple simultaneous open trades allowed (simplified model)
- **Trade entry**: Always next candle open (no intrabar fill simulation)
- **Max pages**: 10 pages × 1000 candles = ~1 month of 1h data max per load
- **Browser-only**: Cannot run in Node; requires DOM
- **Language**: German UI, English code; de.DE locale for date formatting
