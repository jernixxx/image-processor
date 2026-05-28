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
function nearestNeighbor(srcData, srcW, srcH, dstW, dstH) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy++) {
    const srcY = Math.floor(dy * srcH / dstH);
    const sy = Math.min(srcY, srcH - 1);
    const sy_offset = sy * srcW * 4;
    const dstY_offset = dy * dstW * 4;

    for (let dx = 0; dx < dstW; dx++) {
      const srcX = Math.floor(dx * srcW / dstW);
      const sx = Math.min(srcX, srcW - 1);

      const srcIdx = sy_offset + sx * 4;
      const dstIdx = dstY_offset + dx * 4;

      dst[dstIdx]     = srcData[srcIdx];
      dst[dstIdx + 1] = srcData[srcIdx + 1];
      dst[dstIdx + 2] = srcData[srcIdx + 2];
      dst[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return new ImageData(dst, dstW, dstH);
}

function bilinear(srcData, srcW, srcH, dstW, dstH) {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xRatio = dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const yRatio = dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;

  for (let dy = 0; dy < dstH; dy++) {
    const srcYf = dy * yRatio;
    const y0 = Math.floor(srcYf);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const yFrac = srcYf - y0;
    const yFrac1 = 1 - yFrac;

    const y0_offset = y0 * srcW * 4;
    const y1_offset = y1 * srcW * 4;
    const dstY_offset = dy * dstW * 4;

    for (let dx = 0; dx < dstW; dx++) {
      const srcXf = dx * xRatio;
      const x0 = Math.floor(srcXf);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const xFrac = srcXf - x0;
      const xFrac1 = 1 - xFrac;

      const w00 = xFrac1 * yFrac1;
      const w10 = xFrac * yFrac1;
      const w01 = xFrac1 * yFrac;
      const w11 = xFrac * yFrac;

      const idx00 = y0_offset + x0 * 4;
      const idx10 = y0_offset + x1 * 4;
      const idx01 = y1_offset + x0 * 4;
      const idx11 = y1_offset + x1 * 4;

      const dstIdx = dstY_offset + dx * 4;

      dst[dstIdx]     = (srcData[idx00]     * w00 + srcData[idx10]     * w10 + srcData[idx01]     * w01 + srcData[idx11]     * w11) + 0.5 | 0;
      dst[dstIdx + 1] = (srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11) + 0.5 | 0;
      dst[dstIdx + 2] = (srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11) + 0.5 | 0;
      dst[dstIdx + 3] = (srcData[idx00 + 3] * w00 + srcData[idx10 + 3] * w10 + srcData[idx01 + 3] * w01 + srcData[idx11 + 3] * w11) + 0.5 | 0;
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
