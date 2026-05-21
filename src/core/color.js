/**
 * @module color
 * @description Преобразования цветовых пространств:
 *   sRGB → CIE XYZ (D65)
 *   CIE XYZ → CIE L*a*b*
 *   sRGB → CIE L*a*b* (удобная обёртка)
 *   sRGB → HEX-строка
 *
 * Все входные значения R, G, B принимаются в диапазоне 0–255.
 */

// ─────────────────────────────────────────────────────────────
// Опорный белый D65 (стандартный наблюдатель 2°)
// ─────────────────────────────────────────────────────────────
/** @type {number} */
const Xn = 95.047;
/** @type {number} */
const Yn = 100.0;
/** @type {number} */
const Zn = 108.883;

// ─────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────

/**
 * Линеаризует одну sRGB-компоненту (gamma decoding).
 * Вход: 0–1 (нормализованный sRGB), выход: 0–1 (линейный).
 * @param {number} c — нормализованная sRGB-компонента [0, 1].
 * @returns {number} Линейная компонента [0, 1].
 */
function srgbToLinear(c) {
  return c <= 0.04045
    ? c / 12.92
    : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Порогозависимая функция f(t) для вычисления CIE L*a*b*.
 * f(t) = t^(1/3)                            если t > (6/29)^3
 * f(t) = (1/3)*(29/6)^2 * t + 4/29          иначе
 * @param {number} t — нормализованная координата XYZ / опорный белый.
 * @returns {number}
 */
function labF(t) {
  const delta = 6 / 29; // ≈ 0.206897
  const deltaCubed = delta * delta * delta; // ≈ 0.008856
  if (t > deltaCubed) {
    return Math.cbrt(t);
  }
  return (1 / 3) * (29 / 6) * (29 / 6) * t + 4 / 29;
}

// ─────────────────────────────────────────────────────────────
// Публичные функции
// ─────────────────────────────────────────────────────────────

/**
 * Преобразует цвет из sRGB (0–255) в CIE XYZ (D65).
 *
 * 1. Нормализация R, G, B → [0, 1]
 * 2. Декодирование гаммы (sRGB → линейный RGB)
 * 3. Умножение на матрицу sRGB → XYZ (D65)
 *
 * Матрица (по спецификации IEC 61966-2-1):
 *   X = 0.4124564 · R_lin + 0.3575761 · G_lin + 0.1804375 · B_lin
 *   Y = 0.2126729 · R_lin + 0.7151522 · G_lin + 0.0721750 · B_lin
 *   Z = 0.0193339 · R_lin + 0.1191920 · G_lin + 0.9503041 · B_lin
 *
 * Результат масштабирован: X ∈ [0, ~95], Y ∈ [0, 100], Z ∈ [0, ~109].
 *
 * @param {number} r — красный канал (0–255).
 * @param {number} g — зелёный канал (0–255).
 * @param {number} b — синий канал (0–255).
 * @returns {{ x: number, y: number, z: number }} Координаты CIE XYZ.
 */
export function rgbToXyz(r, g, b) {
  // Нормализация
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  // Линеаризация (gamma decoding)
  const rl = srgbToLinear(rn);
  const gl = srgbToLinear(gn);
  const bl = srgbToLinear(bn);

  // Матричное преобразование (результат × 100)
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) * 100;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl) * 100;
  const z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) * 100;

  return { x, y, z };
}

/**
 * Преобразует цвет из CIE XYZ в CIE L*a*b* (D65).
 *
 * L* = 116 · f(Y/Yn) − 16
 * a* = 500 · (f(X/Xn) − f(Y/Yn))
 * b* = 200 · (f(Y/Yn) − f(Z/Zn))
 *
 * @param {number} x — координата X.
 * @param {number} y — координата Y.
 * @param {number} z — координата Z.
 * @returns {{ L: number, a: number, b: number }} Координаты CIE L*a*b*.
 */
export function xyzToLab(x, y, z) {
  const fx = labF(x / Xn);
  const fy = labF(y / Yn);
  const fz = labF(z / Zn);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bStar = 200 * (fy - fz);

  return { L, a, b: bStar };
}

/**
 * Удобная функция: sRGB (0–255) → CIE L*a*b* (D65).
 * Внутренне вызывает rgbToXyz, затем xyzToLab.
 *
 * @param {number} r — красный канал (0–255).
 * @param {number} g — зелёный канал (0–255).
 * @param {number} b — синий канал (0–255).
 * @returns {{ L: number, a: number, b: number }} Координаты CIE L*a*b*.
 */
export function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

/**
 * Преобразует цвет sRGB (0–255) в HEX-строку вида '#RRGGBB'.
 *
 * @param {number} r — красный канал (0–255).
 * @param {number} g — зелёный канал (0–255).
 * @param {number} b — синий канал (0–255).
 * @returns {string} Строка вида '#FF00AA'.
 */
export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).toUpperCase().padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
