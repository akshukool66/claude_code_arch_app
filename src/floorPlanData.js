/**
 * Floor plan data model shared between the 2D editor and 3D renderer.
 * All coordinates are in meters.
 */

export class FloorPlanData {
  constructor() {
    this.walls = [];       // { id, x1, y1, x2, y2, height, thickness }
    this.doors = [];       // { id, wallId, position (0-1 along wall), width, height }
    this.windows = [];     // { id, wallId, position (0-1 along wall), width, height, sillHeight }
    this.rooms = [];       // { id, name, points: [{x, y}], color }
    this.nextId = 1;
    this.wallHeight = 2.8;
    this.wallThickness = 0.15;
  }

  addWall(x1, y1, x2, y2) {
    const wall = {
      id: this.nextId++,
      x1, y1, x2, y2,
      height: this.wallHeight,
      thickness: this.wallThickness,
    };
    this.walls.push(wall);
    return wall;
  }

  addDoor(wallId, position = 0.5, width = 0.9, height = 2.1) {
    const door = { id: this.nextId++, wallId, position, width, height };
    this.doors.push(door);
    return door;
  }

  addWindow(wallId, position = 0.5, width = 1.2, height = 1.2, sillHeight = 0.9) {
    const win = { id: this.nextId++, wallId, position, width, height, sillHeight };
    this.windows.push(win);
    return win;
  }

  getWallById(id) {
    return this.walls.find(w => w.id === id);
  }

  getWallLength(wall) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getWallAngle(wall) {
    return Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  }

  removeById(id) {
    this.walls = this.walls.filter(w => w.id !== id);
    this.doors = this.doors.filter(d => d.id !== id && d.wallId !== id);
    this.windows = this.windows.filter(w => w.id !== id && w.wallId !== id);
    this.rooms = this.rooms.filter(r => r.id !== id);
  }

  clear() {
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.rooms = [];
    this.nextId = 1;
  }

  /** Find the nearest wall to a point (in meters), returns { wall, distance, t } */
  findNearestWall(px, py, maxDist = 0.5) {
    let best = null;
    for (const wall of this.walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      let t = ((px - wall.x1) * dx + (py - wall.y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = wall.x1 + t * dx;
      const cy = wall.y1 + t * dy;
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (dist < maxDist && (!best || dist < best.distance)) {
        best = { wall, distance: dist, t };
      }
    }
    return best;
  }

  /** Create a sample floor plan */
  loadSample() {
    this.clear();

    // Outer walls of an apartment (~10m x 8m)
    this.addWall(0, 0, 10, 0);    // bottom
    this.addWall(10, 0, 10, 8);   // right
    this.addWall(10, 8, 0, 8);    // top
    this.addWall(0, 8, 0, 0);     // left

    // Interior walls
    this.addWall(5, 0, 5, 5);     // vertical divider (lower)
    this.addWall(5, 5, 10, 5);    // horizontal divider (right)
    this.addWall(0, 5, 3, 5);     // horizontal divider (left part)
    this.addWall(3, 5, 3, 8);     // kitchen/bathroom divider

    // Doors
    this.addDoor(5, 0.6, 0.9, 2.1);   // door in vertical wall
    this.addDoor(6, 0.3, 0.9, 2.1);   // door in right horizontal wall
    this.addDoor(7, 0.5, 0.8, 2.1);   // door in left horizontal wall
    this.addDoor(1, 0.3, 0.9, 2.1);   // front door

    // Windows
    this.addWindow(1, 0.7, 1.5, 1.2, 0.9);   // bottom wall window
    this.addWindow(2, 0.5, 1.5, 1.2, 0.9);   // right wall window
    this.addWindow(3, 0.5, 2.0, 1.2, 0.9);   // top wall window
    this.addWindow(4, 0.5, 1.2, 1.2, 0.9);   // left wall window
  }

  toJSON() {
    return {
      walls: this.walls,
      doors: this.doors,
      windows: this.windows,
      rooms: this.rooms,
      wallHeight: this.wallHeight,
      wallThickness: this.wallThickness,
    };
  }

  fromJSON(data) {
    this.walls = data.walls || [];
    this.doors = data.doors || [];
    this.windows = data.windows || [];
    this.rooms = data.rooms || [];
    this.wallHeight = data.wallHeight || 2.8;
    this.wallThickness = data.wallThickness || 0.15;
    this.nextId = Math.max(
      0,
      ...this.walls.map(w => w.id),
      ...this.doors.map(d => d.id),
      ...this.windows.map(w => w.id),
      ...this.rooms.map(r => r.id),
    ) + 1;
  }
}
