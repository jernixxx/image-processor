/**
 * Web Worker для свёртки изображения с ядром 3×3.
 *
 * Поскольку не все браузеры поддерживают ES-модульные импорты в воркерах,
 * логика свёртки (applyConvolutionRaw) встроена прямо в этот файл.
 *
 * Протокол обмена сообщениями:
 *   Входное сообщение (postMessage → worker):
 *     {
 *       pixelData: Uint8ClampedArray,   // RGBA-массив
 *       width: number,                  // ширина изображения
 *       height: number,                 // высота изображения
 *       kernel: number[],               // массив из 9 чисел (ядро 3×3)
 *       channels: { r: boolean, g: boolean, b: boolean, a: boolean },
 *       edgeMode: 'black' | 'white' | 'copy'
 *     }
 *
 *   Выходное сообщение (worker → postMessage):
 *     {
 *       result: Uint8ClampedArray       // результирующий RGBA-массив
 *     }
 */

// ═══════════════════════════════════════════════════════════════
// Встроенная копия applyConvolutionRaw
// (идентична src/core/convolution.js → applyConvolutionRaw)
// ═══════════════════════════════════════════════════════════════

/**
 * Применяет свёртку с ядром 3×3 к сырому массиву пикселей.
 *
 * @param {Uint8ClampedArray} pixelArray — исходный массив RGBA.
 * @param {number} width — ширина изображения.
 * @param {number} height — высота изображения.
 * @param {number[]} kernel3x3 — массив из 9 чисел.
 * @param {{ r: boolean, g: boolean, b: boolean, a: boolean }} channels — флаги каналов.
 * @param {string} edgeMode — режим обработки краёв ('black', 'white', 'copy').
 * @returns {Uint8ClampedArray} Новый массив RGBA с результатом свёртки.
 */
function applyConvolutionRaw(pixelArray, width, height, kernel3x3, channels, edgeMode) {
  const src = pixelArray;
  const dst = new Uint8ClampedArray(src.length);

  // Сумма ядра для нормализации
  let kernelSum = 0;
  for (let k = 0; k < 9; k++) {
    kernelSum += kernel3x3[k];
  }
  const shouldNormalize = kernelSum > 0;

  // Флаги активных каналов
  const activeChannels = [
    channels.r === true,
    channels.g === true,
    channels.b === true,
    channels.a === true,
  ];

  // Смещения ядра 3×3 (dx, dy) от центра
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0], [0,  0], [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;

      for (let c = 0; c < 4; c++) {
        if (!activeChannels[c]) {
          dst[dstIdx + c] = src[dstIdx + c];
          continue;
        }

        let sum = 0;

        for (let k = 0; k < 9; k++) {
          const nx = x + offsets[k][0];
          const ny = y + offsets[k][1];

          let value;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            value = src[(ny * width + nx) * 4 + c];
          } else {
            switch (edgeMode) {
              case 'black':
                value = 0;
                break;
              case 'white':
                value = 255;
                break;
              case 'copy':
              default: {
                const cx = Math.max(0, Math.min(width - 1, nx));
                const cy = Math.max(0, Math.min(height - 1, ny));
                value = src[(cy * width + cx) * 4 + c];
                break;
              }
            }
          }

          sum += value * kernel3x3[k];
        }

        if (shouldNormalize) {
          sum /= kernelSum;
        }

        dst[dstIdx + c] = Math.max(0, Math.min(255, Math.round(sum)));
      }
    }
  }

  return dst;
}

// ═══════════════════════════════════════════════════════════════
// Обработчик сообщений воркера
// ═══════════════════════════════════════════════════════════════

self.onmessage = function (e) {
  const { pixelData, width, height, kernel, channels, edgeMode } = e.data;

  const result = applyConvolutionRaw(
    pixelData,
    width,
    height,
    kernel,
    channels,
    edgeMode
  );

  // Отправляем результат обратно, передавая буфер через transferable
  // для исключения копирования данных
  self.postMessage({ result }, [result.buffer]);
};
