# Somos Animación — Editor

Aplicación web progresiva para crear y animar carteleras verticales de 1080 × 1920, construida con React y Vite.

## Requisitos

- Node.js 22.13+ o 24+.
- npm.

## Desarrollo

```sh
npm install
npm run dev
```

Vite mostrará una dirección local para abrir el editor. Para compilar y revisar la versión de producción:

```sh
npm run build
npm run preview
```

Para servir localmente la compilación estática:

```sh
npm run build
npm start
```

La vista previa escucha en `127.0.0.1:4173`. La aplicación publicada no necesita Node ni FFmpeg: exporta MP4 H.264 con WebCodecs y Mediabunny en el navegador. Node se usa solamente para desarrollar y compilar.

## Publicar en GitHub Pages

1. Subir el código y `package-lock.json` al repositorio, en la rama `main`. No subir `node_modules` ni `dist`.
2. En el repositorio, abrir Settings → Pages → Build and deployment y elegir **GitHub Actions**.
3. Ejecutar el workflow **Publicar GitHub Pages** desde Actions, o subir un cambio a `main`.
4. Al terminar, el job de publicación muestra la URL del sitio.

El workflow `.github/workflows/pages.yml` compila y publica `dist`. Las rutas relativas soportan tanto `usuario.github.io/repositorio/` como la raíz de un dominio. No se configuró un repositorio ni se publicó el sitio desde este entorno.

La privacidad del repositorio no protege automáticamente la web publicada. No incluir claves ni archivos confidenciales en el código o en `public`. El editor no incorpora autenticación ni sincronización: los proyectos permanecen en IndexedDB de cada navegador. Cambiar de dominio cambia el almacenamiento visible; descargar los proyectos `.somos.json` antes de cambiar de dirección.

### Exportación en el navegador

- MP4 es el contenedor; H.264/AVC es el codec de video utilizado.
- Render determinista por fotogramas, FPS de 24/25/30/50/60 y resoluciones 1080×1920, 720×1280 o 540×960.
- Requiere HTTPS (GitHub Pages lo ofrece) o localhost, WebCodecs y un codificador H.264 disponible. El diálogo comprueba compatibilidad para la resolución y FPS elegidos. Si no hay soporte, no descarga otro formato renombrado.
- Chrome o Edge actuales son la primera opción. La compatibilidad y el rendimiento dependen del navegador, sistema operativo y equipo.
- El archivo final se mantiene en memoria hasta descargarlo. Para proyectos pesados, reducir duración/resolución; no existe un límite universal garantizado. Se puede cancelar el render entre fotogramas.
- Sin mezcla de audio, HEVC ni QuickTime/ProRes en esta versión estática. MP4 H.264 se exporta con fondo opaco configurable.
- El importador PDF/AI y el codificador se descargan bajo demanda. Para usarlos offline, primero deben haberse cargado online. Las fuentes externas también requieren conexión o caché previa.

El servidor anterior queda conservado en `server/` y puede ejecutarse con `npm run start:legacy-server`, pero el editor actual no lo utiliza.

## Funciones

- Capas de texto, formas, imágenes y videos, con posición, tamaño, escala, rotación, opacidad y orden.
- Plantillas de promoción y comunicado.
- Presets de entrada: pop, push, slide, ribbon, fade, zoom, bounce, elastic, scale, rotate, flip y blur. “Quitar efecto” elimina las animaciones de capa y texto.
- Pestaña Texto: fuente, peso, tamaño, interlineado, tracking, alineación y distribución de centros entre al menos tres capas seleccionadas con Ctrl/Cmd + clic.
- Animaciones de texto: slide, fade, pop, write, smooth, ease fade separately, together y position.
- Pestaña Curvas con dos controles Bézier, presets de aceleración y gráfico de velocidad normalizada.
- Reglas vertical y horizontal con guías arrastrables; doble clic sobre una guía para eliminarla.
- Timeline con scrubbing, zoom y clips que se pueden mover o redimensionar para ajustar entrada y duración.
- Bloqueo de capas, deshacer con `Ctrl+Z` y rehacer con `Ctrl+L` (también `Ctrl+Y`). La barra espaciadora reproduce y pausa.
- Guardado local en IndexedDB con recursos multimedia incluidos.
- Importación y descarga de proyectos portables `.somos.json`.
- Exportación por fotogramas a MP4 H.264 desde el navegador, sin MediaRecorder ni servidor de codificación; FPS de 24, 25, 30, 50 o 60 y tres resoluciones verticales.
- Importación `.ai`/PDF compatible con PDF. Si hay grupos de contenido opcional (OCG), cada grupo se convierte en una capa rasterizada independiente; de lo contrario se importa una capa por mesa/página. AI privado de Illustrator no es interpretable directamente y debe guardarse con compatibilidad PDF o exportarse como SVG. Esta función no equivale al motor nativo de Illustrator/After Effects ni conserva edición de trazados.
- Paneles laterales plegables y altura del timeline ajustable arrastrando su borde superior.
- Instalación como aplicación y caché offline del shell PWA. Hay que abrirla en línea una vez para preparar la caché.

## Alcance

El almacenamiento local vive en el perfil de navegador y dispositivo. No hay cuentas ni sincronización. Aún no incluye edición libre de keyframes, mezcla de audio ni reconstrucción editable de documentos AI privados. Los presets de movimiento y texto comparten el inicio y la duración de entrada de cada capa.

## Verificación

`npm run build` genera la versión estática. El script histórico `npm run verify:editor` corresponde al exportador de servidor y no valida esta nueva exportación; no debe usarse como comprobación de compatibilidad con Pages. La compilación no reemplaza una prueba de descarga y reproducción en el navegador de destino.
