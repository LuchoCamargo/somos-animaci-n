import { drawFrame } from './renderEngine.js';
const loadEncoder = () => import('mediabunny');
export async function canExportVideo(settings) {
  if (!window.isSecureContext || !('VideoEncoder' in window)) return false;
  const { canEncodeVideo } = await loadEncoder();
  return canEncodeVideo('avc', { width: settings.width, height: settings.width * 16 / 9, frameRate: settings.fps, bitrate: settings.width >= 1080 ? 12_000_000 : 6_000_000 });
}
function seek(video, time, signal) {
  return new Promise((resolve, reject) => {
    const target = Number.isFinite(video.duration) && video.duration > 0 ? time % video.duration : time;
    if (signal.aborted) { reject(new DOMException('Cancelado', 'AbortError')); return; }
    if (Math.abs(video.currentTime - target) < 0.0001 && video.readyState >= 2) { resolve(); return; }
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
    const done = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new Error('No se pudo leer un fotograma del video importado.')); }, aborted = () => { cleanup(); reject(new DOMException('Cancelado', 'AbortError')); };
    const timer = setTimeout(failed, 15000); video.addEventListener('seeked', done, { once: true }); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true }); video.pause(); video.currentTime = target;
  });
}
export async function exportComposition(project, settings, onProgress, signal) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = settings.width; canvas.height = settings.width * 16 / 9;
  const frames = Math.ceil(project.duration * settings.fps);
  signal.throwIfAborted();
  if (!await canExportVideo(settings)) throw new Error('Este navegador no permite exportar H.264 con esta resolución. Probá Chrome o Edge actualizado, o reducí la resolución.');
  if (!Number.isFinite(frames) || frames < 1) throw new Error('La duración del proyecto no es válida.');
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, Quality } = await loadEncoder();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: settings.width >= 1080 ? 12_000_000 : 6_000_000 }), keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: settings.fps });
  let completed = false;
  const videos = [...new Set(project.layers.filter(l => l.visible && l.asset?.kind === 'video').map(l => l.asset.element))];
  const times = videos.map(video => video.currentTime);
  try {
    await output.start();
    for (let frame = 0; frame < frames; frame++) {
      signal.throwIfAborted();
      const time = frame / settings.fps;
      await Promise.all(videos.map(video => seek(video, time, signal)));
      signal.throwIfAborted();
      drawFrame(canvas, project.layers, time, null, { transparent: false, background: settings.background });
      await source.add(time, Math.min(1 / settings.fps, project.duration - time));
      onProgress({ value: (frame + 1) / frames * 90, message: `Renderizando ${frame + 1} / ${frames} fotogramas` });
      if (frame % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    onProgress({ value: 95, message: 'Finalizando el contenedor de video…' });
    source.close();
    await output.finalize();
    signal.throwIfAborted();
    const url = URL.createObjectURL(new Blob([output.target.buffer], { type: 'video/mp4' }));
    const a = document.createElement('a'); a.href = url; a.download = `somos-animacion-${Date.now()}.mp4`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    completed = true;
    onProgress({ value: 100, message: 'MP4 H.264 listo. Descarga iniciada.' });
  } finally {
    if (!completed) await output.cancel().catch(() => {});
    videos.forEach((video, i) => { video.currentTime = times[i]; });
  }
}
