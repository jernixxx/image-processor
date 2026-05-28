/**
 * main.js — Точка входа приложения Image Processor
 *
 * Инициализирует все модули, связывает UI-элементы с логикой обработки изображений.
 */

import { ImageDocument } from './core/ImageDocument.js';
import { rgbToLab, rgbToHex } from './core/color.js';
import { calculateAllHistograms } from './core/histogram.js';
import { generateLUT, applyLevels } from './core/levels.js';
import { resizeImage, INTERPOLATION_METHODS, getMethodDescription } from './core/interpolation.js';
import { KERNEL_PRESETS, EDGE_MODES, applyConvolution } from './core/convolution.js';

// ==========================================
// Состояние приложения
// ==========================================

const state = {
  /** @type {ImageDocument|null} */
  doc: null,
  /** @type {ImageData|null} Текущие данные для отображения (после применённых эффектов) */
  currentData: null,
  /** Масштаб отображения (1.0 = 100%) */
  zoom: 1.0,
  /** Активен ли инструмент «Пипетка» */
  eyedropperActive: false,
  /** Активные каналы */
  channels: { r: true, g: true, b: true, a: true },
  /** Количество каналов изображения (1, 2, 3, 4) */
  channelCount: 4,
  /** Настройки уровней по каналам */
  levelsSettings: {
    master: { black: 0, white: 255, gamma: 1.0 },
    red:    { black: 0, white: 255, gamma: 1.0 },
    green:  { black: 0, white: 255, gamma: 1.0 },
    blue:   { black: 0, white: 255, gamma: 1.0 },
    alpha:  { black: 0, white: 255, gamma: 1.0 },
  },
  /** Данные до открытия диалога уровней */
  levelsBackup: null,
  /** Пропорции для Resize */
  resizeLinked: true,
  /** Соотношение сторон */
  aspectRatio: 1,
};

// ==========================================
// DOM-элементы
// ==========================================

const $ = (sel) => document.querySelector(sel);
const canvas = $('#main-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const canvasArea = $('#canvas-area');

const els = {
  fileInput: $('#file-input'),
  btnOpen: $('#btn-open'),
  btnSave: $('#btn-save'),
  saveFormatGroup: $('#save-format-group'),
  saveFormat: $('#save-format'),
  btnEyedropper: $('#btn-eyedropper'),
  btnLevels: $('#btn-levels'),
  btnResize: $('#btn-resize'),
  btnFilter: $('#btn-filter'),
  zoomSelect: $('#zoom-select'),
  emptyState: $('#empty-state'),
  statusFilename: $('#status-filename'),
  statusDimensions: $('#status-dimensions'),
  statusDepth: $('#status-depth'),
  statusZoom: $('#status-zoom'),
  statusCursor: $('#status-cursor'),
  channelsPanel: $('#channels-panel'),
  channelsList: $('#channels-list'),
  eyedropperInfo: $('#eyedropper-info'),
};

// ==========================================
// Файловые операции
// ==========================================

els.btnOpen.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
  e.target.value = '';
});

// Drag & Drop
canvasArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  canvasArea.classList.add('drag-over');
});
canvasArea.addEventListener('dragleave', () => canvasArea.classList.remove('drag-over'));
canvasArea.addEventListener('drop', (e) => {
  e.preventDefault();
  canvasArea.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

async function loadFile(file) {
  try {
    const doc = await ImageDocument.fromFile(file);
    state.doc = doc;
    state.currentData = doc.getImageData();
    state.channels = { r: true, g: true, b: true, a: true };

    // Определяем количество каналов
    if (doc.format === 'gb7') {
      state.channelCount = hasAlpha(state.currentData) ? 2 : 1;
    } else {
      state.channelCount = hasAlpha(state.currentData) ? 4 : 3;
    }

    // Обновляем UI
    enableControls(true);
    updateStatusBar();

    const rightPanel = $('#right-panel');
    if (rightPanel) {
      rightPanel.classList.remove('panel--collapsed');
    }

    buildChannelsPanel();
    fitToScreen();
    renderCanvas();

    // Устанавливаем формат сохранения по формату файла
    const fmtMap = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gb7: 'gb7' };
    els.saveFormat.value = fmtMap[doc.format] || 'png';

    els.emptyState.style.display = 'none';
    canvas.classList.add('active');
  } catch (err) {
    console.error('Ошибка загрузки:', err);
    alert('Ошибка загрузки файла: ' + err.message);
  }
}

/** Проверяет, есть ли в изображении прозрачные пиксели */
function hasAlpha(imageData) {
  const d = imageData.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 255) return true;
  }
  return false;
}

/** Загружает тестовое изображение из папки test-images */
async function loadTestImage(presetName) {
  try {
    const path = `./test-images/${presetName}`;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], presetName, { type: blob.type || 'application/octet-stream' });
    await loadFile(file);
  } catch (err) {
    console.error('Ошибка загрузки пресета:', err);
    alert('Не удалось загрузить тестовое изображение: ' + err.message);
  }
}

els.btnSave.addEventListener('click', async () => {
  if (!state.doc) return;
  const format = els.saveFormat.value;
  try {
    await state.doc.download(format, state.currentData);
  } catch (err) {
    console.error('Ошибка сохранения:', err);
    alert('Ошибка сохранения: ' + err.message);
  }
});

function enableControls(enabled) {
  els.btnSave.disabled = !enabled;
  els.btnLevels.disabled = !enabled;
  els.btnResize.disabled = !enabled;
  els.btnFilter.disabled = !enabled;
  els.zoomSelect.disabled = !enabled;
  els.saveFormatGroup.style.display = enabled ? 'flex' : 'none';
}

// ==========================================
// Canvas рендеринг
// ==========================================

function renderCanvas() {
  if (!state.doc || !state.currentData) return;

  const src = state.currentData;
  const srcW = src.width;
  const srcH = src.height;

  // Применяем маску каналов
  const displayed = applyChannelMask(src, state.channels, state.channelCount);

  // Масштабируем через браузерный drawImage (быстро, GPU-ускорение)
  const dstW = Math.round(srcW * state.zoom);
  const dstH = Math.round(srcH * state.zoom);

  if (dstW < 1 || dstH < 1) return;

  // Создаём offscreen-canvas с исходным размером для putImageData
  const offscreen = document.createElement('canvas');
  offscreen.width = srcW;
  offscreen.height = srcH;
  offscreen.getContext('2d').putImageData(displayed, 0, 0);

  // Рисуем с масштабированием на основной canvas
  canvas.width = dstW;
  canvas.height = dstH;
  ctx.imageSmoothingEnabled = state.zoom < 1;
  ctx.drawImage(offscreen, 0, 0, dstW, dstH);
}

function applyChannelMask(imageData, channels, channelCount) {
  const src = imageData.data;
  const out = new ImageData(new Uint8ClampedArray(src), imageData.width, imageData.height);
  const d = out.data;

  for (let i = 0; i < d.length; i += 4) {
    if (channelCount <= 2) {
      // Grayscale: если канал серого выключен — всё чёрное
      if (!channels.r) { d[i] = d[i + 1] = d[i + 2] = 0; }
      if (!channels.a && channelCount === 2) { d[i + 3] = 255; }
    } else {
      // RGB(A)
      if (!channels.r) d[i] = 0;
      if (!channels.g) d[i + 1] = 0;
      if (!channels.b) d[i + 2] = 0;
      if (!channels.a) d[i + 3] = 255;
    }
  }

  // Если только альфа-канал активен, показываем маску
  const onlyAlpha = (channelCount >= 3)
    ? (!channels.r && !channels.g && !channels.b && channels.a)
    : (channelCount === 2 && !channels.r && channels.a);

  if (onlyAlpha) {
    for (let i = 0; i < d.length; i += 4) {
      const a = imageData.data[i + 3];
      d[i] = d[i + 1] = d[i + 2] = a;
      d[i + 3] = 255;
    }
  }

  return out;
}

// ==========================================
// Масштабирование (Zoom)
// ==========================================

function fitToScreen() {
  if (!state.doc) return;
  const areaW = canvasArea.clientWidth - 100; // отступы по 50px
  const areaH = canvasArea.clientHeight - 100;
  const scaleW = areaW / state.doc.width;
  const scaleH = areaH / state.doc.height;
  let zoom = Math.min(scaleW, scaleH, 3.0); // max 300%
  zoom = Math.max(zoom, 0.12); // min 12%
  state.zoom = zoom;
  updateZoomUI();
}

function updateZoomUI() {
  const pct = Math.round(state.zoom * 100);
  els.statusZoom.textContent = pct + '%';

  // Попробуем выбрать ближайший вариант в селекте
  const options = els.zoomSelect.options;
  let matched = false;
  for (let opt of options) {
    if (opt.value === 'fit') continue;
    if (parseInt(opt.value) === pct) {
      els.zoomSelect.value = opt.value;
      matched = true;
      break;
    }
  }
  if (!matched) {
    // Если точного совпадения нет, ставим 'fit'
    els.zoomSelect.value = 'fit';
  }
}

els.zoomSelect.addEventListener('change', () => {
  const val = els.zoomSelect.value;
  if (val === 'fit') {
    fitToScreen();
  } else {
    state.zoom = parseInt(val) / 100;
  }
  updateZoomUI();
  renderCanvas();
});

// Слушатель для авто-масштабирования при изменении размеров окна (viewport)
window.addEventListener('resize', () => {
  if (!state.doc) return;
  if (els.zoomSelect.value === 'fit') {
    fitToScreen();
    renderCanvas();
  }
});

// ==========================================
// Статусная строка
// ==========================================

function updateStatusBar() {
  if (!state.doc) return;
  els.statusFilename.textContent = state.doc.fileName;
  els.statusDimensions.textContent = `${state.doc.width} × ${state.doc.height}`;
  els.statusDepth.textContent = `${state.doc.colorDepth} бит`;
}

// ==========================================
// Каналы
// ==========================================

function buildChannelsPanel() {
  els.channelsPanel.style.display = 'block';
  els.channelsList.innerHTML = '';

  const channelDefs = getChannelDefs();
  channelDefs.forEach((ch) => {
    const item = document.createElement('div');
    item.className = `channel-item channel-item--${ch.cssClass} active`;
    item.dataset.channel = ch.key;
    item.innerHTML = `
      <span class="channel-item__eye">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </span>
      <span class="channel-item__thumb"><canvas width="36" height="36"></canvas></span>
      <span class="channel-item__label">${ch.label}</span>
    `;
    item.addEventListener('click', () => toggleChannel(ch.key, item));
    els.channelsList.appendChild(item);

    // Миниатюра
    updateChannelThumb(item, ch.key);
  });
}

function getChannelDefs() {
  const count = state.channelCount;
  if (count === 1) return [{ key: 'r', label: 'Серый', cssClass: 'gray' }];
  if (count === 2) return [
    { key: 'r', label: 'Серый', cssClass: 'gray' },
    { key: 'a', label: 'Альфа', cssClass: 'alpha' },
  ];
  if (count === 3) return [
    { key: 'r', label: 'Красный', cssClass: 'red' },
    { key: 'g', label: 'Зелёный', cssClass: 'green' },
    { key: 'b', label: 'Синий', cssClass: 'blue' },
  ];
  return [
    { key: 'r', label: 'Красный', cssClass: 'red' },
    { key: 'g', label: 'Зелёный', cssClass: 'green' },
    { key: 'b', label: 'Синий', cssClass: 'blue' },
    { key: 'a', label: 'Альфа', cssClass: 'alpha' },
  ];
}

function toggleChannel(key, itemEl) {
  state.channels[key] = !state.channels[key];
  itemEl.classList.toggle('active', state.channels[key]);
  itemEl.classList.toggle('disabled', !state.channels[key]);
  renderCanvas();
}

function updateChannelThumb(itemEl, channelKey) {
  if (!state.currentData) return;
  const thumbCanvas = itemEl.querySelector('canvas');
  const tCtx = thumbCanvas.getContext('2d');
  const src = state.currentData;
  const w = src.width, h = src.height;

  // Создаём миниатюру в градациях серого для этого канала
  const thumbData = new ImageData(36, 36);
  const td = thumbData.data;
  const sd = src.data;

  const channelIdx = { r: 0, g: 1, b: 2, a: 3 }[channelKey];

  for (let ty = 0; ty < 36; ty++) {
    for (let tx = 0; tx < 36; tx++) {
      const sx = Math.floor(tx * w / 36);
      const sy = Math.floor(ty * h / 36);
      const si = (sy * w + sx) * 4;
      const ti = (ty * 36 + tx) * 4;
      const val = sd[si + channelIdx];
      td[ti] = td[ti + 1] = td[ti + 2] = val;
      td[ti + 3] = 255;
    }
  }

  tCtx.putImageData(thumbData, 0, 0);
}

function refreshChannelThumbs() {
  const items = els.channelsList.querySelectorAll('.channel-item');
  items.forEach((item) => {
    updateChannelThumb(item, item.dataset.channel);
  });
}

// ==========================================
// Пипетка (Eyedropper)
// ==========================================

els.btnEyedropper.addEventListener('click', () => {
  state.eyedropperActive = !state.eyedropperActive;
  els.btnEyedropper.classList.toggle('active', state.eyedropperActive);
  canvas.classList.toggle('eyedropper-active', state.eyedropperActive);
  els.eyedropperInfo.style.display = state.eyedropperActive ? 'block' : 'none';

  const leftPanel = $('#left-panel');
  if (leftPanel) {
    leftPanel.classList.toggle('panel--collapsed', !state.eyedropperActive);
    
    // Пересчитываем масштаб после окончания CSS transition (200ms)
    setTimeout(() => {
      if (els.zoomSelect.value === 'fit') {
        fitToScreen();
        renderCanvas();
      }
    }, 210);
  }
});

canvas.addEventListener('click', (e) => {
  if (!state.eyedropperActive || !state.currentData) return;
  const rect = canvas.getBoundingClientRect();
  // Корректный пересчёт координат с учётом масштаба
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = Math.floor((e.clientX - rect.left) * scaleX);
  const canvasY = Math.floor((e.clientY - rect.top) * scaleY);

  // Координаты относительно изображения
  const imgX = Math.floor(canvasX / state.zoom);
  const imgY = Math.floor(canvasY / state.zoom);

  if (imgX < 0 || imgX >= state.currentData.width || imgY < 0 || imgY >= state.currentData.height) return;

  const idx = (imgY * state.currentData.width + imgX) * 4;
  const d = state.currentData.data;
  const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];

  const lab = rgbToLab(r, g, b);
  const hex = rgbToHex(r, g, b);

  $('#eyedropper-x').textContent = imgX;
  $('#eyedropper-y').textContent = imgY;
  $('#eyedropper-r').textContent = r;
  $('#eyedropper-g').textContent = g;
  $('#eyedropper-b').textContent = b;
  $('#eyedropper-a').textContent = a;
  $('#eyedropper-hex').textContent = hex;
  $('#eyedropper-lab-l').textContent = lab.L.toFixed(2);
  $('#eyedropper-lab-a').textContent = lab.a.toFixed(2);
  $('#eyedropper-lab-b').textContent = lab.b.toFixed(2);
  $('#eyedropper-color-preview').style.background = `rgba(${r},${g},${b},${a / 255})`;
});

// Показываем координаты курсора на canvas
canvas.addEventListener('mousemove', (e) => {
  if (!state.currentData) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = Math.floor((e.clientX - rect.left) * scaleX);
  const canvasY = Math.floor((e.clientY - rect.top) * scaleY);
  const imgX = Math.floor(canvasX / state.zoom);
  const imgY = Math.floor(canvasY / state.zoom);
  if (imgX >= 0 && imgX < state.currentData.width && imgY >= 0 && imgY < state.currentData.height) {
    els.statusCursor.textContent = `X: ${imgX}  Y: ${imgY}`;
  }
});

canvas.addEventListener('mouseleave', () => {
  els.statusCursor.textContent = '';
});

// ==========================================
// Уровни (Levels)
// ==========================================

const levelsDialog = $('#levels-dialog');
const levelsChannel = $('#levels-channel');
const levelsHistCanvas = $('#levels-histogram');
const levelsHistCtx = levelsHistCanvas.getContext('2d');
const levelsBlack = $('#levels-black');
const levelsBlackSlider = $('#levels-black-slider');
const levelsWhite = $('#levels-white');
const levelsWhiteSlider = $('#levels-white-slider');
const levelsGammaVal = $('#levels-gamma-val');
const levelsGammaSlider = $('#levels-gamma-slider');
const levelsLog = $('#levels-log');
const levelsPreview = $('#levels-preview');

let levelsHistograms = null;

els.btnLevels.addEventListener('click', openLevelsDialog);

function openLevelsDialog() {
  if (!state.doc || !state.currentData) return;

  // Сохраняем текущее состояние для отмены
  state.levelsBackup = new Uint8ClampedArray(state.currentData.data);

  // Сбрасываем настройки
  state.levelsSettings = {
    master: { black: 0, white: 255, gamma: 1.0 },
    red:    { black: 0, white: 255, gamma: 1.0 },
    green:  { black: 0, white: 255, gamma: 1.0 },
    blue:   { black: 0, white: 255, gamma: 1.0 },
    alpha:  { black: 0, white: 255, gamma: 1.0 },
  };

  // Считаем гистограммы
  levelsHistograms = calculateAllHistograms(state.currentData);

  levelsChannel.value = 'master';
  loadLevelsChannel('master');
  drawHistogram('master');

  levelsDialog.showModal();
}

function loadLevelsChannel(ch) {
  const s = state.levelsSettings[ch];
  levelsBlack.value = s.black;
  levelsBlackSlider.value = s.black;
  levelsWhite.value = s.white;
  levelsWhiteSlider.value = s.white;
  levelsGammaVal.value = s.gamma.toFixed(2);
  levelsGammaSlider.value = Math.round(s.gamma * 100);
}

function saveLevelsChannel() {
  const ch = levelsChannel.value;
  state.levelsSettings[ch] = {
    black: parseInt(levelsBlack.value),
    white: parseInt(levelsWhite.value),
    gamma: parseFloat(levelsGammaVal.value),
  };
}

levelsChannel.addEventListener('change', () => {
  loadLevelsChannel(levelsChannel.value);
  drawHistogram(levelsChannel.value);
});

// Связка input ↔ slider
function syncLevelsInputs(inputEl, sliderEl, type) {
  inputEl.addEventListener('input', () => {
    sliderEl.value = inputEl.value;
    constrainLevels();
    saveLevelsChannel();
    applyLevelsPreview();
  });
  sliderEl.addEventListener('input', () => {
    if (type === 'gamma') {
      inputEl.value = (parseInt(sliderEl.value) / 100).toFixed(2);
    } else {
      inputEl.value = sliderEl.value;
    }
    constrainLevels();
    saveLevelsChannel();
    applyLevelsPreview();
  });
}

syncLevelsInputs(levelsBlack, levelsBlackSlider, 'black');
syncLevelsInputs(levelsWhite, levelsWhiteSlider, 'white');
syncLevelsInputs(levelsGammaVal, levelsGammaSlider, 'gamma');

function constrainLevels() {
  let b = parseInt(levelsBlack.value);
  let w = parseInt(levelsWhite.value);
  if (b >= w) {
    if (document.activeElement === levelsBlack || document.activeElement === levelsBlackSlider) {
      b = Math.min(b, 254);
      w = b + 1;
      levelsWhite.value = w;
      levelsWhiteSlider.value = w;
    } else {
      w = Math.max(w, 1);
      b = w - 1;
      levelsBlack.value = b;
      levelsBlackSlider.value = b;
    }
  }
}

levelsLog.addEventListener('change', () => drawHistogram(levelsChannel.value));

levelsPreview.addEventListener('change', () => {
  if (levelsPreview.checked) {
    applyLevelsPreview();
  } else {
    // Возвращаем к оригиналу
    state.currentData = new ImageData(
      new Uint8ClampedArray(state.levelsBackup),
      state.doc.width, state.doc.height
    );
    renderCanvas();
  }
});

let levelsRAF = null;
function applyLevelsPreview() {
  if (!levelsPreview.checked) return;
  if (levelsRAF) cancelAnimationFrame(levelsRAF);
  levelsRAF = requestAnimationFrame(() => {
    const luts = buildLUTs();
    const srcData = new ImageData(
      new Uint8ClampedArray(state.levelsBackup),
      state.doc.width, state.doc.height
    );
    state.currentData = applyLevels(srcData, luts);
    renderCanvas();
  });
}

function buildLUTs() {
  const s = state.levelsSettings;
  const masterLUT = generateLUT(s.master.black, s.master.white, s.master.gamma);

  // Для каждого канала: сначала master, потом канальный
  function combineLUT(channelSettings) {
    const chLUT = generateLUT(channelSettings.black, channelSettings.white, channelSettings.gamma);
    const combined = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      combined[i] = chLUT[masterLUT[i]];
    }
    return combined;
  }

  return {
    r: combineLUT(s.red),
    g: combineLUT(s.green),
    b: combineLUT(s.blue),
    a: combineLUT(s.alpha),
  };
}

function drawHistogram(channel) {
  if (!levelsHistograms) return;
  const w = levelsHistCanvas.width;
  const h = levelsHistCanvas.height;
  levelsHistCtx.clearRect(0, 0, w, h);

  let data;
  let color;
  if (channel === 'master') {
    data = levelsHistograms.luminosity;
    color = '#cdd6f4';
  } else if (channel === 'red') {
    data = levelsHistograms.red;
    color = '#f38ba8';
  } else if (channel === 'green') {
    data = levelsHistograms.green;
    color = '#a6e3a1';
  } else if (channel === 'blue') {
    data = levelsHistograms.blue;
    color = '#89b4fa';
  } else {
    data = levelsHistograms.alpha;
    color = '#9399b2';
  }

  let maxVal = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
  }
  if (maxVal === 0) return;

  const useLog = levelsLog.checked;

  levelsHistCtx.fillStyle = color;
  levelsHistCtx.globalAlpha = 0.7;

  for (let i = 0; i < 256; i++) {
    const val = data[i];
    let barH;
    if (useLog) {
      barH = val > 0 ? (Math.log(val + 1) / Math.log(maxVal + 1)) * h : 0;
    } else {
      barH = (val / maxVal) * h;
    }
    const x = (i / 256) * w;
    const barW = Math.max(w / 256, 1);
    levelsHistCtx.fillRect(x, h - barH, barW, barH);
  }

  levelsHistCtx.globalAlpha = 1;
}

$('#levels-reset').addEventListener('click', () => {
  const ch = levelsChannel.value;
  state.levelsSettings[ch] = { black: 0, white: 255, gamma: 1.0 };
  loadLevelsChannel(ch);
  applyLevelsPreview();
});

$('#levels-cancel').addEventListener('click', () => {
  // Восстанавливаем оригинал
  state.currentData = new ImageData(
    new Uint8ClampedArray(state.levelsBackup),
    state.doc.width, state.doc.height
  );
  renderCanvas();
  levelsDialog.close();
});

$('#levels-apply').addEventListener('click', () => {
  // Применяем финально
  saveLevelsChannel();
  const luts = buildLUTs();
  const srcData = new ImageData(
    new Uint8ClampedArray(state.levelsBackup),
    state.doc.width, state.doc.height
  );
  state.currentData = applyLevels(srcData, luts);

  // Обновляем оригинальные данные в документе
  state.doc.originalData = new Uint8ClampedArray(state.currentData.data);

  renderCanvas();
  refreshChannelThumbs();
  levelsDialog.close();
});

// Закрытие диалога по кнопке ×
levelsDialog.querySelector('[data-close]').addEventListener('click', () => {
  $('#levels-cancel').click();
});

// ==========================================
// Изменение размера (Resize)
// ==========================================

const resizeDialog = $('#resize-dialog');
const resizeWidth = $('#resize-width');
const resizeHeight = $('#resize-height');
const resizeUnit = $('#resize-unit');
const resizeLinkBtn = $('#resize-link');
const resizeMethod = $('#resize-method');
const resizeTooltip = $('#resize-method-tooltip');
const resizeCurrentMp = $('#resize-current-mp');
const resizeNewMp = $('#resize-new-mp');

els.btnResize.addEventListener('click', openResizeDialog);

function openResizeDialog() {
  if (!state.doc) return;
  state.aspectRatio = state.doc.width / state.doc.height;
  state.resizeLinked = true;
  resizeLinkBtn.classList.add('resize__link-btn--active');

  resizeUnit.value = 'percent';
  resizeWidth.value = 100;
  resizeHeight.value = 100;
  resizeWidth.min = 1;
  resizeHeight.min = 1;

  const mp = (state.doc.width * state.doc.height) / 1e6;
  resizeCurrentMp.textContent = mp.toFixed(2);
  resizeNewMp.textContent = mp.toFixed(2);

  updateResizeTooltip();
  resizeDialog.showModal();
}

resizeLinkBtn.addEventListener('click', () => {
  state.resizeLinked = !state.resizeLinked;
  resizeLinkBtn.classList.toggle('resize__link-btn--active', state.resizeLinked);
});

resizeUnit.addEventListener('change', () => {
  if (resizeUnit.value === 'pixels') {
    resizeWidth.value = state.doc.width;
    resizeHeight.value = state.doc.height;
    resizeWidth.min = 1;
    resizeHeight.min = 1;
    resizeWidth.max = state.doc.width * 3;
    resizeHeight.max = state.doc.height * 3;
  } else {
    resizeWidth.value = 100;
    resizeHeight.value = 100;
    resizeWidth.min = 1;
    resizeHeight.min = 1;
    resizeWidth.max = 300;
    resizeHeight.max = 300;
  }
  updateResizeNewMp();
});

resizeWidth.addEventListener('input', () => {
  if (state.resizeLinked) {
    if (resizeUnit.value === 'percent') {
      resizeHeight.value = resizeWidth.value;
    } else {
      resizeHeight.value = Math.round(parseInt(resizeWidth.value) / state.aspectRatio);
    }
  }
  validateResizeInputs();
  updateResizeNewMp();
});

resizeHeight.addEventListener('input', () => {
  if (state.resizeLinked) {
    if (resizeUnit.value === 'percent') {
      resizeWidth.value = resizeHeight.value;
    } else {
      resizeWidth.value = Math.round(parseInt(resizeHeight.value) * state.aspectRatio);
    }
  }
  validateResizeInputs();
  updateResizeNewMp();
});

function validateResizeInputs() {
  [resizeWidth, resizeHeight].forEach((input) => {
    const val = parseInt(input.value);
    const isValid = !isNaN(val) && val >= parseInt(input.min) && val <= parseInt(input.max || 99999);
    input.classList.toggle('invalid', !isValid);
  });
}

function updateResizeNewMp() {
  let newW, newH;
  if (resizeUnit.value === 'percent') {
    newW = Math.round(state.doc.width * parseInt(resizeWidth.value || 100) / 100);
    newH = Math.round(state.doc.height * parseInt(resizeHeight.value || 100) / 100);
  } else {
    newW = parseInt(resizeWidth.value) || state.doc.width;
    newH = parseInt(resizeHeight.value) || state.doc.height;
  }
  resizeNewMp.textContent = ((newW * newH) / 1e6).toFixed(2);
}

resizeMethod.addEventListener('change', updateResizeTooltip);

function updateResizeTooltip() {
  const desc = getMethodDescription(resizeMethod.value);
  resizeTooltip.innerHTML = `<strong>${desc.name}</strong><br>${desc.description}`;
}

$('#resize-cancel').addEventListener('click', () => resizeDialog.close());
resizeDialog.querySelector('[data-close]').addEventListener('click', () => resizeDialog.close());

$('#resize-apply').addEventListener('click', () => {
  if (!state.doc) return;

  let newW, newH;
  if (resizeUnit.value === 'percent') {
    newW = Math.round(state.doc.width * parseInt(resizeWidth.value) / 100);
    newH = Math.round(state.doc.height * parseInt(resizeHeight.value) / 100);
  } else {
    newW = parseInt(resizeWidth.value);
    newH = parseInt(resizeHeight.value);
  }

  if (newW < 1 || newH < 1 || newW > 20000 || newH > 20000) {
    alert('Недопустимые размеры');
    return;
  }

  const method = resizeMethod.value === 'nearest'
    ? INTERPOLATION_METHODS.NEAREST
    : INTERPOLATION_METHODS.BILINEAR;

  const resized = resizeImage(state.currentData, newW, newH, method);

  // Обновляем документ
  state.doc.width = newW;
  state.doc.height = newH;
  state.doc.originalData = new Uint8ClampedArray(resized.data);
  state.currentData = resized;

  updateStatusBar();
  buildChannelsPanel();
  fitToScreen();
  renderCanvas();
  resizeDialog.close();
});

// ==========================================
// Фильтры (Convolution)
// ==========================================

const filterDialog = $('#filter-dialog');
const filterPreset = $('#filter-preset');
const filterKernelCells = document.querySelectorAll('.filter__kernel-cell');
const filterPreview = $('#filter-preview');
let filterBackup = null;

els.btnFilter.addEventListener('click', openFilterDialog);

function openFilterDialog() {
  if (!state.doc || !state.currentData) return;
  filterBackup = new Uint8ClampedArray(state.currentData.data);
  filterPreset.value = 'identity';
  loadKernelPreset('identity');
  filterDialog.showModal();
}

function loadKernelPreset(name) {
  const preset = KERNEL_PRESETS[name];
  if (!preset) return;
  filterKernelCells.forEach((cell, i) => {
    cell.value = preset.kernel[i];
  });
}

filterPreset.addEventListener('change', () => {
  loadKernelPreset(filterPreset.value);
  applyFilterPreview();
});

filterKernelCells.forEach((cell) => {
  cell.addEventListener('input', () => applyFilterPreview());
});

$('#filter-ch-r').addEventListener('change', () => applyFilterPreview());
$('#filter-ch-g').addEventListener('change', () => applyFilterPreview());
$('#filter-ch-b').addEventListener('change', () => applyFilterPreview());
$('#filter-ch-a').addEventListener('change', () => applyFilterPreview());
$('#filter-edge').addEventListener('change', () => applyFilterPreview());
filterPreview.addEventListener('change', () => {
  if (filterPreview.checked) {
    applyFilterPreview();
  } else {
    state.currentData = new ImageData(
      new Uint8ClampedArray(filterBackup),
      state.doc.width, state.doc.height
    );
    renderCanvas();
  }
});

let filterWorker = null;
let filterRAF = null;

function getKernelFromGrid() {
  return Array.from(filterKernelCells).map((c) => parseFloat(c.value) || 0);
}

function getFilterChannels() {
  return {
    r: $('#filter-ch-r').checked,
    g: $('#filter-ch-g').checked,
    b: $('#filter-ch-b').checked,
    a: $('#filter-ch-a').checked,
  };
}

function applyFilterPreview() {
  if (!filterPreview.checked) return;
  if (filterRAF) cancelAnimationFrame(filterRAF);

  filterRAF = requestAnimationFrame(() => {
    const kernel = getKernelFromGrid();
    const channels = getFilterChannels();
    const edgeMode = $('#filter-edge').value;

    const srcData = new ImageData(
      new Uint8ClampedArray(filterBackup),
      state.doc.width, state.doc.height
    );

    // Для больших изображений используем Web Worker
    const pixelCount = state.doc.width * state.doc.height;
    if (pixelCount > 500000 && typeof Worker !== 'undefined') {
      applyFilterWithWorker(srcData, kernel, channels, edgeMode);
    } else {
      state.currentData = applyConvolution(srcData, kernel, channels, edgeMode);
      renderCanvas();
    }
  });
}

function applyFilterWithWorker(srcData, kernel, channels, edgeMode) {
  if (filterWorker) filterWorker.terminate();

  try {
    filterWorker = new Worker(
      new URL('./workers/convolution.worker.js', import.meta.url),
      { type: 'module' }
    );

    filterWorker.onmessage = (e) => {
      const result = new Uint8ClampedArray(e.data.result);
      state.currentData = new ImageData(result, state.doc.width, state.doc.height);
      renderCanvas();
      filterWorker.terminate();
      filterWorker = null;
    };

    filterWorker.onerror = (err) => {
      console.warn('Worker error, fallback to sync:', err);
      state.currentData = applyConvolution(srcData, kernel, channels, edgeMode);
      renderCanvas();
    };

    const buffer = srcData.data.buffer.slice(0);
    filterWorker.postMessage({
      pixelData: buffer,
      width: srcData.width,
      height: srcData.height,
      kernel,
      channels,
      edgeMode,
    }, [buffer]);
  } catch (err) {
    console.warn('Worker creation failed, fallback to sync:', err);
    state.currentData = applyConvolution(srcData, kernel, channels, edgeMode);
    renderCanvas();
  }
}

$('#filter-close').addEventListener('click', () => {
  state.currentData = new ImageData(
    new Uint8ClampedArray(filterBackup),
    state.doc.width, state.doc.height
  );
  renderCanvas();
  filterDialog.close();
});

$('#filter-reset').addEventListener('click', () => {
  filterPreset.value = 'identity';
  loadKernelPreset('identity');
  state.currentData = new ImageData(
    new Uint8ClampedArray(filterBackup),
    state.doc.width, state.doc.height
  );
  renderCanvas();
});

$('#filter-apply').addEventListener('click', () => {
  const kernel = getKernelFromGrid();
  const channels = getFilterChannels();
  const edgeMode = $('#filter-edge').value;

  const srcData = new ImageData(
    new Uint8ClampedArray(filterBackup),
    state.doc.width, state.doc.height
  );

  state.currentData = applyConvolution(srcData, kernel, channels, edgeMode);
  state.doc.originalData = new Uint8ClampedArray(state.currentData.data);

  renderCanvas();
  refreshChannelThumbs();
  filterDialog.close();
});

filterDialog.querySelector('[data-close]').addEventListener('click', () => {
  $('#filter-close').click();
});

// ==========================================
// Горячие клавиши
// ==========================================

document.addEventListener('keydown', (e) => {
  // I — пипетка
  if (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш') {
    if (!e.ctrlKey && !e.metaKey) {
      els.btnEyedropper.click();
    }
  }
  // Ctrl+L — Уровни
  if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д')) {
    e.preventDefault();
    if (!els.btnLevels.disabled) els.btnLevels.click();
  }
  // Ctrl+O — Открыть
  if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O' || e.key === 'щ' || e.key === 'Щ')) {
    e.preventDefault();
    els.btnOpen.click();
  }
  // Ctrl+S — Сохранить
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы')) {
    e.preventDefault();
    if (!els.btnSave.disabled) els.btnSave.click();
  }
});

// ==========================================
// Инициализация
// ==========================================

enableControls(false);

// Инициализация обработчиков кнопок тестовых пресетов
document.querySelectorAll('.empty-state__preset-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const preset = btn.dataset.preset;
    if (preset) {
      loadTestImage(preset);
    }
  });
});

console.log('Image Processor загружен');
