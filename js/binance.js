/**
 * Binance REST API — holt OHLCV-Kerzendaten für den Backtest.
 */
const Binance = (() => {
  const BASE = 'https://api.binance.com/api/v3';

  function _norm(k) {
    return {
      time:   k[0] / 1000,
      open:   +k[1],
      high:   +k[2],
      low:    +k[3],
      close:  +k[4],
      volume: +k[5],
    };
  }

  async function getKlines(symbol, interval, limit = 500) {
    const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
    const data = await res.json();
    return data.map(_norm);
  }

  async function getKlinesRange(symbol, interval, startTime, endTime) {
    const candles = [];
    let from = startTime;
    let page = 0;
    const MAX_PAGES = 10;

    while (from < endTime && page < MAX_PAGES) {
      const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${from}&endTime=${endTime}&limit=1000`;
      try {
        const res  = await fetch(url);
        if (!res.ok) break;
        const data = await res.json();
        if (!data.length) break;
        candles.push(...data.map(_norm));
        from = data[data.length - 1][0] + 1;
        page++;
        if (data.length < 1000) break;
        await new Promise(r => setTimeout(r, 80));
      } catch { break; }
    }
    return candles;
  }

  /**
   * Lädt Kerzendaten für mehrere Symbole mit Delay (Rate-Limit-Schutz).
   * @returns {Object} { BTCUSDT: [...], ETHUSDT: [...] }
   */
  async function loadAll(symbols, interval, startTime, endTime, onProgress) {
    const result = {};
    for (const sym of symbols) {
      onProgress?.(`📥 Lade ${sym}…`);
      try {
        result[sym] = await getKlinesRange(sym, interval, startTime, endTime);
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        onProgress?.(`⚠ Fehler bei ${sym}: ${e.message}`);
        result[sym] = [];
      }
    }
    return result;
  }

  return { getKlines, getKlinesRange, loadAll };
})();
