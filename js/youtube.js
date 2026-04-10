/**
 * YouTubeTranscript — holt das Transkript eines YouTube-Videos kostenlos.
 * Strategie: mehrere Proxy-Endpunkte in Reihe versuchen.
 */
const YouTubeTranscript = (() => {

  function extractVideoId(input) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = input.match(p);
      if (m) return m[1];
    }
    return null;
  }

  async function fetchViaYoutubetranscript(videoId) {
    // youtubetranscript.com liefert XML mit <text> Tags
    const proxy = 'https://corsproxy.io/?';
    const url = `https://youtubetranscript.com/?server_vid2=${videoId}`;
    const res = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
    if (!matches.length) throw new Error('Kein Transkript in Antwort');
    return matches.map(m => m[1]
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]*>/g,'')
    ).join(' ');
  }

  async function fetchViaYtApi(videoId) {
    const url = `https://yt-transcript-api.vercel.app/api/transcript?videoId=${videoId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Ungültiges Format');
    return data.map(d => d.text || d.snippet || '').join(' ');
  }

  async function fetchViaAllorigins(videoId) {
    const target = `https://youtubetranscript.com/?server_vid2=${videoId}`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
    if (!matches.length) throw new Error('Kein Transkript');
    return matches.map(m => m[1]
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]*>/g,'')
    ).join(' ');
  }

  async function getTranscript(urlOrId, onProgress) {
    const videoId = extractVideoId(urlOrId.trim());
    if (!videoId) throw new Error('Keine gültige YouTube-URL oder Video-ID');

    onProgress?.(`📺 Video-ID: ${videoId} — lade Transkript…`);

    const methods = [
      { name: 'Methode 1', fn: () => fetchViaYoutubetranscript(videoId) },
      { name: 'Methode 2', fn: () => fetchViaAllorigins(videoId) },
      { name: 'Methode 3', fn: () => fetchViaYtApi(videoId) },
    ];

    let lastError;
    for (const method of methods) {
      try {
        onProgress?.(`  → ${method.name}…`);
        const text = await method.fn();
        if (text && text.length > 50) {
          onProgress?.(`✅ Transkript geladen (${text.split(' ').length} Wörter)`);
          return { videoId, text };
        }
      } catch(e) {
        lastError = e;
      }
    }
    throw new Error(`Transkript nicht verfügbar. Mögliche Gründe: Video hat keine Untertitel, ist privat oder auf Deutsch ohne Auto-Untertitel. (${lastError?.message})`);
  }

  /**
   * Analysiert Transkript auf Strategie-Inhalte.
   * Gibt { hasStrategy, strategyText, reason } zurück.
   */
  function analyzeTranscript(text) {
    const t = text.toLowerCase();

    // Strategie-Schlüsselwörter
    const strategyKeywords = [
      'strategy','strategie','setup','signal','entry','einstieg','long','short',
      'buy','sell','kaufen','verkaufen','rsi','macd','ema','sma','bollinger',
      'support','resistance','widerstand','unterstützung','breakout','ausbruch',
      'stop loss','take profit','sl','tp','risk reward','timeframe','chart',
      'candle','kerze','trend','momentum','indicator','indikator','fibonacci',
      'moving average','crossover','divergence','hammer','engulfing','doji',
      'overbought','oversold','bullish','bearish','pivot','level',
    ];

    const found = strategyKeywords.filter(kw => t.includes(kw));
    const score = found.length;

    if (score < 3) {
      return {
        hasStrategy: false,
        reason: `Keine Trading-Strategie gefunden (nur ${score} Strategie-Begriff${score!==1?'e':''} im Video). Das Video enthält vermutlich keinen Trading-Inhalt.`,
        strategyText: null,
      };
    }

    // Relevante Sätze extrahieren (Sätze die Strategie-Begriffe enthalten)
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 15);
    const relevant = sentences.filter(s => {
      const sl = s.toLowerCase();
      return strategyKeywords.some(kw => sl.includes(kw));
    });

    const strategyText = relevant.slice(0, 40).join('. ');

    return {
      hasStrategy: true,
      reason: `${score} Strategie-Begriffe gefunden (${found.slice(0,5).join(', ')}…)`,
      strategyText,
      foundKeywords: found,
    };
  }

  return { getTranscript, analyzeTranscript, extractVideoId };
})();
