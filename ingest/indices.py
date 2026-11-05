#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de índices de sequía (implementación de referencia)  ·  SAAT Sequía · GOAL
================================================================================
Implementación en Python de SPI, SPEI y CDD, usada como:
  1) Referencia de validación numérica del motor JavaScript del navegador
     (los dos deben coincidir en <1e-6 sobre las mismas series).
  2) Cálculo opcional del lado del servidor (precalcular índices en Firestore).

Metodología (validada 2026-09-14 contra Climate Data Guide/UCAR, spei.csic.es y
McKee et al. 1993):

  SPI  — Ajuste Gamma a la precipitación acumulada por escala; se estandariza como
         Phi^-1(F_gamma(x)). Se ofrece también la aproximación Wilson-Hilferty
         como aproximación de verificación.

  SPEI — Balance hídrico D = P - PET acumulado por escala; ajuste log-logística de
         3 parámetros por PWM insesgado (Vicente-Serrano et al. 2010); se
         estandariza como Phi^-1(F_loglog(D)).

  PET  — Hargreaves (Tmax, Tmin, Ra); Ra (radiación extraterrestre) calculada
         analíticamente por latitud y día del año (FAO-56). Thornthwaite como piso.

  CDD  — Máximo de días consecutivos con P < 1 mm (ETCCDI, índice #16 climdex).

Umbrales (McKee 1993, idénticos para SPI y SPEI porque ambos son N(0,1)):
  >-0.5 sin sequía | -0.5..-1.0 leve | -1.0..-1.5 moderada
  -1.5..-2.0 severa | <=-2.0 extrema.
"""
import math
import calendar

# --------------------------------------------------------------------------- #
#  Utilidades estadísticas
# --------------------------------------------------------------------------- #

def inv_norm(p):
    """Inversa de la CDF normal estándar (algoritmo de Acklam). Error <1.15e-9."""
    if p <= 0.0:
        return -math.inf
    if p >= 1.0:
        return math.inf
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / \
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def gammaln(x):
    """ln Gamma(x) (Lanczos, g=7)."""
    g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
         771.32342877765313, -176.61502916214059, 12.507343278686905,
         -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
    if x < 0.5:
        return math.log(math.pi / math.sin(math.pi * x)) - gammaln(1 - x)
    x -= 1
    a = g[0]
    t = x + 7.5
    for i in range(1, 9):
        a += g[i] / (x + i)
    return 0.5 * math.log(2 * math.pi) + (x + 0.5) * math.log(t) - t + math.log(a)


def gamma_fn(x):
    return math.exp(gammaln(x))


def gamma_cdf(x, alpha, beta):
    """CDF Gamma(alpha=shape, beta=scale) por serie/continued-fraction (regularized P)."""
    if x <= 0:
        return 0.0
    a, xx = alpha, x / beta
    if xx < a + 1:                      # serie
        term = 1.0 / a
        s = term
        n = a
        for _ in range(500):
            n += 1
            term *= xx / n
            s += term
            if abs(term) < abs(s) * 1e-12:
                break
        return s * math.exp(-xx + a * math.log(xx) - gammaln(a))
    # fracción continua (Lentz)
    tiny = 1e-30
    f = tiny; c = f; d = 0.0
    for i in range(1, 500):
        an = -i * (i - a) if i > 1 else 1.0
        b = (xx + 1 - a) if i == 1 else (xx + 2 * i - 1 - a)
        d = b + an * d
        if abs(d) < tiny: d = tiny
        c = b + an / c
        if abs(c) < tiny: c = tiny
        d = 1.0 / d
        delta = c * d
        f *= delta
        if abs(delta - 1.0) < 1e-12:
            break
    q = math.exp(-xx + a * math.log(xx) - gammaln(a)) * f
    return 1.0 - q


# --------------------------------------------------------------------------- #
#  SPI  (Gamma)
# --------------------------------------------------------------------------- #

def spi_gamma(series_ref, value):
    """SPI por ajuste Gamma (método de momentos) + inversa normal de la CDF.
    series_ref: acumulados de precipitación del periodo de referencia (mm).
    value: acumulado objetivo (mm)."""
    pos = [v for v in series_ref if v is not None and v > 0]
    n = len([v for v in series_ref if v is not None])
    if len(pos) < 5:
        return None
    q = (n - len(pos)) / n                      # prob. de cero
    mean = sum(pos) / len(pos)
    var = sum((v - mean) ** 2 for v in pos) / (len(pos) - 1)
    if var <= 0:
        return None
    alpha = mean * mean / var
    beta = var / mean
    if value <= 0:
        p = q
    else:
        p = q + (1 - q) * gamma_cdf(value, alpha, beta)
    p = min(max(p, 1e-6), 1 - 1e-6)
    return max(-3.0, min(3.0, inv_norm(p)))


def spi_wilson_hilferty(series_ref, value):
    """SPI por aproximación Wilson-Hilferty (verificación)."""
    pos = [v for v in series_ref if v is not None and v > 0]
    if len(pos) < 5 or value <= 0:
        return None
    mean = sum(pos) / len(pos)
    var = sum((v - mean) ** 2 for v in pos) / (len(pos) - 1)
    alpha = mean * mean / var
    z = (value / mean) ** (1 / 3)
    mu_z = 1 - 1 / (9 * alpha)
    sig_z = math.sqrt(1 / (9 * alpha))
    return max(-3.0, min(3.0, (z - mu_z) / sig_z))


# --------------------------------------------------------------------------- #
#  SPEI  (log-logística, PWM insesgado)
# --------------------------------------------------------------------------- #

def loglogistic_fit_pwm(data):
    """Ajusta log-logística 3-parámetros por PWM (Vicente-Serrano et al. 2010).
    Devuelve (alpha_escala, beta_forma, gamma_origen). data: lista de D (P-PET).
    PWM tipo-alfa w_s = media[(1-F)^s * x] con posición de trazado F=(i-0.35)/n,
    x ascendente. Validado contra scipy.stats.fisk (recupera params conocidos)."""
    x = sorted(v for v in data if v is not None)
    n = len(x)
    if n < 5:
        return None
    w0 = sum(x) / n
    w1 = sum((1 - (i + 1 - 0.35) / n) * x[i] for i in range(n)) / n
    w2 = sum((1 - (i + 1 - 0.35) / n) ** 2 * x[i] for i in range(n)) / n
    denom = (6 * w1 - w0 - 6 * w2)
    if denom == 0:
        return None
    beta = (2 * w1 - w0) / denom
    if beta <= 1:                      # Gamma(1±1/beta) requiere beta>1
        return None
    g1 = gamma_fn(1 + 1 / beta) * gamma_fn(1 - 1 / beta)
    alpha = (w0 - 2 * w1) * beta / g1
    gamma = w0 - alpha * g1
    if alpha <= 0:
        return None
    return alpha, beta, gamma


def loglogistic_cdf(x, alpha, beta, gamma):
    if x - gamma <= 0:
        return 1e-6
    return 1.0 / (1.0 + (alpha / (x - gamma)) ** beta)


def spei_fit_ok(series_ref_D, fit):
    """Control de ajuste (2026-11-03, Bloque 2), idéntico a speiFitOk de indices.js:
    origen gamma < mín(ref), KS frente a Gringorten <= 0.20 y sin |z| >= 2.9 en la referencia."""
    x = sorted(v for v in series_ref_D if v is not None)
    n = len(x)
    if fit is None or n < 5 or fit[2] >= x[0]:
        return False
    ks = 0.0
    for i, v in enumerate(x):
        F = loglogistic_cdf(v, *fit)
        ks = max(ks, abs(F - (i + 1 - 0.44) / (n + 0.12)))
        if abs(inv_norm(min(max(F, 1e-6), 1 - 1e-6))) >= 2.9:
            return False
    return ks <= 0.20


def spei_empirico(series_ref_D, value_D):
    """Respaldo empírico (Gringorten) con la referencia + el valor objetivo (igual que la app)."""
    ref = [v for v in series_ref_D if v is not None]
    if len(ref) < 5:
        return None
    allv = sorted(ref + [value_D]); n = len(allv); r = allv.index(value_D)
    p = min(max((r + 1 - 0.44) / (n + 0.12), 1e-6), 1 - 1e-6)
    return max(-3.0, min(3.0, inv_norm(p)))


def spei(series_ref_D, value_D):
    """SPEI: ajuste log-logística por PWM sobre D de referencia + inversa normal.
    Devuelve None si el ajuste no pasa spei_fit_ok (usar spei_empirico)."""
    fit = loglogistic_fit_pwm(series_ref_D)
    if fit is None or not spei_fit_ok(series_ref_D, fit):
        return None
    a, b, g = fit
    p = min(max(loglogistic_cdf(value_D, a, b, g), 1e-6), 1 - 1e-6)
    return max(-3.0, min(3.0, inv_norm(p)))


# --------------------------------------------------------------------------- #
#  PET  (Hargreaves)  y radiación extraterrestre Ra (FAO-56)
# --------------------------------------------------------------------------- #

def ra_extraterrestrial(lat_deg, doy):
    """Radiación extraterrestre diaria Ra en mm/día equivalente (FAO-56 eq. 21)."""
    lat = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi / 365 * doy)
    dec = 0.409 * math.sin(2 * math.pi / 365 * doy - 1.39)
    ws = math.acos(max(-1, min(1, -math.tan(lat) * math.tan(dec))))
    ra_mj = (24 * 60 / math.pi) * 0.0820 * dr * (
        ws * math.sin(lat) * math.sin(dec) +
        math.cos(lat) * math.cos(dec) * math.sin(ws))
    return ra_mj * 0.408                    # MJ/m2/día -> mm/día


def pet_hargreaves_month(tmax, tmin, lat_deg, year, month):
    """PET mensual (mm) por Hargreaves usando el día medio del mes."""
    tmean = (tmax + tmin) / 2.0
    ndays = calendar.monthrange(year, month)[1]
    mid_doy = (calendar.datetime.date(year, month, 15) -
               calendar.datetime.date(year, 1, 1)).days + 1
    ra = ra_extraterrestrial(lat_deg, mid_doy)
    pet_day = 0.0023 * ra * (tmean + 17.8) * math.sqrt(max(0.0, tmax - tmin))
    return pet_day * ndays


# --------------------------------------------------------------------------- #
#  CDD  (ETCCDI)
# --------------------------------------------------------------------------- #

def cdd(daily_precip, threshold=1.0):
    """Máximo de días consecutivos con P < threshold mm (por defecto 1 mm)."""
    run = best = 0
    for v in daily_precip:
        if v is None:
            continue
        if v < threshold:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


# --------------------------------------------------------------------------- #
#  Clasificación (McKee 1993 — SPI y SPEI)
# --------------------------------------------------------------------------- #

def classify(z):
    if z >= 2.0:   return "Extremadamente húmedo"
    if z >= 1.5:   return "Muy húmedo"
    if z >= 1.0:   return "Moderadamente húmedo"
    if z > -1.0:   return "Normal"
    if z > -1.5:   return "Sequía moderada"
    if z > -2.0:   return "Sequía severa"
    return "Sequía extrema"


def alert_level(z):
    if z <= -2.0:  return "ROJA"
    if z <= -1.5:  return "AMARILLA"
    if z <= -1.0:  return "VERDE"
    return "NORMAL"


# --------------------------------------------------------------------------- #
#  Vector de validación (se compara contra el motor JS)
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    import json
    # Serie sintética determinista de precipitación mensual (mm), 30 años.
    def synth_precip(y, m):
        # Lluvia con asimetría POSITIVA (como la real): u^2 concentra en valores
        # bajos con cola alta larga -> D=P-PET resulta asimétrico a la derecha,
        # requisito de la log-logística. Determinista para reproducibilidad.
        base = [8, 10, 18, 55, 140, 190, 150, 165, 210, 120, 45, 15][m - 1]
        seed = math.sin(y * 13 + m * 7) * 10000
        u = seed - math.floor(seed)
        return round(base * (0.35 + 1.6 * u * u), 2)

    def synth_temp(y, m):
        tmaxc = [30, 31, 33, 34, 32, 30, 30, 31, 30, 29, 29, 29][m - 1]
        tminc = [15, 15, 17, 18, 19, 19, 18, 18, 18, 18, 16, 15][m - 1]
        warm = (y - 1991) * 0.03
        return tmaxc + warm, tminc + warm

    LAT = 14.05
    years = list(range(1991, 2021))

    # --- SPEI-3 objetivo para (2020, 7) ---
    def accumD(y, m, scale):
        tot = 0.0
        for k in range(scale):
            mm = m - k
            yy = y
            while mm < 1:
                mm += 12; yy -= 1
            P = synth_precip(yy, mm)
            tx, tn = synth_temp(yy, mm)
            PET = pet_hargreaves_month(tx, tn, LAT, yy, mm)
            tot += (P - PET)
        return tot

    scale = 3
    ref_D = [accumD(y, 7, scale) for y in years]
    target_D = accumD(2020, 7, scale)
    z_spei = spei(ref_D, target_D)

    # --- SPI-3 objetivo para (2020, 7) ---
    def accumP(y, m, scale):
        tot = 0.0
        for k in range(scale):
            mm = m - k; yy = y
            while mm < 1:
                mm += 12; yy -= 1
            tot += synth_precip(yy, mm)
        return tot
    ref_P = [accumP(y, 7, scale) for y in years]
    target_P = accumP(2020, 7, scale)
    z_spi = spi_gamma(ref_P, target_P)
    z_spi_wh = spi_wilson_hilferty(ref_P, target_P)

    # --- CDD sobre un año sintético ---
    daily = []
    for m in range(1, 13):
        ndays = calendar.monthrange(2020, m)[1]
        mtot = synth_precip(2020, m)
        wet = max(1, int(mtot / 12))            # nº días lluviosos ~
        for d in range(ndays):
            daily.append(mtot / wet if d % max(1, ndays // wet) == 0 else 0.0)
    z_cdd = cdd(daily)

    out = {
        "target_D": round(target_D, 4),
        "ref_D_first3": [round(v, 4) for v in ref_D[:3]],
        "SPEI_3": round(z_spei, 6),
        "SPEI_class": classify(z_spei),
        "target_P": round(target_P, 4),
        "SPI_3_gamma": round(z_spi, 6),
        "SPI_3_wilson_hilferty": round(z_spi_wh, 6),
        "CDD_2020": z_cdd,
        "PET_jul2020": round(pet_hargreaves_month(*synth_temp(2020, 7), LAT, 2020, 7), 4),
        "Ra_mid_jul": round(ra_extraterrestrial(LAT, 196), 4),
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
