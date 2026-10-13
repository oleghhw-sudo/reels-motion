// Safe zones 9:16 (ARCHITECTURE.md): верх 220, низ 380, правый край 140; left — рабочее поле текста, не зона UI.
// Единственный источник чисел: читают SafeZones.tsx (оверлей), сцены роликов и scripts/readcheck.mjs (проверка).
// Вынесено из SafeZones.tsx в .ts, чтобы node-скрипт мог импортировать без JSX.
export const SAFE = { top: 220, bottom: 380, right: 140, left: 64 } as const;
