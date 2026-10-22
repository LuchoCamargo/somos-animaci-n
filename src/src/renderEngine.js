export const LAYER_EFFECTS = ['none', 'pop', 'push', 'slide', 'ribbon', 'fade', 'zoom', 'bounce', 'elastic', 'scale', 'rotate', 'flip', 'blur'];
export const TEXT_EFFECTS = ['none', 'slide', 'fade', 'pop', 'write', 'smooth', 'ease-fade-separately', 'ease-fade-together', 'ease-fade-position'];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
export function bezierAt(progress, points = [0.22, 0.61, 0.36, 1]) {
  const p = clamp(progress, 0, 1); let lo = 0, hi = 1, t = p;
  for (let i = 0; i < 20; i++) { const x = cubic(t, points[0], points[2]); if (Math.abs(x - p) < 0.00001) break; if (x < p) lo = t; else hi = t; t = (lo + hi) / 2; }
  return cubic(t, points[1], points[3]);
}
function bounce(t) { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; }
export function animation(layer, time) {
  const a = { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, rotation: 0, scaleX: 1 };
  if (time === null || layer.anim === 'none') return a;
  const p = clamp((time - layer.animDelay) / Math.max(0.05, layer.animDuration), 0, 1);
  if (time < layer.animDelay) return { ...a, alpha: 0 };
  const e = bezierAt(p, layer.cubicBezier);
  if (layer.anim === 'pop') a.scale = 0.48 + 0.52 * e + 0.08 * Math.sin(p * Math.PI);
  if (layer.anim === 'zoom' || layer.anim === 'scale') a.scale = 0.05 + 0.95 * e;
  if (layer.anim === 'fade') a.alpha = e;
  if (layer.anim === 'bounce') { a.y = -220 * (1 - bounce(e)); a.alpha = Math.min(1, p * 6); }
  if (layer.anim === 'elastic') a.scale = e === 0 ? 0.01 : e === 1 ? 1 : 1 + 2 ** (-10 * e) * Math.sin((e * 10 - 0.75) * (2 * Math.PI / 3));
  if (layer.anim === 'rotate') { a.rotation = -90 * (1 - e); a.alpha = e; }
  if (layer.anim === 'flip') { a.scaleX = Math.max(0.01, e); a.alpha = e; }
  if (layer.anim === 'blur') { a.blur = 24 * (1 - e); a.alpha = e; }
  if (['slide', 'ribbon', 'push'].includes(layer.anim)) {
    const travel = 220 * (1 - e);
    if (layer.animDirection === 'left') a.x = -travel;
    if (layer.animDirection === 'right') a.x = travel;
    if (layer.animDirection === 'top') a.y = -travel;
    if (layer.animDirection === 'bottom') a.y = travel;
    if (layer.anim === 'ribbon') { a.y -= Math.sin(p * Math.PI) * 35; a.scale = 0.96 + 0.04 * e; }
  }
  if (layer.motionBlur && p < 1) a.blur = Math.max(a.blur, (1 - p) * 7);
  return a;
}
function textFrame(ctx, layer, time) {
  const size = Math.max(1, layer.fontSize), spacing = Number(layer.tracking || 0), lineHeight = size * Number(layer.lineHeight || 1.12);
  ctx.fillStyle = layer.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `${layer.fontWeight || 700} ${size}px "${layer.fontFamily || 'Roboto'}"`;
  const lines = String(layer.text || '').split('\n'), total = Math.max(1, lines.join('').length);
  const effect = layer.textAnim || 'none', raw = time === null ? 1 : clamp((time - layer.animDelay) / Math.max(0.05, layer.animDuration), 0, 1);
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const characters = Array.from(lines[i]), widths = characters.map(c => ctx.measureText(c).width + spacing);
    const width = Math.max(0, widths.reduce((a, b) => a + b, 0) - spacing), fit = width > layer.w ? layer.w / width : 1;
    let x = layer.textAlign === 'left' ? -layer.w / 2 : layer.textAlign === 'right' ? layer.w / 2 - width * fit : -width * fit / 2;
    for (let j = 0; j < characters.length; j++, index++) {
      let p = raw;
      if (['smooth', 'ease-fade-separately', 'ease-fade-position', 'write'].includes(effect)) p = clamp((raw - index / total * 0.65) / 0.35, 0, 1);
      const e = bezierAt(p, layer.cubicBezier); let alpha = 1, dx = 0, dy = 0, scale = 1;
      if (time !== null && effect !== 'none') {
        if (effect === 'write') alpha = p > 0 ? 1 : 0;
        else { alpha = effect === 'fade' ? p : e; if (['smooth', 'ease-fade-position'].includes(effect)) dy = (1 - e) * size * 0.55; if (effect === 'slide') dx = -(1 - e) * size; if (effect === 'pop') scale = 0.3 + 0.7 * e; }
      }
      ctx.save(); ctx.globalAlpha *= clamp(alpha, 0, 1); if (effect === 'smooth' && time !== null && p < 1) ctx.filter = `blur(${(1-p)*5}px)`; ctx.translate(x + dx, (i - (lines.length - 1) / 2) * lineHeight + dy); ctx.scale(fit * scale, scale); ctx.fillText(characters[j], 0, 0); ctx.restore(); x += widths[j] * fit;
    }
  }
}
export function drawFrame(canvas, layers, time = null, previewId = null, { transparent = false, background = '#ffffff' } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparent) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.save(); ctx.scale(canvas.width / 1080, canvas.height / 1920);
  for (const layer of layers) {
    if (!layer.visible) continue;
    const at = previewId && layer.id !== previewId ? null : time, a = animation(layer, at);
    if (a.alpha <= 0) continue;
    ctx.save(); ctx.translate(layer.x + a.x, layer.y + a.y); ctx.rotate(((layer.rotation || 0) + a.rotation) * Math.PI / 180);
    ctx.globalAlpha = clamp(layer.opacity * a.alpha, 0, 1); ctx.scale(layer.scale * a.scale * a.scaleX, layer.scale * a.scale); if (a.blur > 0) ctx.filter = `blur(${a.blur}px)`;
    if (layer.type === 'text') textFrame(ctx, layer, at);
    else if (layer.type === 'shape') { ctx.fillStyle = layer.color; ctx.fillRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h); }
    else if (layer.asset?.element) { const el = layer.asset.element, w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height; if (w && h) { const ratio = Math.min(layer.w / w, layer.h / h); ctx.drawImage(el, -w * ratio / 2, -h * ratio / 2, w * ratio, h * ratio); } }
    ctx.restore();
  }
  ctx.restore();
}
