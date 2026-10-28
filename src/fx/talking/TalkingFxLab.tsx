// src/fx/talking/TalkingFxLab.tsx — лаборатория эффектов говорящей головы (задача 026-А): композиция TalkingFxLab.
// props { matteId, plan } — план из videos/talking-fx-pilot/talking-fx.yaml (по умолчанию) или свой JSON через --props.
// calculateMetadata читает MATTE_DIR/<matteId>/{matte.json,face.json} (через public/matte/<id>), проверяет план схемой
// и против лица (громкий отказ), длина — по кадрам маски. Слои: исходник (кроп 9:16) → bignum (за человеком) →
// person.mov → figma, lens (поверх). Stills: npm run still -- TalkingFxLab <кадр> [--props '{"plan":{...}}'].
import React from 'react';
import { AbsoluteFill, CalculateMetadataFunction } from 'remotion';
import { parse } from 'yaml';
import { z } from 'zod';
import { BehindPerson, matteSrc } from '../../matte/BehindPerson.tsx';
import { loadFace, type FaceTrack } from '../../matte/face.ts';
import { loadAllFonts } from '../../theme/loadFonts.ts';
import { boxOf } from './effects.ts';
import { checkFace, parsePlan, planSchema, type Plan } from './plan.ts';
import { BigNum, FigmaSelect, Lens, SourceVideo, type Crop } from './TalkingFx.tsx';
import pilotYaml from '../../../videos/talking-fx-pilot/talking-fx.yaml';

loadAllFonts();

export const TALKING_FPS = 30;
export const PILOT_PLAN: Plan = parsePlan(parse(pilotYaml));
type Meta = { crop: Crop; srcFps: number; frames: number; face: FaceTrack; faceCheck: ReturnType<typeof checkFace> };
export const talkingLabSchema = z.object({ matteId: z.string(), plan: planSchema, meta: z.custom<Meta>().optional() });
type Props = z.infer<typeof talkingLabSchema>;

export const talkingLabMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const plan = parsePlan(props.plan);
  const src = matteSrc(props.matteId);
  const [mj, fj] = await Promise.all([fetch(src.matte.replace(/matte\.mp4$/, 'matte.json')), fetch(src.face)]);
  if (!mj.ok || !fj.ok) throw new Error(`TalkingFxLab: нет matte.json/face.json для ${props.matteId} — npm run matte -- <video> --id ${props.matteId}`);
  const man = (await mj.json()) as { source: { crop: Crop; fps: number }; outputs: { 'matte.mp4': { frames: number } } };
  const face = loadFace(await fj.json());
  const faceCheck = checkFace(plan, face, TALKING_FPS, boxOf);
  const meta: Meta = { crop: man.source.crop, srcFps: man.source.fps, frames: man.outputs['matte.mp4'].frames, face, faceCheck };
  return { props: { ...props, plan, meta }, durationInFrames: meta.frames };
};

export const TalkingFxLab: React.FC<Props> = ({ matteId, plan, meta }) => {
  if (!meta) throw new Error('TalkingFxLab: нет meta — composition без calculateMetadata');
  const src = matteSrc(matteId);
  const videoSrc = src.person.replace(/[^/]+\/person\.mov$/, plan.video.file);
  const frame = <SourceVideo src={videoSrc} crop={meta.crop} srcFps={meta.srcFps} />;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {frame}
      <BehindPerson person={src.person}>
        {plan.effects.filter((e) => e.fx === 'bignum').map((e) => <BigNum key={e.t0} e={e as Extract<typeof e, { fx: 'bignum' }>} />)}
      </BehindPerson>
      {plan.effects.map((e) => {
        if (e.fx === 'figma') return <FigmaSelect key={e.t0} e={e} />;
        if (e.fx === 'lens') return (
          <Lens key={e.t0} e={e}>
            {frame}
            <BehindPerson person={src.person} />
          </Lens>
        );
        return null;
      })}
    </AbsoluteFill>
  );
};
