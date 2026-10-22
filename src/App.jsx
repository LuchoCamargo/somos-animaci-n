import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteProject, listProjects, saveProject } from './projectStore.js';
import { drawFrame, LAYER_EFFECTS } from './renderEngine.js';
import { exportComposition } from './videoExport.js';
import ExportDialog from './ExportDialog.jsx';
import EditorIcon from './EditorIcon.jsx';
import { TextPanel, CurvePanel } from './AdvancedPanels.jsx';

const W = 1080;
const H = 1920;
const freshProject = () => ({ id: crypto.randomUUID(), name: 'Mi proyecto', duration: 15, layers: [], assets: [], guides: true, userGuides: [] });
  const newLayer = (type, extra = {}) => ({
  id: crypto.randomUUID(), type, name: type === 'text' ? 'Texto nuevo' : type === 'shape' ? 'Forma' : 'Recurso',
  x: 540, y: 960, w: type === 'text' ? 850 : 500, h: type === 'text' ? 180 : 400,
  scale: 1, opacity: 1, rotation: 0, color: type === 'shape' ? '#e63631' : '#ffffff',
  text: 'Escribí tu mensaje', fontSize: 100, fontFamily: 'Roboto', fontWeight: 700,
  textAlign: 'center', textAnim: 'none', lineHeight: 1.12, tracking: 0, cubicBezier: [.22,.61,.36,1], visible: true, locked: false, anim: 'pop', animDuration: 0.7, animDelay: 0, animDirection: 'left', motionBlur: true,
  ...extra,
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const persistable = value => ({
  ...value,
  layers: value.layers.map(({ asset, ...layer }) => ({ ...layer, assetId: asset?.id || null })),
  assets: value.assets.map(({ element, url, ...asset }) => asset),
});
const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
const dataUrlToBlob = data => {
  const [header, encoded] = data.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
};

function IconButton({ title, children, onClick, className = '', disabled = false }) {
  return <button type="button" className={`icon-button ${className}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function App() {
  const [project, setProject] = useState(freshProject);
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(0.28);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [playing, setPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewRun, setPreviewRun] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [toast, setToast] = useState('');
  const [savedProjects, setSavedProjects] = useState([]);
  const [projectDialog, setProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [guideDraft, setGuideDraft] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [timelineScale, setTimelineScale] = useState(64);
  const [historyTick, setHistoryTick] = useState(0);
  const [activeTab, setActiveTab] = useState('assets');
  const [exporting, setExporting] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('properties');
  const [multiIds, setMultiIds] = useState([]);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(250);
  const exportController = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const timelineRef = useRef(null);
  const fileRef = useRef(null);
  const projectFileRef = useRef(null);
  const assetsRef = useRef([]);
  const projectRef = useRef(project);
  const selectedRef = useRef(selectedId);
  const playTimeRef = useRef(playTime);
  const dragRef = useRef(null);
  const playRef = useRef({ playing: false, start: 0, frame: 0 });
  const autosaveDirtyRef = useRef(false);
  const guideDragRef = useRef(null);
  const scrubRef = useRef(false);
  const spaceDownRef = useRef(false);
  const historyRef = useRef({ undo: [], redo: [], group: null });
  const selected = project.layers.find(layer => layer.id === selectedId) || null;
  const orderedLayers = useMemo(() => [...project.layers].reverse(), [project.layers]);
  const canUndo = historyTick >= 0 && historyRef.current.undo.length > 0;
  const canRedo = historyTick >= 0 && historyRef.current.redo.length > 0;
  const timelineWidth = Math.max(720, project.duration * timelineScale);
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  const rulerTopOffset = (viewportWidth - W * zoom) / 2 + pan.x;
  const rulerLeftOffset = (viewportHeight - H * zoom) / 2 + pan.y;
  const timelineTicks = Array.from({ length: Math.floor(project.duration) + 1 }, (_, second) => second);

  useEffect(() => { projectRef.current = project; drawFrame(canvasRef.current, project.layers, playing || scrubbing ? playTime : previewing ? previewTime : null, previewing ? selectedId : null); }, [project, playing, playTime, scrubbing, previewing, previewTime, selectedId]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  playRef.current.playing = playing;
  playTimeRef.current = playTime;
  useEffect(() => { assetsRef.current = project.assets; }, [project.assets]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const active = new Set(project.layers.map(layer => layer.asset?.id).filter(Boolean));
    project.assets.forEach(asset => {
      if (asset.kind !== 'video' || !active.has(asset.id)) return;
      if (playing || previewing) asset.element?.play?.().catch(() => {});
      else asset.element?.pause?.();
    });
  }, [project.assets, project.layers, playing, previewing, exporting]);
  useEffect(() => {
    listProjects().then(setSavedProjects).catch(() => {});
    return () => {
      cancelAnimationFrame(playRef.current.frame);
      assetsRef.current.forEach(asset => { if (asset.url) URL.revokeObjectURL(asset.url); });
    };
  }, []);
  useEffect(() => {
    if (!autosaveDirtyRef.current) return undefined;
    const snapshot = project;
    const timer = window.setTimeout(() => {
      saveProject(persistable(snapshot)).then(async () => {
        if (projectRef.current === snapshot) autosaveDirtyRef.current = false;
        setSavedProjects(await listProjects());
      }).catch(() => {});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    if (!previewing) return undefined;
    const layer = project.layers.find(item => item.id === selectedId);
    if (!layer) { setPreviewing(false); return undefined; }
    const start = performance.now();
    const end = layer.animDelay + layer.animDuration + 0.2;
    let frame;
    const tick = now => {
      const time = (now - start) / 1000;
      setPreviewTime(time);
      if (time < end) frame = requestAnimationFrame(tick);
      else { setPreviewing(false); setPreviewTime(0); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [previewRun, previewing, selectedId]);
  useEffect(() => {
    if (!playing) return undefined;
    playRef.current.start = performance.now() - playTime * 1000;
    const tick = now => {
      const time = (now - playRef.current.start) / 1000;
      if (time >= project.duration) { setPlayTime(project.duration); setPlaying(false); setScrubbing(true); return; }
      setPlayTime(time); playRef.current.frame = requestAnimationFrame(tick);
    };
    playRef.current.frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRef.current.frame);
  }, [playing]);
  useEffect(() => {
    const onKey = e => {
      const editingText = e.target instanceof HTMLElement && Boolean(e.target.closest('textarea, input[type="text"], [contenteditable="true"]'));
      const editingControl = e.target instanceof HTMLElement && Boolean(e.target.closest('input, textarea, select, [contenteditable="true"]'));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persistProject(); }
      if ((e.ctrlKey || e.metaKey) && !editingText && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoProject() : undoProject(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoProject(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); redoProject(); }
      if (e.code === 'Space' && !editingControl && !['BUTTON'].includes(e.target?.tagName)) {
        e.preventDefault(); spaceDownRef.current = true;
        if (!e.repeat) play();
      }
      if (e.key === 'Delete' && selectedRef.current && !editingControl && !projectRef.current.layers.find(layer => layer.id === selectedRef.current)?.locked) {
        e.preventDefault(); updateProject(p => ({ ...p, layers: p.layers.filter(layer => layer.id !== selectedRef.current) })); setSelectedId(null);
      }
    };
    const onKeyUp = e => { if (e.code === 'Space') spaceDownRef.current = false; };
    const onFocusOut = () => breakHistoryGroup();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('focusout', onFocusOut);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('focusout', onFocusOut); };
  }, [project]);

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const updateProject = (updater, group = null) => {
    const previous = projectRef.current;
    const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
    if (next === previous) return;
    const history = historyRef.current;
    if (!group || history.group !== group) {
      history.undo.push(previous);
      if (history.undo.length > 100) history.undo.shift();
    }
    history.group = group;
    history.redo = [];
    projectRef.current = next;
    autosaveDirtyRef.current = true;
    setProject(next);
    setHistoryTick(value => value + 1);
  };
  const breakHistoryGroup = () => { historyRef.current.group = null; };
  const undoProject = () => {
    const history = historyRef.current;
    if (!history.undo.length) return;
    history.redo.push(projectRef.current);
    projectRef.current = history.undo.pop();
    autosaveDirtyRef.current = true;
    history.group = null; setProject(projectRef.current); setHistoryTick(value => value + 1);
  };
  const redoProject = () => {
    const history = historyRef.current;
    if (!history.redo.length) return;
    history.undo.push(projectRef.current);
    projectRef.current = history.redo.pop();
    autosaveDirtyRef.current = true;
    history.group = null; setProject(projectRef.current); setHistoryTick(value => value + 1);
  };
  const persistProject = useCallback(async () => {
    try {
      const snapshot = projectRef.current;
      await saveProject(persistable(snapshot));
      if (projectRef.current === snapshot) autosaveDirtyRef.current = false;
      const all = await listProjects(); setSavedProjects(all); notify('Proyecto guardado en este dispositivo');
    } catch { notify('No se pudo guardar. Revisá el espacio disponible del navegador.'); }
  }, []);
  const addLayer = (type, extra = {}) => {
    const layer = newLayer(type, extra);
    updateProject(p => ({ ...p, layers: [...p.layers, layer] })); setSelectedId(layer.id); setMultiIds([layer.id]); setPlayTime(0);
  };
  const patchLayer = (key, value) => {
    if (key === 'animDuration') value = clamp(Number(value) || 0.05, 0.05, 120);
    if (key === 'animDelay') value = clamp(Number(value) || 0, 0, 120);
    updateProject(p => ({ ...p, layers: p.layers.map(layer => layer.id === selectedId ? { ...layer, [key]: value } : layer) }), `layer:${selectedId}:${key}`);
  };
  const loadAsset = file => {
    if (/\.(ai|pdf)$/i.test(file.name)) { importIllustrator(file); return; }
    const url = URL.createObjectURL(file);
    const video = file.type.startsWith('video/');
    const media = video ? document.createElement('video') : new Image();
    if (video) { media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'metadata'; }
    media.onload = media.onloadeddata = () => {
      const asset = { id: crypto.randomUUID(), name: file.name, kind: video ? 'video' : 'image', blob: file, url, element: media };
      updateProject(p => ({ ...p, assets: [...p.assets, asset] }));
    };
    media.onerror = () => { URL.revokeObjectURL(url); notify(`No se pudo abrir ${file.name}`); };
    media.src = url;
    if (video) media.load();
  };
  const addAssetLayer = asset => {
    const el = asset.element;
    const iw = el.videoWidth || el.naturalWidth || 500, ih = el.videoHeight || el.naturalHeight || 500;
    const ratio = Math.min(700 / iw, 700 / ih);
    addLayer('asset', { name: asset.name, w: iw * ratio, h: ih * ratio, asset });
  };
  const resetProject = () => {
    if (!window.confirm('¿Empezar un proyecto nuevo? Asegurate de guardar antes.')) return;
    project.assets.forEach(asset => { if (asset.url) URL.revokeObjectURL(asset.url); });
    const next = freshProject(); historyRef.current = { undo: [], redo: [], group: null }; projectRef.current = next; autosaveDirtyRef.current = false;
    setPlaying(false); setPreviewing(false); setScrubbing(false); setProject(next); setSelectedId(null); setPlayTime(0); setHistoryTick(value => value + 1); notify('Proyecto nuevo');
  };
  const openSavedProject = record => {
    project.assets.forEach(asset => { if (asset.url) URL.revokeObjectURL(asset.url); });
    const assets = (record.assets || []).map(asset => {
      const url = URL.createObjectURL(asset.blob);
      const media = asset.kind === 'video' ? document.createElement('video') : new Image();
      if (asset.kind === 'video') { media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'metadata'; }
      media.onload = media.onloadeddata = () => setProject(p => ({ ...p }));
      media.src = url;
      if (asset.kind === 'video') media.load();
      return { ...asset, url, element: media };
    });
    const byId = new Map(assets.map(asset => [asset.id, asset]));
    const layers = (record.layers || []).map(({ assetId, ...layer }) => ({ ...layer, asset: assetId ? byId.get(assetId) : null }));
    const next = { ...record, layers, assets, userGuides: record.userGuides || [] };
    historyRef.current = { undo: [], redo: [], group: null }; projectRef.current = next; autosaveDirtyRef.current = false;
    setProject(next); setProjectName(record.name); setSelectedId(null); setPlaying(false); setPreviewing(false); setScrubbing(false); setProjectDialog(false); setHistoryTick(value => value + 1);
    notify('Proyecto abierto');
  };
  const downloadProject = async () => {
    const data = persistable(project);
    data.assets = await Promise.all(data.assets.map(async asset => ({ ...asset, blob: await blobToDataUrl(asset.blob) })));
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${project.name || 'proyecto'}.somos.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importProject = async file => {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.layers) || !Array.isArray(data.assets)) throw new Error('invalid');
      const assets = data.assets.map(asset => {
        if (typeof asset.blob === 'string') asset.blob = dataUrlToBlob(asset.blob);
        asset.url = URL.createObjectURL(asset.blob);
        const media = asset.kind === 'video' ? document.createElement('video') : new Image();
        if (asset.kind === 'video') { media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'metadata'; }
        media.onload = media.onloadeddata = () => setProject(p => ({ ...p }));
        media.src = asset.url;
        if (asset.kind === 'video') media.load();
        asset.element = media;
        return asset;
      });
      const byId = new Map(assets.map(asset => [asset.id, asset]));
      data.layers = data.layers.map(({ assetId, ...layer }) => ({ ...layer, asset: assetId ? byId.get(assetId) : null }));
      data.assets = assets;
      updateProject({ ...data, userGuides: data.userGuides || [] }); setProjectName(data.name || 'Mi proyecto'); setSelectedId(null); setPlaying(false); setPreviewing(false); setScrubbing(false); notify('Proyecto importado');
    } catch { notify('El archivo no parece ser un proyecto válido'); }
  };
  const play = () => {
    setPreviewing(false);
    setScrubbing(false);
    if (playRef.current.playing) { setPlaying(false); setScrubbing(true); return; }
    if (playTimeRef.current >= projectRef.current.duration) setPlayTime(0);
    setPlaying(true);
  };
  const previewSelected = () => { if (!selected) return; setPlaying(false); setScrubbing(false); setPreviewTime(0); setPreviewing(true); setPreviewRun(n=>n+1); };
  const exportVideo = () => { setExportProgress(null); setExportDialog(true); };
  const runExport = async settings => {
    setPlaying(false); setPreviewing(false); setScrubbing(false); setExporting(true);
    exportController.current = new AbortController();
    try { await exportComposition(projectRef.current, settings, setExportProgress, exportController.current.signal); }
    catch (error) { setExportProgress({ value: 0, message: error.name === 'AbortError' ? 'Exportación cancelada.' : error.message }); }
    finally { setExporting(false); }
  };
  const importIllustrator = async file => {
    try {
      const { readIllustrator } = await import('./illustratorImport.js');
      const result = await readIllustrator(file, notify);
      const assets = [], layers = [];
      for (const item of result.items) {
        const url = URL.createObjectURL(item.blob), element = new Image(); element.src = url; await element.decode();
        const asset = { id: crypto.randomUUID(), name: item.name, kind: 'image', blob: item.blob, url, element };
        const ratio = Math.min(W / item.width, H / item.height);
        assets.push(asset); layers.push(newLayer('asset', { name: item.name, asset, w: item.width * ratio, h: item.height * ratio, anim: 'none' }));
      }
      updateProject(p => ({ ...p, assets: [...p.assets, ...assets], layers: [...p.layers, ...layers] }));
      if (layers.length) { setSelectedId(layers.at(-1).id); setMultiIds(layers.map(layer=>layer.id)); }
      notify(result.layered ? 'Illustrator importado por capas PDF (rasterizadas).' : 'El archivo no expone capas PDF: cada mesa se importó como una capa.');
    } catch (error) { notify(error.message); }
  };
  const selectLayer = (id, event) => {
    setSelectedId(id); setPreviewing(false); breakHistoryGroup();
    if (event?.ctrlKey || event?.metaKey) setMultiIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...new Set([...(ids.length ? ids : selectedId ? [selectedId] : []), id])]);
    else setMultiIds([id]);
  };
  const existingIds = multiIds.filter(id=>project.layers.some(layer=>layer.id===id));
  const effectiveIds = existingIds.length ? existingIds : selectedId ? [selectedId] : [];
  const alignLayers = mode => updateProject(p => ({ ...p, layers: p.layers.map(layer => {
    if (!effectiveIds.includes(layer.id) || layer.locked) return layer;
    const w = layer.w * layer.scale, h = layer.h * layer.scale;
    return { ...layer, ...(mode === 'left' ? { x: w/2 } : mode === 'right' ? { x: W-w/2 } : mode === 'center' ? { x: W/2 } : mode === 'top' ? { y: h/2 } : mode === 'bottom' ? { y: H-h/2 } : { y: H/2 }) };
  }) }));
  const distributeLayers = axis => updateProject(p => {
    const chosen = p.layers.filter(l => effectiveIds.includes(l.id) && !l.locked).sort((a,b) => a[axis]-b[axis]);
    if (chosen.length < 3) { notify('Seleccioná al menos tres capas desbloqueadas.'); return p; }
    const positions = new Map(chosen.map((l,i) => [l.id, chosen[0][axis]+(chosen.at(-1)[axis]-chosen[0][axis])*i/(chosen.length-1)]));
    return { ...p, layers: p.layers.map(l => positions.has(l.id) ? { ...l, [axis]: positions.get(l.id) } : l) };
  });
  const selectTexts = () => { const ids=project.layers.filter(l=>l.type==='text'&&!l.locked).map(l=>l.id); setMultiIds(ids); if(ids.length)setSelectedId(ids[0]); };
  const resizeTimeline = event => {
    event.preventDefault(); const start = event.clientY, height = timelineHeight;
    const move = e => setTimelineHeight(clamp(height+start-e.clientY,150,Math.max(150,window.innerHeight-300)));
    const end = () => { window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',end); };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',end,{once:true});
  };

  const onCanvasPointerDown = e => {
    if (e.button !== 0 && e.button !== 1) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * W;
    const y = (e.clientY - rect.top) / rect.height * H;
    const hit = [...project.layers].reverse().find(layer => layer.visible && Math.abs(x - layer.x) < layer.w * layer.scale / 2 && Math.abs(y - layer.y) < layer.h * layer.scale / 2);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (spaceDownRef.current || e.button === 1) { e.preventDefault(); dragRef.current = { pan: true, clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y }; return; }
    if (!hit) { dragRef.current = { pan: true, clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y }; return; }
    setSelectedId(hit.id); setMultiIds([hit.id]);
    if (hit.locked) { dragRef.current = { pan: true, clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y }; return; }
    dragRef.current = { id: hit.id, dx: x - hit.x, dy: y - hit.y };
  };
  const onCanvasPointerMove = e => {
    if (!dragRef.current) return;
    if (dragRef.current.pan) {
      setPan({ x: dragRef.current.panX + e.clientX - dragRef.current.clientX, y: dragRef.current.panY + e.clientY - dragRef.current.clientY });
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * W - dragRef.current.dx;
    const y = (e.clientY - rect.top) / rect.height * H - dragRef.current.dy;
    updateProject(p => ({ ...p, layers: p.layers.map(layer => layer.id === dragRef.current?.id ? { ...layer, x, y } : layer) }), `move:${dragRef.current.id}`);
  };

  const guidePositionAt = (axis, clientX, clientY) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(axis === 'h' ? (clientY - rect.top) / rect.height * H : (clientX - rect.left) / rect.width * W, 0, axis === 'h' ? H : W);
  };
  const startGuideGesture = (mode, axis, event, guide = null) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX, startY = event.clientY;
    guideDragRef.current = { mode, axis, guide, startX, startY, moved: false };
    if (mode === 'move') setGuideDraft({ ...guide });
    const move = e => {
      const drag = guideDragRef.current;
      if (!drag) return;
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 2) drag.moved = true;
      const position = guidePositionAt(axis, e.clientX, e.clientY);
      drag.position = position;
      if (mode === 'create') setGuideDraft({ axis, position });
      else {
        setGuideDraft({ ...guide, position });
        updateProject(p => ({ ...p, userGuides: (p.userGuides || []).map(item => item.id === guide.id ? { ...item, position } : item) }), `guide:${guide.id}`);
      }
    };
    const end = () => {
      const drag = guideDragRef.current;
      if (drag?.mode === 'create' && drag.moved) {
        updateProject(p => ({ ...p, userGuides: [...(p.userGuides || []), { id: crypto.randomUUID(), axis, position: drag.position }] }));
      }
      guideDragRef.current = null; setGuideDraft(null); breakHistoryGroup();
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  const beginRulerGuide = (axis, e) => startGuideGesture('create', axis, e);
  const beginGuideMove = (guide, e) => startGuideGesture('move', guide.axis, e, guide);
  const removeGuide = (id, e) => {
    e.stopPropagation();
    updateProject(p => ({ ...p, userGuides: (p.userGuides || []).filter(guide => guide.id !== id) }));
  };
  const scrubTimeline = (event, move = false) => {
    if (!move) { event.preventDefault(); scrubRef.current = true; setPlaying(false); setPreviewing(false); setScrubbing(true); }
    if (!scrubRef.current || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left + timelineRef.current.scrollLeft - 128;
    setPlayTime(clamp(x / timelineScale, 0, project.duration));
  };
  const beginTimelineScrub = event => {
    scrubTimeline(event);
    const move = e => scrubTimeline(e, true);
    const end = () => { scrubRef.current = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true });
  };
  const beginClipDrag = (event, layer, mode) => {
    if (layer.locked) return;
    event.preventDefault(); event.stopPropagation(); setSelectedId(layer.id); setPlaying(false); setPreviewing(false); setScrubbing(false);
    const startX = event.clientX, delay = layer.animDelay, duration = layer.animDuration, endTime = delay + duration;
    const move = e => {
      const shift = (e.clientX - startX) / timelineScale;
      if (mode === 'move') {
        updateProject(p => ({ ...p, layers: p.layers.map(item => item.id === layer.id ? { ...item, animDelay: clamp(delay + shift, 0, Math.max(0, p.duration - 0.05)) } : item) }), `clip:${layer.id}`);
      } else if (mode === 'start') {
        const nextStart = clamp(delay + shift, 0, Math.max(0, endTime - 0.05));
        updateProject(p => ({ ...p, layers: p.layers.map(item => item.id === layer.id ? { ...item, animDelay: nextStart, animDuration: endTime - nextStart } : item) }), `clip:${layer.id}`);
      } else {
        updateProject(p => ({ ...p, layers: p.layers.map(item => item.id === layer.id ? { ...item, animDuration: clamp(duration + shift, 0.05, Math.max(0.05, p.duration - delay)) } : item) }), `clip:${layer.id}`);
      }
    };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); breakHistoryGroup(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true });
  };

  const setDuration = value => updateProject(p => ({ ...p, duration: clamp(Number(value) || 15, 1, 120) }), 'project-duration');
  const saveAs = async () => { updateProject(p => ({ ...p, name: projectName || 'Mi proyecto' })); await new Promise(resolve => requestAnimationFrame(resolve)); await persistProject(); setProjectDialog(false); };
  const templates = {
    promo: [newLayer('shape', { name: 'Fondo rojo', w: W, h: H, color: '#e63631', anim: 'fade', animDuration: 0.6 }), newLayer('text', { name: 'Título principal', text: 'GRAN\nPROMOCIÓN', y: 340, w: 900, h: 400, fontSize: 125, animDelay: 0.2 }), newLayer('shape', { name: 'Bloque de imagen', y: 1020, w: 850, h: 650, color: '#191919', anim: 'slide', animDelay: 0.5 }), newLayer('text', { name: 'Texto inferior', text: '¡NO TE LO PIERDAS!', y: 1540, w: 900, h: 140, fontSize: 65, anim: 'ribbon', animDelay: 0.9 })],
    event: [newLayer('shape', { name: 'Fondo', w: W, h: H, color: '#191919', anim: 'fade' }), newLayer('shape', { name: 'Acento rojo', y: 670, w: 850, h: 12, anim: 'push', animDelay: 0.2 }), newLayer('text', { name: 'Mensaje', text: 'UN MENSAJE\nIMPORTANTE', y: 900, w: 900, h: 420, fontSize: 100, anim: 'slide', animDelay: 0.35 }), newLayer('text', { name: 'Firma', text: 'SOMOS ANIMACIÓN', y: 1450, w: 800, h: 100, fontSize: 42, color: '#e63631', anim: 'fade', animDelay: 0.8 })],
  };
  const applyTemplate = name => { updateProject(p => ({ ...p, layers: name === 'blank' ? [] : templates[name] })); setSelectedId(null); };

  return (
    <div className={`app-shell ${exporting ? 'is-exporting' : ''}`}>
      <header className="topbar">
        <div className="brand"><img className="brand-logo" src={`${import.meta.env.BASE_URL}somos-animacion-logo.png`} alt="Somos Animación" /></div>
        <div className="project-title"><span className="live-dot" />{project.name}<span className="pill">1080 × 1920</span></div>
        <div className="top-actions"><IconButton title="Deshacer (Ctrl+Z)" onClick={undoProject} disabled={!canUndo}>↶</IconButton><IconButton title="Rehacer (Ctrl+L)" onClick={redoProject} disabled={!canRedo}>↷</IconButton><button className="button ghost" onClick={resetProject}>Nuevo</button><button className="button ghost" onClick={() => { setProjectName(project.name); listProjects().then(setSavedProjects); setProjectDialog(true); }}>Proyectos</button><button className="button primary" onClick={exportVideo} disabled={exporting}>{exporting ? 'Exportando…' : '↗ Exportar video'}</button></div>
      </header>

      <main className={`workspace ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`} style={{ gridTemplateColumns: `${leftCollapsed ? 0 : 235}px minmax(300px,1fr) ${rightCollapsed ? 0 : 300}px` }}>
        <aside className="panel library-panel">
          <div className="panel-heading">RECURSOS</div>
          <div className="tabs"><button className={activeTab === 'assets' ? 'active' : ''} onClick={() => setActiveTab('assets')}>Biblioteca</button><button className={activeTab === 'templates' ? 'active' : ''} onClick={() => setActiveTab('templates')}>Plantillas</button></div>
          {activeTab === 'assets' ? <div className="panel-content">
            <button className="upload-zone" onClick={() => fileRef.current?.click()}><span className="upload-icon">＋</span><strong>Importar archivos</strong><small>PNG, JPG, SVG, WebM, MP4, Illustrator AI/PDF</small><small>Se guardan dentro del proyecto</small></button>
            <input ref={fileRef} type="file" accept="image/*,video/*,.svg,.ai,.pdf" multiple hidden onChange={e => { [...e.target.files].forEach(loadAsset); e.target.value = ''; }} />
            <div className="section-title">AÑADIR ELEMENTOS</div>
            <button className="resource-button" onClick={() => addLayer('text')}><b className="resource-icon">T</b><span><b>Texto</b><small>Título, bajada o llamada</small></span><span className="plus">＋</span></button>
            <button className="resource-button" onClick={() => addLayer('shape')}><b className="resource-icon">◧</b><span><b>Forma</b><small>Bloque de color</small></span><span className="plus">＋</span></button>
            <div className="section-title">ARCHIVOS DEL PROYECTO <span>{project.assets.length}</span></div>
            <div className="asset-grid">{project.assets.length ? project.assets.map(asset => <button className="asset-tile" key={asset.id} onDoubleClick={() => addAssetLayer(asset)} title="Doble clic para añadir al lienzo">{asset.kind === 'video' ? <video src={asset.url} muted preload="metadata"/> : <img src={asset.url} alt=""/>}<span>{asset.name}</span></button>) : <div className="empty-state">Tus archivos aparecerán acá.</div>}</div>
          </div> : <div className="panel-content"><p className="helper">Usá una estructura inicial y personalizala en el lienzo.</p><button className="template-card" onClick={() => applyTemplate('blank')}><span className="template-preview blank-preview" /><b>Espacio libre</b><small>Lienzo vacío</small></button><button className="template-card" onClick={() => applyTemplate('promo')}><span className="template-preview promo-preview" /><b>Promo destacada</b><small>Título + imagen + pie</small></button><button className="template-card" onClick={() => applyTemplate('event')}><span className="template-preview event-preview" /><b>Evento / comunicado</b><small>Mensaje central</small></button></div>}
        </aside>

        <section className="center-stage">
          <div className="workspace-switches"><button onClick={()=>setLeftCollapsed(v=>!v)} title="Mostrar u ocultar recursos">{leftCollapsed?'› Recursos':'‹ Ocultar recursos'}</button><button onClick={()=>setRightCollapsed(v=>!v)} title="Mostrar u ocultar inspector">{rightCollapsed?'Inspector ‹':'Ocultar inspector ›'}</button></div>
          <div className="stage-toolbar"><div><strong>COMPOSICIÓN</strong><span className="muted"> / 9:16 vertical</span></div><div className="stage-controls"><label>Zoom <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0.18, 0.24, 0.28, 0.35, 0.42, 0.5, 0.65, 0.8].map(n => <option key={n} value={n}>{Math.round(n * 100)}%</option>)}</select></label><IconButton title="Centrar lienzo" onClick={() => { setZoom(0.28); setPan({ x: 0, y: 0 }); }}>⌂</IconButton></div></div>
          <div className="canvas-area">
            <div className="ruler-top" onPointerDown={e => beginRulerGuide('h', e)} onPointerMove={e => { if (guideDragRef.current?.mode === 'create') { guideDragRef.current.position = guidePositionAt('h', e.clientX, e.clientY); setGuideDraft({ axis: 'h', position: guideDragRef.current.position }); } }}>
              {Array.from({ length: 12 }, (_, i) => i * 100).map(n => <span className="ruler-label" key={n} style={{ left: rulerTopOffset + n * zoom }}>{n}</span>)}
            </div>
            <div className="ruler-left" onPointerDown={e => beginRulerGuide('v', e)} onPointerMove={e => { if (guideDragRef.current?.mode === 'create') { guideDragRef.current.position = guidePositionAt('v', e.clientX, e.clientY); setGuideDraft({ axis: 'v', position: guideDragRef.current.position }); } }}>
              {Array.from({ length: 20 }, (_, i) => i * 100).map(n => <span className="ruler-label" key={n} style={{ top: rulerLeftOffset + n * zoom }}>{n}</span>)}
            </div>
            <div className="canvas-viewport" ref={viewportRef} onWheel={e => { e.preventDefault(); setZoom(z => clamp(z * (e.deltaY < 0 ? 1.08 : 0.92), 0.12, 1)); }} onPointerDown={e => { if (e.target === e.currentTarget && (e.button === 0 || e.button === 1)) { e.preventDefault(); dragRef.current = { pan: true, clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y }; e.currentTarget.setPointerCapture(e.pointerId); } }} onPointerMove={e => { if (dragRef.current?.pan) setPan({ x: dragRef.current.panX + e.clientX - dragRef.current.clientX, y: dragRef.current.panY + e.clientY - dragRef.current.clientY }); }} onPointerUp={() => { if (dragRef.current?.pan) dragRef.current = null; }}>
              <div className="stage-wrap" ref={stageRef} style={{ width: W * zoom, height: H * zoom, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                <canvas ref={canvasRef} width={W} height={H} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={() => { dragRef.current = null; breakHistoryGroup(); }} onPointerCancel={() => { dragRef.current = null; breakHistoryGroup(); }} aria-label="Lienzo de composición" />
                {project.guides && <div className="safe-guides"><span>ÁREA SEGURA</span></div>}
                {(project.userGuides || []).map(guide => <div key={guide.id} className={`user-guide ${guide.axis === 'h' ? 'horizontal' : 'vertical'}`} style={guide.axis === 'h' ? { top: `${guide.position / H * 100}%` } : { left: `${guide.position / W * 100}%` }} title="Arrastrá para mover · doble clic para eliminar" onPointerDown={e => beginGuideMove(guide, e)} onDoubleClick={e => removeGuide(guide.id, e)} />)}
                {guideDraft && <div className={`user-guide draft ${guideDraft.axis === 'h' ? 'horizontal' : 'vertical'}`} style={guideDraft.axis === 'h' ? { top: `${guideDraft.position / H * 100}%` } : { left: `${guideDraft.position / W * 100}%` }} />}
              </div>
              {project.layers.length === 0 && <div className="empty-hint">Importá un recurso o agregá texto para comenzar.</div>}
            </div>
            <div className="canvas-help">Arrastrá capas · Espacio + arrastrar o fondo vacío para mover · Rueda para zoom</div>
          </div>
          <div className="playback-bar"><button className="play-button" onClick={play}>{playing ? 'Ⅱ' : '▶'}</button><button className="small-control" onClick={() => { setPlaying(false); setPreviewing(false); setScrubbing(false); setPlayTime(0); }}>■</button><span className="time-readout">00:{playTime.toFixed(2).padStart(5, '0')}</span><input className="playback-scrubber" aria-label="Posición de reproducción" type="range" min="0" max={project.duration} step="0.01" value={Math.min(playTime, project.duration)} onChange={e => { setPlaying(false); setPreviewing(false); setScrubbing(true); setPlayTime(Number(e.target.value)); }} /><span className="transport-spacer" /><span className="muted">DURACIÓN</span><input type="number" min="1" max="120" value={project.duration} onChange={e => setDuration(e.target.value)} onBlur={breakHistoryGroup} /><span className="muted">s</span><span className="status">{previewing ? 'Vista previa de capa' : playing ? 'Reproduciendo · Espacio pausa' : 'Listo · Espacio reproduce'}</span></div>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-heading">CAPAS <div><IconButton title="Duplicar capa" disabled={!selected || selected.locked} onClick={() => { if (!selected || selected.locked) return; const copy = { ...selected, id: crypto.randomUUID(), name: `${selected.name} copia`, x: selected.x + 35, y: selected.y + 35 }; updateProject(p => ({ ...p, layers: [...p.layers, copy] })); setSelectedId(copy.id); setMultiIds([copy.id]); }}>▣</IconButton><IconButton title="Eliminar capa" disabled={!selected || selected.locked} onClick={() => { if (!selected || selected.locked) return; updateProject(p => ({ ...p, layers: p.layers.filter(layer => layer.id !== selected.id) })); setSelectedId(null); }}>×</IconButton></div></div>
          <div className="layers-list">{orderedLayers.length ? orderedLayers.map(layer => <button key={layer.id} draggable className={`layer-row ${effectiveIds.includes(layer.id) ? 'selected' : ''} ${layer.locked ? 'locked' : ''}`} onClick={e => selectLayer(layer.id,e)} onDragStart={e => e.dataTransfer.setData('text/plain', layer.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const fromId = e.dataTransfer.getData('text/plain'); updateProject(p => { const from = p.layers.findIndex(item => item.id === fromId); const to = p.layers.findIndex(item => item.id === layer.id); if (from < 0 || to < 0 || from === to) return p; const next = [...p.layers]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return { ...p, layers: next }; }); }}><span className="layer-thumb">{layer.type === 'text' ? 'T' : layer.type === 'shape' ? '◧' : '▶'}</span><span className="layer-info"><b>{layer.name}</b><small>{layer.type === 'text' ? 'Texto' : layer.type === 'shape' ? 'Forma' : 'Recurso'}</small></span><span role="button" tabIndex="0" className={`layer-lock ${layer.locked ? 'active' : ''}`} title={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'} onClick={e => { e.stopPropagation(); updateProject(p => ({ ...p, layers: p.layers.map(item => item.id === layer.id ? { ...item, locked: !item.locked } : item) })); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); updateProject(p => ({ ...p, layers: p.layers.map(item => item.id === layer.id ? { ...item, locked: !item.locked } : item) })); } }}>{<EditorIcon name={layer.locked ? 'lock' : 'unlock'}/>}</span><span className="eye" title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'} onClick={e => { e.stopPropagation(); updateProject(p => ({ ...p, layers: p.layers.map(item => item.id === layer.id ? { ...item, visible: !item.visible } : item) })); }}>{<EditorIcon name={layer.visible ? 'eye' : 'hidden'}/>}</span></button>) : <div className="empty-state">Todavía no hay capas.<br />Importá un recurso o creá texto.</div>}</div>
          <div className="inspector-tabs"><button className={inspectorTab==='properties'?'active':''} onClick={()=>setInspectorTab('properties')}>Capas</button><button className={inspectorTab==='text'?'active':''} onClick={()=>setInspectorTab('text')}>Texto</button><button className={inspectorTab==='curves'?'active':''} onClick={()=>setInspectorTab('curves')}>Curvas</button></div>
          {inspectorTab === 'properties' && <>
          <div className="panel-heading properties-heading">PROPIEDADES <span className="muted">{selected ? selected.name.toUpperCase().slice(0, 18) : 'SIN SELECCIÓN'}</span></div>
          {selected ? <div className={`properties ${selected.locked ? 'locked-properties' : ''}`}>
            <Field label="Nombre" value={selected.name} onChange={v => patchLayer('name', v)} />
            {selected.type === 'text' && <button className="button ghost" onClick={()=>setInspectorTab('text')}>Editar tipografía y texto →</button>}
            <Field label="Color" value={selected.color} onChange={v => patchLayer('color', v)} type="color" />
            <div className="field-grid">{[['X', 'x'], ['Y', 'y'], ['Ancho', 'w'], ['Alto', 'h']].map(([label, key]) => <Field key={key} label={label} value={Math.round(selected[key])} onChange={v => patchLayer(key, Number(v))} type="number" />)}<Field label="Escala %" value={Math.round(selected.scale * 100)} onChange={v => patchLayer('scale', Number(v) / 100)} type="number" /><Field label="Opacidad %" value={Math.round(selected.opacity * 100)} onChange={v => patchLayer('opacity', Number(v) / 100)} type="number" /><Field label="Rotación" value={selected.rotation} onChange={v => patchLayer('rotation', Number(v))} type="number" /></div>
            <label className="check-field"><input type="checkbox" checked={selected.visible} onChange={e => patchLayer('visible', e.target.checked)} /> Capa visible</label>
          </div> : <div className="properties empty-properties">Seleccioná una capa para editarla.</div>}
          <div className="panel-heading properties-heading">ANIMACIÓN DE ENTRADA <button className="preview-button" disabled={!selected || selected.locked} onClick={() => { setPlaying(false); setScrubbing(false); setPreviewTime(0); setPreviewing(true); setPreviewRun(n => n + 1); }}>▶ Vista previa</button></div>
          <div className="animation-presets">{LAYER_EFFECTS.map(anim => <button key={anim} className={selected?.anim === anim ? 'selected' : ''} disabled={!selected || selected.locked} onClick={() => { if (anim === 'none') { updateProject(p=>({...p,layers:p.layers.map(layer=>layer.id===selectedId?{...layer,anim:'none',textAnim:'none',motionBlur:false}:layer)})); setPreviewing(false); setScrubbing(false); setPlaying(false); } else { patchLayer('anim',anim); previewSelected(); } }}>{anim === 'none' ? 'Quitar efecto' : anim}</button>)}</div>
          {selected && !selected.locked && <div className="field-grid animation-fields"><Field label="Duración de entrada (s)" value={selected.animDuration} type="number" onChange={v => patchLayer('animDuration', Number(v))} /><Field label="Tiempo de entrada (s)" value={selected.animDelay} type="number" onChange={v => patchLayer('animDelay', Number(v))} /><Field label="Dirección" value={selected.animDirection} onChange={v => patchLayer('animDirection', v)} options={['left', 'right', 'top', 'bottom']} /><label className="check-field"><input type="checkbox" checked={selected.motionBlur} onChange={e => patchLayer('motionBlur', e.target.checked)} /> Desenfoque</label></div>}
          </>}
          {inspectorTab === 'text' && <TextPanel layer={selected} patch={patchLayer} align={alignLayers} distribute={distributeLayers} selectTexts={selectTexts} count={effectiveIds.length} preview={previewSelected}/>}
          {inspectorTab === 'curves' && <CurvePanel layer={selected} patch={patchLayer} onEnd={breakHistoryGroup}/>}
        </aside>
      </main>

      <div className="timeline-divider" role="separator" aria-label="Cambiar altura del timeline" aria-orientation="horizontal" onPointerDown={resizeTimeline}/><section className="timeline-panel" style={{ height: timelineHeight }}>
        <div className="timeline-head"><strong>LÍNEA DE TIEMPO</strong><span className="muted">Arrastrá el bloque para cambiar la entrada; mové sus bordes para ajustar duración.</span><label className="timeline-zoom">Zoom <input type="range" min="24" max="160" step="4" value={timelineScale} onChange={e => setTimelineScale(Number(e.target.value))} /></label><button className="button ghost small" onClick={() => updateProject(p => ({ ...p, guides: !p.guides }))}>{project.guides ? 'Ocultar área segura' : 'Mostrar área segura'}</button></div>
        <div className="timeline-scroll" ref={timelineRef}>
          <div className="timeline-inner" style={{ width: 128 + timelineWidth }}>
            <div className="timeline-ruler" style={{ width: 128 + timelineWidth }} onPointerDown={beginTimelineScrub}>
              <span className="timeline-ruler-name">TIEMPO</span>
              {timelineTicks.map(second => <span key={second} className="timeline-tick" style={{ left: 128 + second * timelineScale }}>{second}s</span>)}
              <i className="timeline-ruler-playhead" style={{ left: 128 + playTime * timelineScale }} />
            </div>
            <div className="timeline-tracks" style={{ width: 128 + timelineWidth }}>
              <i className="timeline-playhead" style={{ left: 128 + playTime * timelineScale }} />
              {project.layers.length ? [...project.layers].reverse().map(layer => <div className="timeline-row" key={layer.id} onClick={e => selectLayer(layer.id,e)}>
                <span className="timeline-name" title={layer.name}>{layer.locked ? '▣ ' : ''}{layer.name}</span>
                <div className="timeline-track" style={{ width: timelineWidth, backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent ${timelineScale - 1}px, #303030 ${timelineScale}px)` }} onPointerDown={beginTimelineScrub}>
                  <div className="timeline-clip" style={{ left: layer.animDelay * timelineScale, width: Math.max(6, Math.min(layer.animDuration, Math.max(0.05, project.duration - layer.animDelay)) * timelineScale) }} onPointerDown={e => beginClipDrag(e, layer, 'move')}>
                    <span className="clip-edge start" title="Ajustar entrada" onPointerDown={e => beginClipDrag(e, layer, 'start')} />
                    <span className="clip-title">{layer.anim.toUpperCase()}</span>
                    <span className="clip-edge end" title="Ajustar duración" onPointerDown={e => beginClipDrag(e, layer, 'end')} />
                  </div>
                </div>
              </div>) : <div className="timeline-empty">Las capas aparecerán acá cuando las agregues.</div>}
            </div>
          </div>
        </div>
      </section>
      {exportDialog && <ExportDialog onClose={()=>setExportDialog(false)} onExport={runExport} exporting={exporting} progress={exportProgress} onCancel={()=>exportController.current?.abort()}/>}
      <div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div>

      {projectDialog && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><div className="modal-card"><button className="modal-close" onClick={() => setProjectDialog(false)} aria-label="Cerrar">×</button><h2 id="project-dialog-title">Proyectos</h2><p>Los proyectos guardados permanecen en este navegador. También podés descargar un archivo para moverlos a otro dispositivo.</p><div className="project-actions"><input value={projectName} onChange={e => setProjectName(e.target.value)} aria-label="Nombre del proyecto" /><button className="button primary" onClick={saveAs}>Guardar proyecto</button><button className="button ghost" onClick={downloadProject}>Descargar .somos.json</button><button className="button ghost" onClick={() => projectFileRef.current?.click()}>Importar proyecto</button><input ref={projectFileRef} type="file" accept=".json,.somos.json,application/json" hidden onChange={e => { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; }} /></div><div className="saved-projects">{savedProjects.length ? savedProjects.map(record => <div className="saved-project" key={record.id}><button onClick={() => openSavedProject(record)}><b>{record.name}</b><small>{new Date(record.updatedAt).toLocaleString('es-AR')}</small></button><button className="delete-saved" onClick={async () => { await deleteProject(record.id); setSavedProjects(await listProjects()); }}>Eliminar</button></div>) : <div className="empty-state">Todavía no hay proyectos guardados.</div>}</div></div></div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', options, multiline = false }) {
  return <label className="field"><span>{label}</span>{options ? <select value={value} onChange={e => onChange(e.target.value)}>{options.map(option => typeof option === 'string' ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select> : multiline ? <textarea value={value} onChange={e => onChange(e.target.value)} rows="3" /> : <input type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={e => onChange(e.target.value)} />}</label>;
}
