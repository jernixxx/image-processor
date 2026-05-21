/**
 * @module levels
 * @description Коррекция уровней изображения с помощью LUT (Look-Up Table).
 *
 * Алгоритм для каждого входного значения (0–255):
 *   1. Ограничение в диапазон [blackPoint, whitePoint]
 *   2. Нормализация: (input − blackPoint) / (whitePoint − blackPoint)
 *   3. Гамма-коррекция: normalized ^ (1 / gamma)
 *   4. Масштабирование до 0–255
 *
 * Создаётся LUT — массив Uint8ClampedArray(256), который затем применяется
 * к каждому каналу изображения за O(n).
 */

/**
 * Генерирует LUT (таблицу подстановки) для коррекции уровней одного канала.
 *
 * @param {number} blackPoint — нижняя точка отсечения (0–255). Все значения ≤ blackPoint → 0.
 * @param {number} whitePoint — верхняя точка отсечения (0–255). Все значения ≥ whitePoint → 255.
 * @param {number} gamma — показатель гаммы (> 0). gamma = 1 → линейный маппинг.
 *   gamma < 1 → осветление средних тонов, gamma > 1 → затемнение.
 * @returns {Uint8ClampedArray} Таблица подстановки из 256 элементов.
 * @throws {RangeError} Если blackPoint ≥ whitePoint или gamma ≤ 0.
 */
export function generateLUT(blackPoint, whitePoint, gamma) {
  if (blackPoint >= whitePoint) {
    throw new RangeError(
      `blackPoint (${blackPoint}) должен быть строго меньше whitePoint (${whitePoint})`
    );
  }
  if (gamma <= 0) {
    throw new RangeError(`gamma (${gamma}) должна быть больше 0`);
  }

  const lut = new Uint8ClampedArray(256);
  const range = whitePoint - blackPoint;
  const invGamma = 1 / gamma;

  for (let i = 0; i < 256; i++) {
    // 1. Ограничение
    let value = i;
    if (value < blackPoint) {
      value = blackPoint;
    } else if (value > whitePoint) {
      value = whitePoint;
    }

    // 2. Нормализация в [0, 1]
    const normalized = (value - blackPoint) / range;

    // 3. Гамма-коррекция
    const corrected = Math.pow(normalized, invGamma);

    // 4. Масштабирование до 0–255
    lut[i] = Math.round(corrected * 255);
  }

  return lut;
}

/**
 * Применяет LUT-ы к каналам изображения и возвращает новый ImageData.
 * Входной объект imageData не модифицируется.
 *
 * @param {ImageData} imageData — исходные пиксельные данные RGBA.
 * @param {{ r: Uint8ClampedArray, g: Uint8ClampedArray, b: Uint8ClampedArray, a: Uint8ClampedArray }} luts
 *   — таблицы подстановки для каждого канала (каждая — Uint8ClampedArray(256)).
 * @returns {ImageData} Новый объект ImageData с применёнными уровнями.
 */
export function applyLevels(imageData, luts) {
  const src = imageData.data;
  const len = src.length;
  const dst = new Uint8ClampedArray(len);

  const lutR = luts.r;
  const lutG = luts.g;
  const lutB = luts.b;
  const lutA = luts.a;

  for (let i = 0; i < len; i += 4) {
    dst[i]     = lutR[src[i]];
    dst[i + 1] = lutG[src[i + 1]];
    dst[i + 2] = lutB[src[i + 2]];
    dst[i + 3] = lutA[src[i + 3]];
  }

  return new ImageData(dst, imageData.width, imageData.height);
}
