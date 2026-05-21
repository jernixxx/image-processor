/**
 * @module interpolation
 * @description Методы интерполяции изображений: ближайший сосед и билинейная.
 * Используются для изменения размера (ресайза) изображений.
 *
 * Система координат: начало координат — верхний левый угол,
 * ось X — вправо, ось Y — вниз.
 */

/**
 * Перечисление доступных методов интерполяции.
 * @readonly
 * @enum {string}
 */
export const INTERPOLATION_METHODS = {
  /** Метод ближайшего соседа (без сглаживания) */
  NEAREST: 'nearest',
  /** Билинейная интерполяция (сглаживание по 4 ближайшим пикселям) */
  BILINEAR: 'bilinear',
};

/**
 * Изменяет размер изображения с использованием указанного метода интерполяции.
 *
 * @param {ImageData} srcImageData — исходные пиксельные данные RGBA.
 * @param {number} dstWidth — целевая ширина (целое число > 0).
 * @param {number} dstHeight — целевая высота (целое число > 0).
 * @param {string} [method=INTERPOLATION_METHODS.BILINEAR] — метод интерполяции.
 * @returns {ImageData} Новый объект ImageData размером dstWidth × dstHeight.
 * @throws {Error} Если указан неизвестный метод интерполяции.
 */
export function resizeImage(
  srcImageData,
  dstWidth,
  dstHeight,
  method = INTERPOLATION_METHODS.BILINEAR
) {
  const srcW = srcImageData.width;
  const srcH = srcImageData.height;
  const srcData = srcImageData.data;

  switch (method) {
    case INTERPOLATION_METHODS.NEAREST:
      return nearestNeighbor(srcData, srcW, srcH, dstWidth, dstHeight);

    case INTERPOLATION_METHODS.BILINEAR:
      return bilinear(srcData, srcW, srcH, dstWidth, dstHeight);

    default:
      throw new Error(`Неизвестный метод интерполяции: "${method}"`);
  }
}

/**
 * Ресайз методом ближайшего соседа.
 *
 * Для каждого пикселя назначения (dx, dy) вычисляется ближайший
 * исходный пиксель:
 *   src_x = floor(dx * srcW / dstW)
 *   src_y = floor(dy * srcH / dstH)
 *
 * @param {Uint8ClampedArray} srcData — массив RGBA исходного изображения.
 * @param {number} srcW — ширина исходного изображения.
 * @param {number} srcH — высота исходного изображения.
 * @param {number} dstW — целевая ширина.
 * @param {number} dstH — целевая высота.
 * @returns {ImageData} Результат.
 */
function nearestNeighbor(srcData, srcW, srcH, dstW, dstH) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy++) {
    const srcY = Math.floor(dy * srcH / dstH);
    // Гарантируем, что не выходим за границы
    const sy = Math.min(srcY, srcH - 1);

    for (let dx = 0; dx < dstW; dx++) {
      const srcX = Math.floor(dx * srcW / dstW);
      const sx = Math.min(srcX, srcW - 1);

      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = (dy * dstW + dx) * 4;

      dst[dstIdx]     = srcData[srcIdx];
      dst[dstIdx + 1] = srcData[srcIdx + 1];
      dst[dstIdx + 2] = srcData[srcIdx + 2];
      dst[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return new ImageData(dst, dstW, dstH);
}

/**
 * Ресайз методом билинейной интерполяции.
 *
 * Для каждого пикселя назначения (dx, dy) вычисляются непрерывные
 * координаты в исходном изображении:
 *   src_x = dx * (srcW - 1) / (dstW - 1)   (при dstW > 1)
 *   src_y = dy * (srcH - 1) / (dstH - 1)   (при dstH > 1)
 *
 * Затем берутся 4 ближайших пикселя и выполняется билинейная
 * интерполяция по дробным частям координат для каждого канала RGBA.
 *
 * @param {Uint8ClampedArray} srcData — массив RGBA исходного изображения.
 * @param {number} srcW — ширина исходного изображения.
 * @param {number} srcH — высота исходного изображения.
 * @param {number} dstW — целевая ширина.
 * @param {number} dstH — целевая высота.
 * @returns {ImageData} Результат.
 */
function bilinear(srcData, srcW, srcH, dstW, dstH) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  // Масштабные коэффициенты.
  // Если dstW или dstH равны 1, избегаем деления на 0.
  const xRatio = dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const yRatio = dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;

  for (let dy = 0; dy < dstH; dy++) {
    const srcYf = dy * yRatio;
    const y0 = Math.floor(srcYf);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const yFrac = srcYf - y0;

    for (let dx = 0; dx < dstW; dx++) {
      const srcXf = dx * xRatio;
      const x0 = Math.floor(srcXf);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const xFrac = srcXf - x0;

      // Индексы четырёх соседних пикселей
      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const dstIdx = (dy * dstW + dx) * 4;

      // Весовые коэффициенты
      const w00 = (1 - xFrac) * (1 - yFrac);
      const w10 = xFrac * (1 - yFrac);
      const w01 = (1 - xFrac) * yFrac;
      const w11 = xFrac * yFrac;

      // Интерполяция по каждому каналу RGBA
      for (let c = 0; c < 4; c++) {
        dst[dstIdx + c] = Math.round(
          srcData[idx00 + c] * w00 +
          srcData[idx10 + c] * w10 +
          srcData[idx01 + c] * w01 +
          srcData[idx11 + c] * w11
        );
      }
    }
  }

  return new ImageData(dst, dstW, dstH);
}

/**
 * Возвращает человекочитаемое описание метода интерполяции (на русском языке).
 * Предназначено для подсказок (tooltip) в пользовательском интерфейсе.
 *
 * @param {string} method — один из INTERPOLATION_METHODS.
 * @returns {{ name: string, description: string }} Название и описание метода.
 */
export function getMethodDescription(method) {
  switch (method) {
    case INTERPOLATION_METHODS.NEAREST:
      return {
        name: 'Ближайший сосед',
        description:
          'Каждому пикселю назначения присваивается значение ближайшего пикселя исходного изображения. ' +
          'Быстрый, но создаёт «ступенчатые» артефакты. Подходит для пиксель-арта и масок.',
      };

    case INTERPOLATION_METHODS.BILINEAR:
      return {
        name: 'Билинейная интерполяция',
        description:
          'Значение каждого пикселя назначения вычисляется как взвешенное среднее четырёх ближайших ' +
          'пикселей исходного изображения. Обеспечивает плавные переходы, но может слегка размывать ' +
          'мелкие детали.',
      };

    default:
      return {
        name: method,
        description: 'Описание недоступно.',
      };
  }
}
