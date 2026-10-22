import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

export async function readIllustrator(file, onProgress = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('Este AI no contiene una representación PDF. Guardalo en Illustrator activando “Crear archivo compatible con PDF”, o exportá sus capas como SVG.');
  const task = getDocument({ data: bytes, isEvalSupported: false });
  const document = await task.promise;
  const results = []; let layered = false;
  try {
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo), initial = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1920 / Math.max(initial.width, initial.height)) });
      const config = await document.getOptionalContentConfig({ intent: 'display' });
      const entries = typeof config[Symbol.iterator] === 'function' ? [...config] : Object.entries(config.getGroups?.() || {});
      const targets = entries.length ? entries : [[null, { name: `Mesa ${pageNo}` }]];
      layered ||= entries.length > 0;
      for (const [id, group] of targets) {
        onProgress(`Importando ${group.name || 'capa'}…`);
        const optional = await document.getOptionalContentConfig({ intent: 'display' });
        if (id) { for (const [other] of entries) optional.setVisibility(other, other === id, false); }
        const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        await page.render({ canvasContext: context, viewport, background: 'rgba(0,0,0,0)', optionalContentConfigPromise: Promise.resolve(optional) }).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) results.push({ blob, name: `${file.name} · ${pageNo > 1 ? `Mesa ${pageNo} · ` : ''}${group.name || 'Capa'}`, width: canvas.width, height: canvas.height });
      }
    }
    return { items: results, layered };
  } finally { await task.destroy(); }
}
