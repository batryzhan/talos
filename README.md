# Talos — 3D симулятор шасси goBILDA Strafer (three.js)

    npm install
    npm run dev          # http://localhost:5173

Управление: W/S вперёд/назад, A/D стрейф, Q/E поворот, Shift медленно,
M — A/D ⇄ поворот, C — камера (орбита / за роботом / сверху), R — сброс, H — скрыть HUD.
Работает на любой раскладке (используются физические клавиши).

## Модель
`public/robot.glb` собран из `3209-0001-0004 assembly.STEP` (OpenCascade WASM → упрощение meshopt, 3.1М → 0.77М треугольников).
Пересборка (≈3 мин на разбор STEP):

    node tools/parse.mjs "3209-0001-0004 assembly.STEP" cache.bin
    node tools/build.mjs cache.bin public/robot.glb      # RATIO=0.2 — доля треугольников

Перед = +X, лево = +Y. Параметры (скорость, ускорение, размеры) — `CFG` в `src/main.js`.
Кинематика меканум-колёс считается по измеренным из CAD осям роликов; ролики у земли вращаются.
