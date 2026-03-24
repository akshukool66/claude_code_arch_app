import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Three.js 3D renderer that builds a 3D model from FloorPlanData.
 */
export class Renderer3D {
  constructor(container, floorPlan) {
    this.container = container;
    this.floorPlan = floorPlan;

    this.wallColor = '#e8e0d4';
    this.floorColor = '#c4a882';
    this.showDimensions = true;
    this.showFloor = true;
    this.showCeiling = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.labelRenderer = null;
    this.controls = null;
    this.animationId = null;
    this.modelGroup = null;

    this._init();
  }

  _init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(15, 15, 15);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // CSS2D Label Renderer
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 30, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-10, 15, -10);
    this.scene.add(fillLight);

    // Ground plane (large, subtle)
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Model group
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._animate();
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  _animate() {
    this.animationId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  /** Build the 3D model from current floor plan data */
  buildModel() {
    // Clear previous model
    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0];
      this.modelGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    // Remove old labels
    const oldLabels = this.scene.children.filter(c => c.isCSS2DObject || c.userData.isLabel);
    oldLabels.forEach(l => this.scene.remove(l));

    const fp = this.floorPlan;

    // Compute center for camera target
    let cx = 0, cy = 0, count = 0;
    for (const wall of fp.walls) {
      cx += (wall.x1 + wall.x2) / 2;
      cy += (wall.y1 + wall.y2) / 2;
      count++;
    }
    if (count > 0) {
      cx /= count;
      cy /= count;
    }

    // Build walls
    for (const wall of fp.walls) {
      this._buildWall(wall, fp);
    }

    // Build doors
    for (const door of fp.doors) {
      this._buildDoor(door, fp);
    }

    // Build windows
    for (const win of fp.windows) {
      this._buildWindow(win, fp);
    }

    // Build floor
    if (this.showFloor && fp.walls.length > 0) {
      this._buildFloor(fp);
    }

    // Build ceiling
    if (this.showCeiling && fp.walls.length > 0) {
      this._buildCeiling(fp);
    }

    // Center camera
    this.controls.target.set(cx, fp.wallHeight / 2, cy);
    const maxDim = this._getMaxDimension(fp);
    this.camera.position.set(cx + maxDim, maxDim * 0.8, cy + maxDim);
    this.controls.update();
  }

  _getMaxDimension(fp) {
    let maxX = 0, maxY = 0;
    for (const wall of fp.walls) {
      maxX = Math.max(maxX, wall.x1, wall.x2);
      maxY = Math.max(maxY, wall.y1, wall.y2);
    }
    return Math.max(maxX, maxY, 5);
  }

  _buildWall(wall, fp) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const height = wall.height || fp.wallHeight;
    const thickness = wall.thickness || fp.wallThickness;

    // Get openings (doors/windows) on this wall
    const openings = this._getOpeningsForWall(wall, fp);

    if (openings.length === 0) {
      // Simple wall with no openings
      const geometry = new THREE.BoxGeometry(length, height, thickness);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.wallColor),
        roughness: 0.8,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const mx = (wall.x1 + wall.x2) / 2;
      const my = (wall.y1 + wall.y2) / 2;

      mesh.position.set(mx, height / 2, my);
      mesh.rotation.y = -angle;

      this.modelGroup.add(mesh);
    } else {
      // Wall with openings - use CSG-like approach with shape
      this._buildWallWithOpenings(wall, fp, openings, length, angle, height, thickness);
    }

    // Dimension label
    if (this.showDimensions && length > 0.5) {
      this._addDimensionLabel(wall, length, height);
    }
  }

  _getOpeningsForWall(wall, fp) {
    const openings = [];
    const length = fp.getWallLength(wall);

    for (const door of fp.doors) {
      if (door.wallId === wall.id) {
        openings.push({
          type: 'door',
          position: door.position,
          width: door.width,
          height: door.height,
          bottomY: 0,
        });
      }
    }
    for (const win of fp.windows) {
      if (win.wallId === wall.id) {
        openings.push({
          type: 'window',
          position: win.position,
          width: win.width,
          height: win.height,
          bottomY: win.sillHeight || 0.9,
        });
      }
    }
    return openings;
  }

  _buildWallWithOpenings(wall, fp, openings, length, angle, wallHeight, thickness) {
    const mx = (wall.x1 + wall.x2) / 2;
    const my = (wall.y1 + wall.y2) / 2;

    // Create wall shape with openings using THREE.Shape
    const shape = new THREE.Shape();
    shape.moveTo(-length / 2, 0);
    shape.lineTo(length / 2, 0);
    shape.lineTo(length / 2, wallHeight);
    shape.lineTo(-length / 2, wallHeight);
    shape.lineTo(-length / 2, 0);

    // Cut openings as holes
    for (const opening of openings) {
      const centerX = -length / 2 + opening.position * length;
      const halfW = opening.width / 2;
      const hole = new THREE.Path();
      hole.moveTo(centerX - halfW, opening.bottomY);
      hole.lineTo(centerX + halfW, opening.bottomY);
      hole.lineTo(centerX + halfW, opening.bottomY + opening.height);
      hole.lineTo(centerX - halfW, opening.bottomY + opening.height);
      hole.lineTo(centerX - halfW, opening.bottomY);
      shape.holes.push(hole);
    }

    const extrudeSettings = {
      depth: thickness,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.wallColor),
      roughness: 0.8,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.position.set(mx, 0, my);
    mesh.rotation.y = -angle;
    // Center the extrusion
    mesh.translateZ(-thickness / 2);

    this.modelGroup.add(mesh);
  }

  _buildDoor(door, fp) {
    const wall = fp.getWallById(door.wallId);
    if (!wall) return;

    const angle = fp.getWallAngle(wall);
    const wx = wall.x1 + (wall.x2 - wall.x1) * door.position;
    const wy = wall.y1 + (wall.y2 - wall.y1) * door.position;
    const thickness = wall.thickness || fp.wallThickness;

    // Door frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x5d4037,
      roughness: 0.6,
    });

    // Left frame
    const frameGeo = new THREE.BoxGeometry(0.05, door.height, thickness + 0.02);
    const leftFrame = new THREE.Mesh(frameGeo, frameMat);
    leftFrame.position.set(wx, door.height / 2, wy);
    leftFrame.rotation.y = -angle;
    leftFrame.translateX(-door.width / 2);
    this.modelGroup.add(leftFrame);

    // Right frame
    const rightFrame = new THREE.Mesh(frameGeo, frameMat);
    rightFrame.position.set(wx, door.height / 2, wy);
    rightFrame.rotation.y = -angle;
    rightFrame.translateX(door.width / 2);
    this.modelGroup.add(rightFrame);

    // Top frame
    const topGeo = new THREE.BoxGeometry(door.width + 0.1, 0.05, thickness + 0.02);
    const topFrame = new THREE.Mesh(topGeo, frameMat);
    topFrame.position.set(wx, door.height, wy);
    topFrame.rotation.y = -angle;
    this.modelGroup.add(topFrame);

    // Door panel (slightly open)
    const panelGeo = new THREE.BoxGeometry(door.width - 0.05, door.height - 0.05, 0.04);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x8d6e63,
      roughness: 0.5,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(wx, door.height / 2, wy);
    panel.rotation.y = -angle + 0.4; // slightly open
    panel.translateX(-door.width / 4);
    panel.translateZ(0.1);
    panel.castShadow = true;
    this.modelGroup.add(panel);
  }

  _buildWindow(win, fp) {
    const wall = fp.getWallById(win.wallId);
    if (!wall) return;

    const angle = fp.getWallAngle(wall);
    const wx = wall.x1 + (wall.x2 - wall.x1) * win.position;
    const wy = wall.y1 + (wall.y2 - wall.y1) * win.position;
    const thickness = wall.thickness || fp.wallThickness;
    const sillHeight = win.sillHeight || 0.9;

    // Window frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x78909c,
      roughness: 0.4,
    });

    // Frame pieces
    const frameWidth = 0.04;

    // Bottom sill
    const sillGeo = new THREE.BoxGeometry(win.width + 0.08, frameWidth, thickness + 0.04);
    const sill = new THREE.Mesh(sillGeo, frameMat);
    sill.position.set(wx, sillHeight, wy);
    sill.rotation.y = -angle;
    this.modelGroup.add(sill);

    // Top
    const top = new THREE.Mesh(sillGeo, frameMat);
    top.position.set(wx, sillHeight + win.height, wy);
    top.rotation.y = -angle;
    this.modelGroup.add(top);

    // Left
    const sideGeo = new THREE.BoxGeometry(frameWidth, win.height, thickness + 0.02);
    const left = new THREE.Mesh(sideGeo, frameMat);
    left.position.set(wx, sillHeight + win.height / 2, wy);
    left.rotation.y = -angle;
    left.translateX(-win.width / 2);
    this.modelGroup.add(left);

    // Right
    const right = new THREE.Mesh(sideGeo, frameMat);
    right.position.set(wx, sillHeight + win.height / 2, wy);
    right.rotation.y = -angle;
    right.translateX(win.width / 2);
    this.modelGroup.add(right);

    // Center divider
    const divGeo = new THREE.BoxGeometry(frameWidth, win.height - 0.04, frameWidth);
    const div = new THREE.Mesh(divGeo, frameMat);
    div.position.set(wx, sillHeight + win.height / 2, wy);
    div.rotation.y = -angle;
    this.modelGroup.add(div);

    // Glass panes
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.6,
    });
    const glassGeo = new THREE.PlaneGeometry(win.width - 0.08, win.height - 0.08);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(wx, sillHeight + win.height / 2, wy);
    glass.rotation.y = -angle + Math.PI / 2;
    this.modelGroup.add(glass);
  }

  _buildFloor(fp) {
    // Find bounding box of all walls
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const wall of fp.walls) {
      minX = Math.min(minX, wall.x1, wall.x2);
      minY = Math.min(minY, wall.y1, wall.y2);
      maxX = Math.max(maxX, wall.x1, wall.x2);
      maxY = Math.max(maxY, wall.y1, wall.y2);
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.floorColor),
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.01, cy);
    floor.receiveShadow = true;
    this.modelGroup.add(floor);
  }

  _buildCeiling(fp) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const wall of fp.walls) {
      minX = Math.min(minX, wall.x1, wall.x2);
      minY = Math.min(minY, wall.y1, wall.y2);
      maxX = Math.max(maxX, wall.x1, wall.x2);
      maxY = Math.max(maxY, wall.y1, wall.y2);
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const ceiling = new THREE.Mesh(geometry, material);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.set(cx, fp.wallHeight, cy);
    this.modelGroup.add(ceiling);
  }

  _addDimensionLabel(wall, length, height) {
    const div = document.createElement('div');
    div.className = 'dimension-label-3d';
    div.textContent = `${length.toFixed(2)}m`;
    div.style.cssText = `
      background: rgba(233, 69, 96, 0.85);
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-family: monospace;
      white-space: nowrap;
    `;

    const label = new CSS2DObject(div);
    label.userData.isLabel = true;
    const mx = (wall.x1 + wall.x2) / 2;
    const my = (wall.y1 + wall.y2) / 2;
    label.position.set(mx, height + 0.3, my);
    this.modelGroup.add(label);
  }

  setWallColor(color) {
    this.wallColor = color;
  }

  setFloorColor(color) {
    this.floorColor = color;
  }

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    this.container.removeChild(this.labelRenderer.domElement);
  }
}
