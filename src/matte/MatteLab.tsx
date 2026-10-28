// src/matte/MatteLab.tsx — лаборатория маски (задача 025): композиция MatteLab, props { id }.
// Показывает: градиентный фон → круг «за человеком», привязанный к лицу (face.json) → person.mov с альфой →
// сверху рамка лица (QA). Длина — по face.json. Still: npm run still -- MatteLab 60 --props '{"id":"<id>"}'
import React from 'react';
import { AbsoluteFill, CalculateMetadataFunction, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { BehindPerson, matteSrc } from './BehindPerson.tsx';
import { faceAt, faceDuration, loadFace, type FaceTrack } from './face.ts';

export const matteLabSchema = z.object({ id: z.string(), face: z.custom<FaceTrack>().optional() });
type Props = z.infer<typeof matteLabSchema>;
export const MATTE_LAB_FPS = 30;

export const matteLabMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const res = await fetch(matteSrc(props.id).face);
  if (!res.ok) throw new Error(`MatteLab: нет ${matteSrc(props.id).face} — сделай npm run matte -- <video> --id ${props.id}`);
  const face = loadFace(await res.json());
  return { props: { ...props, face }, durationInFrames: Math.max(1, Math.ceil(faceDuration(face) * MATTE_LAB_FPS)) };
};

export const MatteLab: React.FC<Props> = ({ id, face }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const f = face ? faceAt(face, t) : null;
  const src = matteSrc(id);
  const r = f ? Math.max(120, f.w * 1.6) : 0;
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #1b2230 0%, #3a2f4a 100%)' }}>
      <BehindPerson person={src.person}>
        {f && f.source !== 'none' ? (
          <div style={{ position: 'absolute', left: f.cx - r, top: f.cy - r, width: 2 * r, height: 2 * r, borderRadius: '50%', background: '#f2c94c' }} />
        ) : null}
      </BehindPerson>
      {f && f.source !== 'none' ? (
        <div style={{ position: 'absolute', left: f.cx - f.w / 2, top: f.cy - f.w * 0.625, width: f.w, height: f.w * 1.25, border: `4px solid ${f.source === 'vision' ? '#2ee07a' : f.source === 'silhouette' ? '#ffd200' : '#aaaaaa'}` }} />
      ) : null}
      <div style={{ position: 'absolute', left: 40, top: 60, fontFamily: 'monospace', fontSize: 36, color: '#fff' }}>{`${id} · ${t.toFixed(2)} s · ${f?.source ?? '—'}`}</div>
    </AbsoluteFill>
  );
};
