import { useEffect, useState } from 'react';
import { canExportVideo } from './videoExport.js';
export default function ExportDialog({ onClose, onExport, exporting, progress, onCancel }) {
  const [settings, setSettings] = useState({ format: 'h264', fps: 30, width: 1080, background: '#ffffff' });
  const [available, setAvailable] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setAvailable(null); setError('');
    canExportVideo(settings).then(supported => {
      if (!active) return;
      setAvailable(supported);
      if (!supported) setError('H.264 no está disponible con esta configuración. Probá Chrome o Edge actualizado, o una resolución menor. Abrí la app por HTTPS o localhost.');
    }).catch(() => { if (active) { setAvailable(false); setError('No se pudo inicializar el codificador H.264 del navegador.'); } });
    return () => { active = false; };
  }, [settings.width, settings.fps]);
  return <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title"><div className="modal-card">
    <button className="modal-close" disabled={exporting} onClick={onClose} aria-label="Cerrar">×</button>
    <h2 id="export-title">Exportar video</h2>
    <p>MP4 real con video H.264. Se procesa en tu dispositivo, sin subir recursos a un servidor.</p>
    <label className="field">Formato<select disabled value="h264"><option value="h264">MP4 · H.264</option></select></label>
    <div className="field-grid">
      <label className="field">Fotogramas por segundo<select disabled={exporting} value={settings.fps} onChange={e => setSettings(s => ({ ...s, fps: Number(e.target.value) }))}>{[24,25,30,50,60].map(fps => <option key={fps}>{fps}</option>)}</select></label>
      <label className="field">Resolución<select disabled={exporting} value={settings.width} onChange={e => setSettings(s => ({ ...s, width: Number(e.target.value) }))}><option value="1080">1080 × 1920</option><option value="720">720 × 1280</option><option value="540">540 × 960</option></select></label>
    </div>
    <label className="field">Color de fondo<input type="color" value={settings.background} disabled={exporting} onChange={e => setSettings(s => ({ ...s, background: e.target.value }))}/></label>
    <p className="export-note">H.264 no conserva transparencia. QuickTime y HEVC no están disponibles en esta versión. La exportación no incluye audio. Mantené esta pestaña abierta; proyectos largos consumen más memoria. Si falla, reducí la resolución o la duración.</p>
    {available === null && <p role="status">Comprobando compatibilidad H.264…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {progress && <><progress max="100" value={progress.value}/><p role="status">{progress.message}</p></>}
    <button className="button primary" disabled={!available || exporting} onClick={() => onExport(settings)}>Exportar MP4</button>
    {exporting && <button className="button ghost" onClick={onCancel}>Cancelar exportación</button>}
  </div></div>;
}
