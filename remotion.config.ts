// Конфиг Remotion CLI (studio / still / render).
import { Config } from '@remotion/cli/config';

// WebGL (Paper Shaders) в headless-рендере. Рекомендация Remotion: на Mac — 'angle' (GPU),
// на Linux/CI без GPU — 'swangle' (программный ANGLE/SwiftShader). Переопределение: REMOTION_GL=swangle.
const gl = (process.env.REMOTION_GL ?? 'angle') as Parameters<typeof Config.setChromiumOpenGlRenderer>[0];
Config.setChromiumOpenGlRenderer(gl);

// Свой браузер вместо скачанного `npx remotion browser ensure` — только если явно задан (см. env.manifest.json).
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}

Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
