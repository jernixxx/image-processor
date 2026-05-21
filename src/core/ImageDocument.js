/**
 * @module ImageDocument
 * @description Класс документа изображения. Хранит оригинальные пиксельные данные
 * и предоставляет доступ к ним. Поддерживает загрузку и экспорт в форматы PNG, JPG, GB7.
 */

import { decodeGB7, encodeGB7 } from './gb7.js';

/**
 * Документ изображения — основная обёртка над пиксельными данными.
 * Оригинальные данные никогда не модифицируются после создания экземпляра.
 */
export class ImageDocument {
  /**
   * Создаёт новый документ изображения.
   * @param {ImageData} imageData — объект ImageData (RGBA).
   * @param {Object} meta — метаданные изображения.
   * @param {number} meta.width — ширина в пикселях.
   * @param {number} meta.height — высота в пикселях.
   * @param {number} meta.colorDepth — глубина цвета (24 для RGB, 32 для RGBA, 7 для GB7).
   * @param {string} meta.format — формат файла ('png', 'jpg', 'gb7').
   * @param {string} meta.fileName — имя исходного файла.
   */
  constructor(imageData, meta) {
    /** @type {Uint8ClampedArray} Неизменяемая копия оригинальных пиксельных данных (RGBA) */
    this.originalData = new Uint8ClampedArray(imageData.data);

    /** @type {number} Ширина изображения */
    this.width = meta.width;

    /** @type {number} Высота изображения */
    this.height = meta.height;

    /** @type {number} Глубина цвета (например, 24, 32 или 7) */
    this.colorDepth = meta.colorDepth;

    /** @type {string} Формат файла */
    this.format = meta.format;

    /** @type {string} Имя файла */
    this.fileName = meta.fileName;
  }

  /**
   * Возвращает значения каналов RGBA для пикселя с координатами (x, y).
   * Начало координат — левый верхний угол.
   * @param {number} x — координата по горизонтали (0 … width-1).
   * @param {number} y — координата по вертикали (0 … height-1).
   * @returns {{ r: number, g: number, b: number, a: number }} Значения каналов 0–255.
   */
  getPixel(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new RangeError(
        `Координаты (${x}, ${y}) выходят за пределы изображения ${this.width}×${this.height}`
      );
    }
    const idx = (y * this.width + x) * 4;
    return {
      r: this.originalData[idx],
      g: this.originalData[idx + 1],
      b: this.originalData[idx + 2],
      a: this.originalData[idx + 3],
    };
  }

  /**
   * Возвращает клон оригинальных данных в виде нового объекта ImageData.
   * @returns {ImageData} Новый объект ImageData с копией пиксельных данных.
   */
  getImageData() {
    const cloned = new Uint8ClampedArray(this.originalData);
    return new ImageData(cloned, this.width, this.height);
  }

  /**
   * Создаёт ImageDocument из файла (File / Blob).
   * Формат определяется по расширению имени файла.
   * Поддерживаются: .png, .jpg / .jpeg, .gb7.
   * @param {File} file — объект File из input[type=file] или Drag-and-Drop.
   * @returns {Promise<ImageDocument>} Новый экземпляр ImageDocument.
   */
  static async fromFile(file) {
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();

    if (ext === 'gb7') {
      return ImageDocument._loadGB7(file, name);
    }

    // PNG / JPEG — загружаем через браузерный Image + OffscreenCanvas / Canvas
    return ImageDocument._loadBrowserImage(file, name, ext);
  }

  /**
   * Загружает GB7-файл и возвращает ImageDocument.
   * @private
   * @param {File} file — файл в формате GB7.
   * @param {string} fileName — имя файла.
   * @returns {Promise<ImageDocument>}
   */
  static async _loadGB7(file, fileName) {
    const arrayBuffer = await file.arrayBuffer();
    const { imageData, meta } = decodeGB7(arrayBuffer);
    return new ImageDocument(imageData, {
      width: meta.width,
      height: meta.height,
      colorDepth: 7,
      format: 'gb7',
      fileName,
    });
  }

  /**
   * Загружает PNG / JPEG через браузерный API.
   * @private
   * @param {File} file — файл изображения.
   * @param {string} fileName — имя файла.
   * @param {string} ext — расширение (png, jpg, jpeg).
   * @returns {Promise<ImageDocument>}
   */
  static async _loadBrowserImage(file, fileName, ext) {
    const url = URL.createObjectURL(file);
    try {
      const img = await ImageDocument._loadImage(url);
      const { width, height } = img;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);

      const format = ext === 'jpeg' ? 'jpg' : ext;
      const colorDepth = format === 'png' ? 32 : 24;

      return new ImageDocument(imageData, {
        width,
        height,
        colorDepth,
        format,
        fileName,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Промис-обёртка над загрузкой HTMLImageElement.
   * @private
   * @param {string} src — URL изображения.
   * @returns {Promise<HTMLImageElement>}
   */
  static _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Не удалось загрузить изображение: ${e}`));
      img.src = src;
    });
  }

  /**
   * Экспортирует документ в указанный формат и возвращает Blob.
   * @param {string} [format] — целевой формат ('png', 'jpg', 'gb7'). По умолчанию — исходный формат.
   * @param {ImageData} [overrideData] — если указано, используются эти данные вместо оригинальных.
   * @returns {Promise<Blob>} Blob с данными файла.
   */
  async toBlob(format, overrideData) {
    const fmt = (format || this.format).toLowerCase();
    const imageData = overrideData || this.getImageData();

    if (fmt === 'gb7') {
      const buffer = encodeGB7(imageData, imageData.width, imageData.height);
      return new Blob([buffer], { type: 'application/octet-stream' });
    }

    // PNG / JPEG — рендерим через Canvas
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const mimeType = fmt === 'jpg' || fmt === 'jpeg' ? 'image/jpeg' : 'image/png';

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error(`Не удалось создать Blob для формата ${fmt}`));
          }
        },
        mimeType,
        fmt === 'jpg' || fmt === 'jpeg' ? 0.92 : undefined
      );
    });
  }

  /**
   * Экспортирует документ и инициирует скачивание в браузере.
   * @param {string} [format] — целевой формат ('png', 'jpg', 'gb7'). По умолчанию — исходный формат.
   * @param {ImageData} [overrideData] — если указано, используются эти данные вместо оригинальных.
   * @returns {Promise<void>}
   */
  async download(format, overrideData) {
    const fmt = (format || this.format).toLowerCase();
    const blob = await this.toBlob(fmt, overrideData);

    // Формируем имя файла, заменяя расширение
    const baseName = this.fileName.replace(/\.[^.]+$/, '');
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    const downloadName = `${baseName}.${ext}`;

    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Небольшая задержка перед отзывом URL, чтобы браузер успел начать загрузку
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
