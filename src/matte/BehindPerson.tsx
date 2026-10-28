// src/matte/BehindPerson.tsx — слой «за человеком» (задача 025, потребитель — cinematic-fx §3 O).
// Фон-видео (если есть) → дети (графика «за человеком») → person.mov (ProRes 4444 с альфой) сверху через
// <OffthreadVideo transparent>. Без mask-image / backgroundImage (remotion.dev/docs/flickering) и без backdrop-filter.
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';

/** Пути файлов маски для Remotion: public/matte/<id> → ссылка на MATTE_DIR/<id> (её делает npm run matte). */
export const matteSrc = (id: string) => ({
  person: staticFile(`matte/${id}/person.mov`),
  matte: staticFile(`matte/${id}/matte.mp4`),
  face: staticFile(`matte/${id}/face.json`),
});

export const BehindPerson: React.FC<{
  /** person.mov с альфой (matteSrc(id).person) */
  person: string;
  /** фон-видео 1080×1920 (обычно тот же отрезок исходника); без него — только дети и человек */
  video?: string;
  /** смещение внутри файлов в секундах (если person.mov длиннее сцены) */
  startFrom?: number;
  children?: React.ReactNode;
}> = ({ person, video, startFrom = 0, children }) => {
  const sf = Math.round(startFrom * 30);
  return (
    <AbsoluteFill>
      {video ? <OffthreadVideo src={video} muted startFrom={sf} style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920 }} /> : null}
      <AbsoluteFill>{children}</AbsoluteFill>
      <OffthreadVideo src={person} muted transparent startFrom={sf} style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920 }} />
    </AbsoluteFill>
  );
};
