/**
 * @module gb7
 * @description Кодировщик и декодировщик формата GB7 — 7-битный формат оттенков серого
 * с опциональной 1-битной маской прозрачности.
 *
 * Структура файла:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Заголовок (12 байт)                                        │
 * │  0-3: Сигнатура  0x47 0x42 0x37 0x1D                       │
 * │    4: Версия     0x01                                      │
 * │    5: Флаги      бит 0 = маска (1 — есть, 0 — нет)        │
 * │  6-7: Ширина     uint16 big-endian                         │
 * │  8-9: Высота     uint16 big-endian                         │
 * │ 10-11: Резерв    0x0000                                    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Пиксельные данные (W × H байт, построчно, сверху-влево)    │
 * │  Каждый байт:                                              │
 * │   биты 6-0: значение серого (0–127)                        │
 * │   бит 7:    маска (0 = прозрачный, 1 = непрозрачный)       │
 * └─────────────────────────────────────────────────────────────┘
 */

/** Сигнатура файла GB7 */
const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d];

/** Текущая версия формата */
const GB7_VERSION = 0x01;

/** Размер заголовка в байтах */
const HEADER_SIZE = 12;

/**
 * Декодирует буфер в формате GB7 в ImageData.
 *
 * Алгоритм преобразования яркости:
 *   gray_8bit = Math.round(gray_7bit * 255 / 127)
 *
 * Каналы результата:
 *   R = G = B = gray_8bit
 *   A = 255 (без маски) или maskBit * 255 (с маской)
 *
 * @param {ArrayBuffer} arrayBuffer — содержимое GB7-файла.
 * @returns {{ imageData: ImageData, meta: { width: number, height: number, hasMask: boolean } }}
 * @throws {Error} Если файл повреждён или имеет неверную сигнатуру / версию.
 */
export function decodeGB7(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // --- Проверка минимального размера ---
  if (bytes.length < HEADER_SIZE) {
    throw new Error(`GB7: файл слишком мал (${bytes.length} байт, нужно минимум ${HEADER_SIZE})`);
  }

  // --- Проверка сигнатуры ---
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== GB7_SIGNATURE[i]) {
      throw new Error('GB7: неверная сигнатура файла');
    }
  }

  // --- Версия ---
  const version = bytes[4];
  if (version !== GB7_VERSION) {
    throw new Error(`GB7: неподдерживаемая версия ${version}`);
  }

  // --- Флаги ---
  const flags = bytes[5];
  const hasMask = (flags & 0x01) === 1;

  // --- Размеры (big-endian uint16) ---
  const width = (bytes[6] << 8) | bytes[7];
  const height = (bytes[8] << 8) | bytes[9];

  if (width === 0 || height === 0) {
    throw new Error(`GB7: недопустимые размеры ${width}×${height}`);
  }

  // --- Проверка длины пиксельных данных ---
  const expectedSize = HEADER_SIZE + width * height;
  if (bytes.length < expectedSize) {
    throw new Error(
      `GB7: недостаточно пиксельных данных (ожидается ${expectedSize} байт, получено ${bytes.length})`
    );
  }

  // --- Декодирование пиксельных данных ---
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const raw = bytes[HEADER_SIZE + i];
    const gray7 = raw & 0x7f; // биты 6-0
    const maskBit = (raw >> 7) & 1; // бит 7

    const gray8 = Math.round((gray7 * 255) / 127);

    const offset = i * 4;
    rgba[offset] = gray8;     // R
    rgba[offset + 1] = gray8; // G
    rgba[offset + 2] = gray8; // B
    rgba[offset + 3] = hasMask ? maskBit * 255 : 255; // A
  }

  const imageData = new ImageData(rgba, width, height);

  return {
    imageData,
    meta: { width, height, hasMask },
  };
}

/**
 * Кодирует ImageData в формат GB7.
 *
 * Алгоритм:
 *   L = 0.299 * R + 0.587 * G + 0.114 * B  (яркость по ITU-R BT.601)
 *   gray_7bit = Math.round(L * 127 / 255)
 *   maskBit = (A >= 128) ? 1 : 0
 *
 * Маска записывается всегда, если хотя бы один пиксель имеет A < 128,
 * иначе флаг маски устанавливается в 0.
 *
 * @param {ImageData} imageData — исходные пиксельные данные RGBA.
 * @param {number} width — ширина изображения.
 * @param {number} height — высота изображения.
 * @returns {ArrayBuffer} Закодированные данные GB7.
 */
export function encodeGB7(imageData, width, height) {
  const src = imageData.data;
  const pixelCount = width * height;

  // --- Определяем, нужна ли маска ---
  let hasMask = false;
  for (let i = 0; i < pixelCount; i++) {
    if (src[i * 4 + 3] < 128) {
      hasMask = true;
      break;
    }
  }

  // --- Создаём буфер: заголовок + пиксельные данные ---
  const totalSize = HEADER_SIZE + pixelCount;
  const buffer = new ArrayBuffer(totalSize);
  const out = new Uint8Array(buffer);

  // --- Заголовок ---
  // Сигнатура
  out[0] = GB7_SIGNATURE[0];
  out[1] = GB7_SIGNATURE[1];
  out[2] = GB7_SIGNATURE[2];
  out[3] = GB7_SIGNATURE[3];

  // Версия
  out[4] = GB7_VERSION;

  // Флаги
  out[5] = hasMask ? 0x01 : 0x00;

  // Ширина (big-endian uint16)
  out[6] = (width >> 8) & 0xff;
  out[7] = width & 0xff;

  // Высота (big-endian uint16)
  out[8] = (height >> 8) & 0xff;
  out[9] = height & 0xff;

  // Резерв
  out[10] = 0x00;
  out[11] = 0x00;

  // --- Пиксельные данные ---
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = src[offset];
    const g = src[offset + 1];
    const b = src[offset + 2];
    const a = src[offset + 3];

    // Яркость по ITU-R BT.601
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // Преобразование 0–255 → 0–127
    const gray7 = Math.round((luminance * 127) / 255);

    // Маска: A >= 128 → непрозрачный (бит 7 = 1)
    const maskBit = hasMask ? (a >= 128 ? 0x80 : 0x00) : 0x00;

    out[HEADER_SIZE + i] = maskBit | (gray7 & 0x7f);
  }

  return buffer;
}
