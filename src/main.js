import { FloorPlanData } from './floorPlanData.js';
import { Editor2D } from './editor2d.js';
import { Renderer3D } from './renderer3d.js';
import { parseDXF } from './dxfImporter.js';
import { parsePDF, importPDFLines } from './pdfImporter.js';

// State
const floorPlan = new FloorPlanData();
let editor = null;
let renderer3d = null;
let currentView = '2d';

// DOM elements
const canvas = document.getElementById('editor-canvas');
const rendererContainer = document.getElementById('renderer-container');
const tab2d = document.getElementById('tab-2d');
const tab3d = document.getElementById('tab-3d');
const statusText = document.getElementById('status-text');
const cursorPos = document.getElementById('cursor-pos');

// Initialize 2D editor
editor = new Editor2D(canvas, floorPlan);
editor.onStatusUpdate = (text) => { statusText.textContent = text; };
editor.onCursorUpdate = (text) => { cursorPos.textContent = text; };

// Tool buttons
const toolButtons = {
  'btn-select': 'select',
  'btn-draw-wall': 'wall',
  'btn-add-door': 'door',
  'btn-add-window': 'window',
  'btn-delete': 'delete',
};

for (const [btnId, tool] of Object.entries(toolButtons)) {
  document.getElementById(btnId).addEventListener('click', () => {
    // Update active state
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(btnId).classList.add('active');
    editor.setTool(tool);
  });
}

// Escape to cancel drawing
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    editor.cancelDraw();
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-select').classList.add('active');
    editor.setTool('select');
  }
});

// View tabs
tab2d.addEventListener('click', () => switchView('2d'));
tab3d.addEventListener('click', () => switchView('3d'));

function switchView(view) {
  currentView = view;
  tab2d.classList.toggle('active', view === '2d');
  tab3d.classList.toggle('active', view === '3d');

  if (view === '2d') {
    canvas.style.display = 'block';
    rendererContainer.style.display = 'none';
    editor._resize();
    editor.render();
  } else {
    canvas.style.display = 'none';
    rendererContainer.style.display = 'block';
    if (!renderer3d) {
      renderer3d = new Renderer3D(rendererContainer, floorPlan);
    }
    renderer3d._resize();
    generateModel();
  }
}

// Settings inputs
document.getElementById('wall-height').addEventListener('change', (e) => {
  floorPlan.wallHeight = parseFloat(e.target.value);
});

document.getElementById('wall-thickness').addEventListener('change', (e) => {
  floorPlan.wallThickness = parseFloat(e.target.value);
});

document.getElementById('editor-scale').addEventListener('change', (e) => {
  editor.setScale(parseFloat(e.target.value));
});

document.getElementById('wall-color').addEventListener('input', (e) => {
  if (renderer3d) renderer3d.setWallColor(e.target.value);
});

document.getElementById('floor-color').addEventListener('input', (e) => {
  if (renderer3d) renderer3d.setFloorColor(e.target.value);
});

document.getElementById('show-dimensions').addEventListener('change', (e) => {
  if (renderer3d) {
    renderer3d.showDimensions = e.target.checked;
  }
});

document.getElementById('show-floor').addEventListener('change', (e) => {
  if (renderer3d) {
    renderer3d.showFloor = e.target.checked;
  }
});

document.getElementById('show-ceiling').addEventListener('change', (e) => {
  if (renderer3d) {
    renderer3d.showCeiling = e.target.checked;
  }
});

// Generate 3D button
document.getElementById('btn-generate-3d').addEventListener('click', () => {
  if (floorPlan.walls.length === 0) {
    statusText.textContent = 'No walls to render. Draw walls or load a floor plan first.';
    return;
  }
  switchView('3d');
});

function generateModel() {
  if (!renderer3d) return;
  renderer3d.showDimensions = document.getElementById('show-dimensions').checked;
  renderer3d.showFloor = document.getElementById('show-floor').checked;
  renderer3d.showCeiling = document.getElementById('show-ceiling').checked;
  renderer3d.buildModel();
  statusText.textContent = `3D model generated: ${floorPlan.walls.length} walls, ${floorPlan.doors.length} doors, ${floorPlan.windows.length} windows`;
}

// Clear button
document.getElementById('btn-clear').addEventListener('click', () => {
  floorPlan.clear();
  editor.render();
  if (renderer3d) {
    renderer3d.buildModel();
  }
  statusText.textContent = 'All cleared.';
});

// Load sample
document.getElementById('btn-load-sample').addEventListener('click', () => {
  floorPlan.loadSample();
  document.getElementById('wall-height').value = floorPlan.wallHeight;
  document.getElementById('wall-thickness').value = floorPlan.wallThickness;
  editor.render();
  statusText.textContent = 'Sample floor plan loaded. Click "Generate 3D Model" to view.';
});

// File upload
document.getElementById('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'dxf') {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = parseDXF(ev.target.result, floorPlan);
        editor.render();
        statusText.textContent = `DXF imported: ${result.wallCount} walls from ${result.entityCount} entities`;
      } catch (err) {
        statusText.textContent = 'Error: ' + err.message;
      }
    };
    reader.readAsText(file);
  } else if (ext === 'svg') {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        parseSVG(ev.target.result);
        editor.render();
        statusText.textContent = `SVG imported: ${floorPlan.walls.length} walls extracted`;
      } catch (err) {
        statusText.textContent = 'Error importing SVG: ' + err.message;
      }
    };
    reader.readAsText(file);
  } else if (ext === 'pdf') {
    statusText.textContent = 'Loading PDF...';
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const result = await parsePDF(ev.target.result, 1);
        // Store PDF data for page navigation
        window._pdfData = { buffer: ev.target.result, pageCount: result.pageCount, currentPage: 1 };

        // Try to import vector lines if found
        let vectorMsg = '';
        if (result.lines.length > 0) {
          const importResult = importPDFLines(result.lines, floorPlan, result.width, result.height);
          editor.render();
          vectorMsg = ` Extracted ${importResult.wallCount} walls from ${importResult.totalLines} vector lines.`;
        }

        // Also load rendered image as background for tracing
        loadBackgroundImage(result.dataUrl);

        let pageMsg = result.pageCount > 1 ? ` (Page 1 of ${result.pageCount})` : '';
        statusText.textContent = `PDF loaded${pageMsg}.${vectorMsg} Use Draw Wall tool to trace additional walls.`;

        // Show page navigation if multi-page
        if (result.pageCount > 1) {
          showPDFPageNav(result.pageCount, 1);
        }
      } catch (err) {
        statusText.textContent = 'Error loading PDF: ' + err.message;
        console.error('PDF import error:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
    // For image files, display as background in editor for tracing
    const reader = new FileReader();
    reader.onload = (ev) => {
      loadBackgroundImage(ev.target.result);
      statusText.textContent = 'Image loaded as background. Trace the walls using the Draw Wall tool.';
    };
    reader.readAsDataURL(file);
  }

  // Reset input so same file can be re-uploaded
  e.target.value = '';
});

/** Parse SVG to extract lines/paths as walls */
function parseSVG(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  floorPlan.clear();

  // Get SVG dimensions for scaling
  const svg = doc.querySelector('svg');
  const viewBox = svg?.getAttribute('viewBox')?.split(' ').map(Number);
  const svgW = viewBox ? viewBox[2] : parseFloat(svg?.getAttribute('width') || '500');
  const svgH = viewBox ? viewBox[3] : parseFloat(svg?.getAttribute('height') || '500');
  const scale = 20 / Math.max(svgW, svgH); // normalize to ~20m

  // Extract <line> elements
  const lines = doc.querySelectorAll('line');
  for (const line of lines) {
    const x1 = parseFloat(line.getAttribute('x1') || '0') * scale;
    const y1 = parseFloat(line.getAttribute('y1') || '0') * scale;
    const x2 = parseFloat(line.getAttribute('x2') || '0') * scale;
    const y2 = parseFloat(line.getAttribute('y2') || '0') * scale;
    floorPlan.addWall(x1, y1, x2, y2);
  }

  // Extract <rect> elements as 4 walls
  const rects = doc.querySelectorAll('rect');
  for (const rect of rects) {
    const x = parseFloat(rect.getAttribute('x') || '0') * scale;
    const y = parseFloat(rect.getAttribute('y') || '0') * scale;
    const w = parseFloat(rect.getAttribute('width') || '0') * scale;
    const h = parseFloat(rect.getAttribute('height') || '0') * scale;
    if (w > 0 && h > 0) {
      floorPlan.addWall(x, y, x + w, y);
      floorPlan.addWall(x + w, y, x + w, y + h);
      floorPlan.addWall(x + w, y + h, x, y + h);
      floorPlan.addWall(x, y + h, x, y);
    }
  }

  // Extract <polyline>/<polygon> elements
  const polylines = doc.querySelectorAll('polyline, polygon');
  for (const pl of polylines) {
    const pts = pl.getAttribute('points')?.trim().split(/[\s,]+/).map(Number);
    if (!pts || pts.length < 4) continue;
    for (let i = 0; i < pts.length - 3; i += 2) {
      floorPlan.addWall(pts[i] * scale, pts[i + 1] * scale, pts[i + 2] * scale, pts[i + 3] * scale);
    }
    // Close polygon
    if (pl.tagName === 'polygon' && pts.length >= 4) {
      floorPlan.addWall(
        pts[pts.length - 2] * scale, pts[pts.length - 1] * scale,
        pts[0] * scale, pts[1] * scale
      );
    }
  }

  // Extract simple <path> elements (only M/L/H/V commands)
  const paths = doc.querySelectorAll('path');
  for (const path of paths) {
    const d = path.getAttribute('d');
    if (!d) continue;
    const coords = parseSimplePath(d, scale);
    for (let i = 0; i < coords.length - 1; i++) {
      floorPlan.addWall(coords[i].x, coords[i].y, coords[i + 1].x, coords[i + 1].y);
    }
  }
}

function parseSimplePath(d, scale) {
  const coords = [];
  let cx = 0, cy = 0;
  const commands = d.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g) || [];

  for (const cmd of commands) {
    const type = cmd[0];
    const nums = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    switch (type) {
      case 'M': cx = nums[0]; cy = nums[1]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'm': cx += nums[0]; cy += nums[1]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'L': cx = nums[0]; cy = nums[1]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'l': cx += nums[0]; cy += nums[1]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'H': cx = nums[0]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'h': cx += nums[0]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'V': cy = nums[0]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'v': cy += nums[0]; coords.push({ x: cx * scale, y: cy * scale }); break;
      case 'Z': case 'z':
        if (coords.length > 0) coords.push({ x: coords[0].x, y: coords[0].y });
        break;
    }
  }
  return coords;
}

/** Show PDF page navigation controls */
function showPDFPageNav(pageCount, currentPage) {
  // Remove existing nav if any
  const existing = document.getElementById('pdf-page-nav');
  if (existing) existing.remove();

  const nav = document.createElement('div');
  nav.id = 'pdf-page-nav';
  nav.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;margin-top:8px;';

  nav.innerHTML = `
    <button id="pdf-prev" style="padding:4px 8px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;cursor:pointer;">&larr; Prev</button>
    <span style="color:#c9d1d9;font-size:13px;">Page <span id="pdf-current">${currentPage}</span> of ${pageCount}</span>
    <button id="pdf-next" style="padding:4px 8px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;cursor:pointer;">Next &rarr;</button>
  `;

  // Insert after upload area
  const uploadSection = document.getElementById('upload-area');
  uploadSection.parentElement.appendChild(nav);

  document.getElementById('pdf-prev').addEventListener('click', () => navigatePDFPage(-1));
  document.getElementById('pdf-next').addEventListener('click', () => navigatePDFPage(1));
}

async function navigatePDFPage(delta) {
  const pdfData = window._pdfData;
  if (!pdfData) return;

  const newPage = pdfData.currentPage + delta;
  if (newPage < 1 || newPage > pdfData.pageCount) return;

  statusText.textContent = `Loading page ${newPage}...`;
  try {
    const result = await parsePDF(pdfData.buffer, newPage);
    pdfData.currentPage = newPage;
    document.getElementById('pdf-current').textContent = newPage;

    // Try vector extraction
    if (result.lines.length > 0) {
      const importResult = importPDFLines(result.lines, floorPlan, result.width, result.height);
      editor.render();
      statusText.textContent = `Page ${newPage}: Extracted ${importResult.wallCount} walls. Trace additional walls as needed.`;
    } else {
      floorPlan.clear();
      editor.render();
      statusText.textContent = `Page ${newPage} loaded. Use Draw Wall tool to trace walls.`;
    }

    loadBackgroundImage(result.dataUrl);
  } catch (err) {
    statusText.textContent = 'Error loading page: ' + err.message;
  }
}

/** Load image as background for tracing */
function loadBackgroundImage(dataUrl) {
  const img = new Image();
  img.onload = () => {
    // Store reference for the editor to use as background
    const originalRender = editor.render.bind(editor);
    editor.render = function () {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);

      // Draw background image with some transparency
      ctx.globalAlpha = 0.4;
      const imgScale = Math.min((w - 80) / img.width, (h - 80) / img.height);
      const imgW = img.width * imgScale;
      const imgH = img.height * imgScale;
      ctx.drawImage(img, this.offsetX, this.offsetY, imgW, imgH);
      ctx.globalAlpha = 1;

      // Draw grid and elements on top
      this._drawGrid();
      for (const wall of this.floorPlan.walls) this._drawWall(wall);
      for (const door of this.floorPlan.doors) this._drawDoor(door);
      for (const win of this.floorPlan.windows) this._drawWindow(win);

      // Drawing preview
      if (this.drawing && this.drawStart) {
        const snapped = this._snap(this.mousePos);
        const s1 = this._worldToScreen(this.drawStart.x, this.drawStart.y);
        const s2 = this._worldToScreen(snapped.x, snapped.y);

        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const dx = snapped.x - this.drawStart.x;
        const dy = snapped.y - this.drawStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.1) {
          const midX = (s1.x + s2.x) / 2;
          const midY = (s1.y + s2.y) / 2;
          ctx.fillStyle = '#e94560';
          ctx.font = '12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${len.toFixed(2)}m`, midX, midY - 10);
        }
      }

      if (this.drawing || this.tool === 'wall') {
        const snapped = this._snap(this.mousePos);
        if (snapped.snapped) {
          const s = this._worldToScreen(snapped.x, snapped.y);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
          ctx.strokeStyle = '#4CAF50';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    };
    editor.render();
  };
  img.src = dataUrl;
}
