/**
 * @module convolution
 * @description Свёртка изображения с ядрами 3×3.
 * Поддерживает предустановленные ядра (резкость, размытие, операторы Прюитта и др.),
 * три режима обработки краёв (чёрный, белый, копирование) и выбор каналов.
 *
 * Также экспортирует «сырую» версию (applyConvolutionRaw), работающую
 * с Uint8ClampedArray напрямую — для использования в Web Worker.
 */

/**
 * Предустановленные ядра свёртки 3×3.
 * Каждое свойство содержит имя на русском и массив из 9 коэффициентов (row-major).
 * @readonly
 */
export const KERNEL_PRESETS = {
  identity: {
    name: 'Тождественное отображение',
    kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  sharpen: {
    name: 'Повышение резкости',
    kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  },
  gaussianBlur: {
    name: 'Фильтр Гаусса (3×3)',
    kernel: [1, 2, 1, 2, 4, 2, 1, 2, 1], // сумма = 16
  },
  boxBlur: {
    name: 'Прямоугольное размытие',
    kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1], // сумма = 9
  },
  prewittX: {
    name: 'Оператор Прюитта (X)',
    kernel: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
  },
  prewittY: {
    name: 'Оператор Прюитта (Y)',
    kernel: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
  },
};

/**
 * Режимы обработки краёв изображения (padding).
 * @readonly
 * @enum {string}
 */
export const EDGE_MODES = {
  /** Дополнение чёрными пикселями (0) */
  BLACK: 'black',
  /** Дополнение белыми пикселями (255) */
  WHITE: 'white',
  /** Копирование ближайшего краевого пикселя */
  COPY: 'copy',
};

/**
 * Применяет свёртку с ядром 3×3 к ImageData.
 *
 * @param {ImageData} imageData — исходные пиксельные данные RGBA.
 * @param {number[]} kernel3x3 — массив из 9 чисел (row-major, сверху-влево → вниз-вправо).
 * @param {{ r: boolean, g: boolean, b: boolean, a: boolean }} channels
 *   — какие каналы обрабатывать. Необработанные каналы копируются из исходных данных.
 * @param {string} [edgeMode=EDGE_MODES.COPY] — режим обработки краёв.
 * @returns {ImageData} Новый объект ImageData с результатом свёртки.
 */
export function applyConvolution(imageData, kernel3x3, channels, edgeMode = EDGE_MODES.COPY) {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;

  const result = applyConvolutionRaw(src, width, height, kernel3x3, channels, edgeMode);

  return new ImageData(result, width, height);
}

/**
 * Применяет свёртку с ядром 3×3 к сырому массиву пикселей.
 * Эта функция не зависит от ImageData API и может использоваться в Web Worker.
 *
 * Алгоритм:
 *   1. Вычисляется сумма коэффициентов ядра.
 *      Если сумма > 0, результат нормализуется делением на сумму.
 *      Если сумма = 0, нормализация не выполняется (полезно для краевых фильтров).
 *      Если сумма < 0, нормализация не выполняется.
 *   2. Для каждого пикселя, для каждого включённого канала:
 *      a. Извлекается 3×3-окрестность (с обработкой краёв).
 *      b. Поэлементное умножение на ядро и суммирование.
 *      c. Нормализация (если нужно), ограничение результата до [0, 255].
 *   3. Выключенные каналы копируются из исходных данных без изменений.
 *
 * @param {Uint8ClampedArray} pixelArray — исходный массив RGBA (длина = width × height × 4).
 * @param {number} width — ширина изображения.
 * @param {number} height — высота изображения.
 * @param {number[]} kernel3x3 — массив из 9 чисел.
 * @param {{ r: boolean, g: boolean, b: boolean, a: boolean }} channels — флаги каналов.
 * @param {string} [edgeMode='copy'] — режим обработки краёв.
 * @returns {Uint8ClampedArray} Новый массив RGBA с результатом свёртки.
 */
export function applyConvolutionRaw(pixelArray, width, height, kernel3x3, channels, edgeMode = 'copy') {
  const src = pixelArray;
  const dst = new Uint8ClampedArray(src.length);

  // --- Сумма ядра для нормализации ---
  let kernelSum = 0;
  for (let k = 0; k < 9; k++) {
    kernelSum += kernel3x3[k];
  }
  const shouldNormalize = kernelSum > 0;

  // --- Флаги активных каналов ---
  const activeChannels = [
    channels.r === true,
    channels.g === true,
    channels.b === true,
    channels.a === true,
  ];

  // --- Смещения ядра 3×3 (dx, dy) от центра ---
  // Порядок: [(-1,-1), (0,-1), (1,-1), (-1,0), (0,0), (1,0), (-1,1), (0,1), (1,1)]
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0], [0,  0], [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;

      // Обрабатываем каждый канал (0=R, 1=G, 2=B, 3=A)
      for (let c = 0; c < 4; c++) {
        if (!activeChannels[c]) {
          // Канал не обрабатывается — копируем как есть
          dst[dstIdx + c] = src[dstIdx + c];
          continue;
        }

        let sum = 0;

        for (let k = 0; k < 9; k++) {
          const nx = x + offsets[k][0];
          const ny = y + offsets[k][1];

          let value;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            // Пиксель внутри изображения
            value = src[(ny * width + nx) * 4 + c];
          } else {
            // Пиксель за пределами — применяем edge mode
            switch (edgeMode) {
              case 'black':
                value = 0;
                break;
              case 'white':
                value = 255;
                break;
              case 'copy':
              default: {
                // Копирование ближайшего краевого пикселя (clamp coordinates)
                const cx = Math.max(0, Math.min(width - 1, nx));
                const cy = Math.max(0, Math.min(height - 1, ny));
                value = src[(cy * width + cx) * 4 + c];
                break;
              }
            }
          }

          sum += value * kernel3x3[k];
        }

        // Нормализация
        if (shouldNormalize) {
          sum /= kernelSum;
        } else if (kernelSum === 0) {
          sum = Math.abs(sum);
        }

        // Ограничение до [0, 255]
        dst[dstIdx + c] = Math.max(0, Math.min(255, Math.round(sum)));
      }
    }
  }

  return dst;
}
