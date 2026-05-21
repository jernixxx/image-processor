/**
 * @module histogram
 * @description Вычисление гистограмм яркости и отдельных каналов изображения.
 * Поддерживаемые каналы: luminosity (ITU-R BT.601), red, green, blue, alpha.
 * Гистограмма — массив Uint32Array из 256 элементов, где индекс — значение (0–255),
 * а значение — количество пикселей с данным значением.
 */

/**
 * Вычисляет гистограмму для одного канала.
 *
 * @param {ImageData} imageData — исходные пиксельные данные RGBA.
 * @param {'luminosity' | 'red' | 'green' | 'blue' | 'alpha'} channel — канал.
 * @returns {Uint32Array} Массив из 256 элементов со счётчиками.
 * @throws {Error} Если указан неизвестный канал.
 */
export function calculateHistogram(imageData, channel) {
  const data = imageData.data;
  const len = data.length; // байт = pixelCount * 4
  const hist = new Uint32Array(256);

  switch (channel) {
    case 'red':
      for (let i = 0; i < len; i += 4) {
        hist[data[i]]++;
      }
      break;

    case 'green':
      for (let i = 0; i < len; i += 4) {
        hist[data[i + 1]]++;
      }
      break;

    case 'blue':
      for (let i = 0; i < len; i += 4) {
        hist[data[i + 2]]++;
      }
      break;

    case 'alpha':
      for (let i = 0; i < len; i += 4) {
        hist[data[i + 3]]++;
      }
      break;

    case 'luminosity':
      for (let i = 0; i < len; i += 4) {
        // ITU-R BT.601: L = 0.299·R + 0.587·G + 0.114·B
        const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        hist[lum]++;
      }
      break;

    default:
      throw new Error(`Неизвестный канал: "${channel}". Допустимые: luminosity, red, green, blue, alpha.`);
  }

  return hist;
}

/**
 * Вычисляет все пять гистограмм за один проход по пиксельным данным.
 * Это эффективнее, чем вызывать calculateHistogram пять раз,
 * поскольку данные читаются из памяти однократно.
 *
 * @param {ImageData} imageData — исходные пиксельные данные RGBA.
 * @returns {{
 *   luminosity: Uint32Array,
 *   red: Uint32Array,
 *   green: Uint32Array,
 *   blue: Uint32Array,
 *   alpha: Uint32Array
 * }} Объект с пятью гистограммами (каждая — Uint32Array(256)).
 */
export function calculateAllHistograms(imageData) {
  const data = imageData.data;
  const len = data.length;

  const luminosity = new Uint32Array(256);
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const alpha = new Uint32Array(256);

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    red[r]++;
    green[g]++;
    blue[b]++;
    alpha[a]++;

    // ITU-R BT.601
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    luminosity[lum]++;
  }

  return { luminosity, red, green, blue, alpha };
}
