/**
 * 2D floor plan editor with wall drawing, door/window placement, and dimension display.
 */
export class Editor2D {
  constructor(canvas, floorPlan) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.floorPlan = floorPlan;
    this.scale = 50; // pixels per meter
    this.offsetX = 40;
    this.offsetY = 40;

    // Tool state
    this.tool = 'select'; // 'select' | 'wall' | 'door' | 'window' | 'delete'
    this.drawing = false;
    this.drawStart = null;
    this.mousePos = { x: 0, y: 0 };
    this.snapDistance = 0.3; // meters
    this.selectedId = null;
    this.hoveredWall = null;
    this.gridSize = 0.5; // meters

    this.onStatusUpdate = null;
    this.onCursorUpdate = null;

    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  setTool(tool) {
    this.tool = tool;
    this.drawing = false;
    this.drawStart = null;
    this.selectedId = null;
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    this.render();
  }

  setScale(scale) {
    this.scale = scale;
    this.render();
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height - 70; // account for tabs + status bar
    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
  }

  // Convert screen coords to world coords (meters)
  _screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  // Convert world coords to screen coords
  _worldToScreen(wx, wy) {
    return {
      x: wx * this.scale + this.offsetX,
      y: wy * this.scale + this.offsetY,
    };
  }

  _snap(pos) {
    // Snap to existing wall endpoints
    for (const wall of this.floorPlan.walls) {
      for (const pt of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
        const dist = Math.sqrt((pos.x - pt.x) ** 2 + (pos.y - pt.y) ** 2);
        if (dist < this.snapDistance) {
          return { x: pt.x, y: pt.y, snapped: true };
        }
      }
    }
    // Snap to grid
    return {
      x: Math.round(pos.x / this.gridSize) * this.gridSize,
      y: Math.round(pos.y / this.gridSize) * this.gridSize,
      snapped: false,
    };
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (this.tool === 'wall') {
      if (!this.drawing) {
        this.drawing = true;
        this.drawStart = this._snap(world);
        this._setStatus('Click to place wall endpoint');
      } else {
        const end = this._snap(world);
        const dx = end.x - this.drawStart.x;
        const dy = end.y - this.drawStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.1) {
          this.floorPlan.addWall(this.drawStart.x, this.drawStart.y, end.x, end.y);
          // Continue drawing from this point
          this.drawStart = end;
          this._setStatus(`Wall added (${len.toFixed(2)}m). Click next point or press Esc.`);
        }
      }
    } else if (this.tool === 'door' || this.tool === 'window') {
      const hit = this.floorPlan.findNearestWall(world.x, world.y, 1);
      if (hit) {
        if (this.tool === 'door') {
          this.floorPlan.addDoor(hit.wall.id, hit.t);
          this._setStatus('Door added');
        } else {
          this.floorPlan.addWindow(hit.wall.id, hit.t);
          this._setStatus('Window added');
        }
      } else {
        this._setStatus('Click on a wall to place ' + this.tool);
      }
    } else if (this.tool === 'select') {
      this.selectedId = null;
      // Check walls
      const hit = this.floorPlan.findNearestWall(world.x, world.y, 0.5);
      if (hit) {
        this.selectedId = hit.wall.id;
        const len = this.floorPlan.getWallLength(hit.wall);
        this._setStatus(`Selected wall #${hit.wall.id} (${len.toFixed(2)}m)`);
      }
    } else if (this.tool === 'delete') {
      const hit = this.floorPlan.findNearestWall(world.x, world.y, 0.5);
      if (hit) {
        this.floorPlan.removeById(hit.wall.id);
        this._setStatus('Wall deleted');
      }
    }

    this.render();
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    this.mousePos = world;

    if (this.onCursorUpdate) {
      this.onCursorUpdate(`${world.x.toFixed(2)}m, ${world.y.toFixed(2)}m`);
    }

    // Highlight nearest wall
    this.hoveredWall = null;
    if (this.tool === 'door' || this.tool === 'window' || this.tool === 'delete') {
      const hit = this.floorPlan.findNearestWall(world.x, world.y, 1);
      if (hit) this.hoveredWall = hit.wall.id;
    }

    this.render();
  }

  _onMouseUp() {
    // pan support could go here
  }

  _onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.scale *= zoomFactor;
    this.scale = Math.max(10, Math.min(200, this.scale));
    this.render();
  }

  _setStatus(text) {
    if (this.onStatusUpdate) this.onStatusUpdate(text);
  }

  cancelDraw() {
    this.drawing = false;
    this.drawStart = null;
    this._setStatus('Drawing cancelled');
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Grid
    this._drawGrid();

    // Walls
    for (const wall of this.floorPlan.walls) {
      this._drawWall(wall);
    }

    // Doors
    for (const door of this.floorPlan.doors) {
      this._drawDoor(door);
    }

    // Windows
    for (const win of this.floorPlan.windows) {
      this._drawWindow(win);
    }

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

      // Show length
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

    // Snap indicator
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
  }

  _drawGrid() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.strokeStyle = '#1a2233';
    ctx.lineWidth = 0.5;

    // Vertical lines
    const startX = Math.floor(-this.offsetX / this.scale / this.gridSize) * this.gridSize;
    const endX = Math.ceil((w - this.offsetX) / this.scale / this.gridSize) * this.gridSize;
    for (let x = startX; x <= endX; x += this.gridSize) {
      const sx = this._worldToScreen(x, 0).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }

    // Horizontal lines
    const startY = Math.floor(-this.offsetY / this.scale / this.gridSize) * this.gridSize;
    const endY = Math.ceil((h - this.offsetY) / this.scale / this.gridSize) * this.gridSize;
    for (let y = startY; y <= endY; y += this.gridSize) {
      const sy = this._worldToScreen(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 1;
    const origin = this._worldToScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, h);
    ctx.moveTo(0, origin.y);
    ctx.lineTo(w, origin.y);
    ctx.stroke();
  }

  _drawWall(wall) {
    const ctx = this.ctx;
    const s1 = this._worldToScreen(wall.x1, wall.y1);
    const s2 = this._worldToScreen(wall.x2, wall.y2);

    const isSelected = wall.id === this.selectedId;
    const isHovered = wall.id === this.hoveredWall;

    // Wall body (thick line)
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.strokeStyle = isSelected ? '#e94560' : isHovered ? '#ff7b94' : '#4a9eff';
    ctx.lineWidth = Math.max(2, wall.thickness * this.scale);
    ctx.lineCap = 'round';
    ctx.stroke();

    // Endpoints
    for (const pt of [s1, s2]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#4a9eff';
      ctx.fill();
    }

    // Dimension label
    const len = this.floorPlan.getWallLength(wall);
    const midX = (s1.x + s2.x) / 2;
    const midY = (s1.y + s2.y) / 2;
    const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);

    ctx.save();
    ctx.translate(midX, midY);
    let labelAngle = angle;
    if (labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2) {
      labelAngle += Math.PI;
    }
    ctx.rotate(labelAngle);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${len.toFixed(2)}m`, 0, -8);
    ctx.restore();
  }

  _drawDoor(door) {
    const wall = this.floorPlan.getWallById(door.wallId);
    if (!wall) return;

    const ctx = this.ctx;
    const angle = this.floorPlan.getWallAngle(wall);
    const wx = wall.x1 + (wall.x2 - wall.x1) * door.position;
    const wy = wall.y1 + (wall.y2 - wall.y1) * door.position;
    const s = this._worldToScreen(wx, wy);

    const doorWidthPx = door.width * this.scale;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(angle);

    // Gap in wall
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(-doorWidthPx / 2, -4, doorWidthPx, 8);

    // Door swing arc
    ctx.beginPath();
    ctx.arc(-doorWidthPx / 2, 0, doorWidthPx, -Math.PI / 2, 0);
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Door leaf
    ctx.beginPath();
    ctx.moveTo(-doorWidthPx / 2, 0);
    ctx.lineTo(-doorWidthPx / 2, -doorWidthPx);
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  _drawWindow(win) {
    const wall = this.floorPlan.getWallById(win.wallId);
    if (!wall) return;

    const ctx = this.ctx;
    const angle = this.floorPlan.getWallAngle(wall);
    const wx = wall.x1 + (wall.x2 - wall.x1) * win.position;
    const wy = wall.y1 + (wall.y2 - wall.y1) * win.position;
    const s = this._worldToScreen(wx, wy);

    const winWidthPx = win.width * this.scale;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(angle);

    // Window representation (double line)
    ctx.beginPath();
    ctx.moveTo(-winWidthPx / 2, -3);
    ctx.lineTo(winWidthPx / 2, -3);
    ctx.moveTo(-winWidthPx / 2, 3);
    ctx.lineTo(winWidthPx / 2, 3);
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Window panes
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 3);
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }
}
