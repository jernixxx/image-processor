# Image Processor — Веб-приложение для обработки изображений

Приложение для работы с изображениями в браузере, реализованное на Vanilla JavaScript + Vite.

## Возможности

- **Загрузка и сохранение** изображений в форматах PNG, JPEG и GB7
- **Панель каналов** — переключение отображения R/G/B/A каналов с миниатюрами
- **Пипетка** — получение цвета пикселя (RGB + CIELAB)
- **Уровни (Levels)** — гистограмма (линейная/логарифмическая), входные уровни, гамма-коррекция
- **Масштабирование** — ближайший сосед и билинейная интерполяция, изменение размера
- **Фильтрация** — свёртка 3×3 с пресетами (Гаусс, резкость, Прюитт и др.), Web Worker

## Запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
```

## Структура проекта

```
src/
├── main.js                     # Точка входа
├── core/                       # Логика обработки изображений
│   ├── ImageDocument.js        # Класс документа
│   ├── gb7.js                  # GB7 кодер/декодер
│   ├── color.js                # RGB → CIELAB
│   ├── histogram.js            # Гистограммы
│   ├── levels.js               # Уровни (LUT)
│   ├── interpolation.js        # Интерполяция
│   └── convolution.js          # Свёртка
├── styles/                     # CSS
│   ├── index.css               # Дизайн-система
│   ├── layout.css              # Разметка
│   ├── toolbar.css             # Панель инструментов
│   ├── channels.css            # Панель каналов
│   └── dialog.css              # Диалоги
└── workers/
    └── convolution.worker.js   # Web Worker для фильтрации
```

## Хостинг

🔗 [Ссылка на хостинг]([TODO](https://jernixxx.github.io/image-processor/))

## Технологии

- Vite
- Vanilla JavaScript (ES Modules)
- HTML5 Canvas
- Web Workers
