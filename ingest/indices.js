/* ===========================================================================
   Motor de índices de sequía (JavaScript)  ·  SAAT Sequía · GOAL
   ===========================================================================
   Implementación de SPI, SPEI y CDD idéntica a ingest/indices.py (referencia).
   Se usa tanto en el navegador (index.html) como en Node (validación).
   Metodología validada 2026-09-14 (Climate Data Guide/UCAR, spei.csic.es,
   McKee 1993). Ver docs/METODOLOGIA_SEQUIA.md.
   =========================================================================== */
(function (root) {
  "use strict";

  /* ---- Utilidades estadísticas ------------------------------------------ */

  // Inversa de la CDF normal estándar (Acklam). Error < 1.15e-9.
  function invNorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
    var plow = 0.02425, phigh = 1 - plow, q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  // ln Gamma (Lanczos g=7).
  function gammaln(x) {
    var g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
             771.32342877765313, -176.61502916214059, 12.507343278686905,
             -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
    x -= 1;
    var a = g[0], t = x + 7.5, i;
    for (i = 1; i < 9; i++) a += g[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function gammaFn(x) { return Math.exp(gammaln(x)); }

  // CDF Gamma regularizada P(a, x/beta).
  function gammaCdf(x, alpha, beta) {
    if (x <= 0) return 0;
    var a = alpha, xx = x / beta, i, term, s, n, tiny, f, c, dd, an, bb, delta;
    if (xx < a + 1) {
      term = 1 / a; s = term; n = a;
      for (i = 0; i < 500; i++) { n += 1; term *= xx / n; s += term;
        if (Math.abs(term) < Math.abs(s) * 1e-12) break; }
      return s * Math.exp(-xx + a * Math.log(xx) - gammaln(a));
    }
    tiny = 1e-30; f = tiny; c = f; dd = 0;
    for (i = 1; i < 500; i++) {
      an = (i > 1) ? -i * (i - a) : 1;
      bb = (i === 1) ? (xx + 1 - a) : (xx + 2 * i - 1 - a);
      dd = bb + an * dd; if (Math.abs(dd) < tiny) dd = tiny;
      c = bb + an / c;  if (Math.abs(c) < tiny) c = tiny;
      dd = 1 / dd; delta = c * dd; f *= delta;
      if (Math.abs(delta - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-xx + a * Math.log(xx) - gammaln(a)) * f;
  }

  function mean(arr) { var s = 0, i; for (i = 0; i < arr.length; i++) s += arr[i]; return s / arr.length; }
  function variance(arr, m) { var s = 0, i; for (i = 0; i < arr.length; i++) s += (arr[i]-m)*(arr[i]-m); return s/(arr.length-1); }

  /* ---- SPI (Gamma) ------------------------------------------------------- */

  function spiGamma(seriesRef, value) {
    var ref = seriesRef.filter(function (v) { return v !== null && v !== undefined; });
    var pos = ref.filter(function (v) { return v > 0; });
    if (pos.length < 5) return null;
    var q = (ref.length - pos.length) / ref.length;
    var m = mean(pos), va = variance(pos, m);
    if (va <= 0) return null;
    var alpha = m * m / va, beta = va / m, p;
    if (value <= 0) p = q;
    else p = q + (1 - q) * gammaCdf(value, alpha, beta);
    p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
    return Math.max(-3, Math.min(3, invNorm(p)));
  }

  // Wilson-Hilferty (método boletín SIMGER, trazabilidad con lo desplegado).
  function spiWilsonHilferty(seriesRef, value) {
    var pos = seriesRef.filter(function (v) { return v !== null && v !== undefined && v > 0; });
    if (pos.length < 5 || value <= 0) return null;
    var m = mean(pos), va = variance(pos, m), alpha = m * m / va;
    var z = Math.pow(value / m, 1 / 3);
    var muZ = 1 - 1 / (9 * alpha), sigZ = Math.sqrt(1 / (9 * alpha));
    return Math.max(-3, Math.min(3, (z - muZ) / sigZ));
  }

  /* ---- SPEI (log-logística, PWM) ---------------------------------------- */

  // PWM tipo-alfa w_s = media[(1-F)^s x], F=(i-0.35)/n, x ascendente.
  function loglogisticFit(data) {
    var x = data.filter(function (v) { return v !== null && v !== undefined; })
                .slice().sort(function (p, q) { return p - q; });
    var n = x.length, i, w0 = 0, w1 = 0, w2 = 0, F;
    if (n < 5) return null;
    for (i = 0; i < n; i++) {
      w0 += x[i];
      F = 1 - (i + 1 - 0.35) / n;
      w1 += F * x[i];
      w2 += F * F * x[i];
    }
    w0 /= n; w1 /= n; w2 /= n;
    var denom = 6 * w1 - w0 - 6 * w2;
    if (denom === 0) return null;
    var beta = (2 * w1 - w0) / denom;
    if (beta <= 1) return null;               // Gamma(1±1/beta) requiere beta>1
    var g1 = gammaFn(1 + 1 / beta) * gammaFn(1 - 1 / beta);
    var alpha = (w0 - 2 * w1) * beta / g1;
    var gamma = w0 - alpha * g1;
    if (alpha <= 0) return null;
    return { alpha: alpha, beta: beta, gamma: gamma };
  }

  function loglogisticCdf(x, fit) {
    if (x - fit.gamma <= 0) return 1e-6;
    return 1 / (1 + Math.pow(fit.alpha / (x - fit.gamma), fit.beta));
  }

  // Control de ajuste (añadido 2026-11-03, Bloque 2). En estación seca D = P − PET ≈ −PET
  // tiene poca dispersión y la log-logística PWM puede quedar con el origen (gamma) por
  // ENCIMA del mínimo de la referencia: la CDF vale 0 para esos años y el SPEI se satura
  // en −3 (falsa sequía extrema). El ajuste se acepta sólo si (1) gamma < mín(ref),
  // (2) KS frente a Gringorten <= 0.20 y (3) ningún valor de la referencia satura (|z| >= 2.9).
  // Si no se acepta, spei() devuelve null y quien llama usa la distribución empírica.
  function speiFitOk(seriesRefD, fit) {
    var x = seriesRefD.filter(function (v) { return v !== null && v !== undefined; })
                      .slice().sort(function (p, q) { return p - q; });
    var n = x.length, i, F, ks = 0, z;
    if (!fit || n < 5 || fit.gamma >= x[0]) return false;
    for (i = 0; i < n; i++) {
      F = loglogisticCdf(x[i], fit);
      ks = Math.max(ks, Math.abs(F - (i + 1 - 0.44) / (n + 0.12)));
      z = invNorm(Math.min(Math.max(F, 1e-6), 1 - 1e-6));
      if (Math.abs(z) >= 2.9) return false;
    }
    return ks <= 0.20;
  }

  function spei(seriesRefD, valueD) {
    var fit = loglogisticFit(seriesRefD);
    if (!fit || !speiFitOk(seriesRefD, fit)) return null;
    var p = Math.min(Math.max(loglogisticCdf(valueD, fit), 1e-6), 1 - 1e-6);
    return Math.max(-3, Math.min(3, invNorm(p)));
  }

  // Respaldo empírico (Gringorten) — misma fórmula que speiAt de la app.
  function speiEmpirico(seriesRefD, valueD) {
    var ref = seriesRefD.filter(function (v) { return v !== null && v !== undefined; });
    if (ref.length < 5) return null;
    var all = ref.concat([valueD]).slice().sort(function (p, q) { return p - q; });
    var n = all.length, r = all.indexOf(valueD);
    var p = Math.min(Math.max((r + 1 - 0.44) / (n + 0.12), 1e-6), 1 - 1e-6);
    return Math.max(-3, Math.min(3, invNorm(p)));
  }

  /* ---- PET Hargreaves + Ra (FAO-56) ------------------------------------- */

  function raExtraterrestrial(latDeg, doy) {
    var lat = latDeg * Math.PI / 180;
    var dr = 1 + 0.033 * Math.cos(2 * Math.PI / 365 * doy);
    var dec = 0.409 * Math.sin(2 * Math.PI / 365 * doy - 1.39);
    var ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(dec))));
    var raMj = (24 * 60 / Math.PI) * 0.0820 * dr *
      (ws * Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.sin(ws));
    return raMj * 0.408;                        // MJ/m2/día -> mm/día
  }

  function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
  function dayOfYear(year, month, day) {
    return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
  }

  function petHargreavesMonth(tmax, tmin, latDeg, year, month) {
    var tmean = (tmax + tmin) / 2;
    var nd = daysInMonth(year, month);
    var ra = raExtraterrestrial(latDeg, dayOfYear(year, month, 15));
    var petDay = 0.0023 * ra * (tmean + 17.8) * Math.sqrt(Math.max(0, tmax - tmin));
    return petDay * nd;
  }

  /* ---- CDD (ETCCDI) ----------------------------------------------------- */

  function cdd(daily, threshold) {
    threshold = (threshold === undefined) ? 1.0 : threshold;
    var run = 0, best = 0, i, v;
    for (i = 0; i < daily.length; i++) {
      v = daily[i];
      if (v === null || v === undefined) continue;
      if (v < threshold) { run++; if (run > best) best = run; }
      else run = 0;
    }
    return best;
  }

  /* ---- Clasificación (McKee 1993 — SPI y SPEI) -------------------------- */

  function classify(z) {
    if (z >= 2.0) return { cls: "Extremadamente húmedo", color: "#5dade2" };
    if (z >= 1.5) return { cls: "Muy húmedo", color: "#2ecc71" };
    if (z >= 1.0) return { cls: "Moderadamente húmedo", color: "#58d68d" };
    if (z > -1.0) return { cls: "Condiciones normales", color: "#7f8c8d" };
    if (z > -1.5) return { cls: "Sequía moderada", color: "#f39c12" };
    if (z > -2.0) return { cls: "Sequía severa", color: "#e74c3c" };
    return { cls: "Sequía extrema", color: "#c0392b" };
  }
  function alertLevel(z) {
    if (z <= -2.0) return { t: "ALERTA ROJA", c: "#e74c3c" };
    if (z <= -1.5) return { t: "ALERTA AMARILLA", c: "#f39c12" };
    if (z <= -1.0) return { t: "ALERTA VERDE", c: "#58d68d" };
    return { t: "NORMAL", c: "#7f8c8d" };
  }

  var API = {
    invNorm: invNorm, gammaFn: gammaFn, gammaCdf: gammaCdf,
    spiGamma: spiGamma, spiWilsonHilferty: spiWilsonHilferty,
    loglogisticFit: loglogisticFit, loglogisticCdf: loglogisticCdf, spei: spei,
    speiFitOk: speiFitOk, speiEmpirico: speiEmpirico,
    raExtraterrestrial: raExtraterrestrial, petHargreavesMonth: petHargreavesMonth,
    daysInMonth: daysInMonth, dayOfYear: dayOfYear,
    cdd: cdd, classify: classify, alertLevel: alertLevel
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SequiaIndices = API;
})(typeof self !== "undefined" ? self : this);
