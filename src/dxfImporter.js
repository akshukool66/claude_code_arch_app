import DxfParser from 'dxf-parser';

/**
 * Parses a DXF file and extracts walls (LINE/LWPOLYLINE entities) into FloorPlanData.
 */
export function parseDXF(fileContent, floorPlan) {
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(fileContent);
  } catch (e) {
    throw new Error('Failed to parse DXF file: ' + e.message);
  }

  if (!dxf || !dxf.entities || dxf.entities.length === 0) {
    throw new Error('No entities found in DXF file');
  }

  floorPlan.clear();

  // Collect all points to compute bounding box for normalization
  const allPoints = [];

  for (const entity of dxf.entities) {
    if (entity.type === 'LINE') {
      allPoints.push(
        { x: entity.vertices[0].x, y: entity.vertices[0].y },
        { x: entity.vertices[1].x, y: entity.vertices[1].y }
      );
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      for (const v of entity.vertices) {
        allPoints.push({ x: v.x, y: v.y });
      }
    }
  }

  if (allPoints.length === 0) {
    throw new Error('No line entities found in DXF file');
  }

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPoints) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);

  // Scale to fit within a reasonable size (e.g., 20 meters max)
  const targetSize = 20;
  const scale = maxDim > 0 ? targetSize / maxDim : 1;

  function transform(x, y) {
    return {
      x: (x - minX) * scale,
      y: (y - minY) * scale,
    };
  }

  // Extract entities as walls
  for (const entity of dxf.entities) {
    if (entity.type === 'LINE') {
      const p1 = transform(entity.vertices[0].x, entity.vertices[0].y);
      const p2 = transform(entity.vertices[1].x, entity.vertices[1].y);
      floorPlan.addWall(p1.x, p1.y, p2.x, p2.y);
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const verts = entity.vertices;
      for (let i = 0; i < verts.length - 1; i++) {
        const p1 = transform(verts[i].x, verts[i].y);
        const p2 = transform(verts[i + 1].x, verts[i + 1].y);
        floorPlan.addWall(p1.x, p1.y, p2.x, p2.y);
      }
      // Close polyline if shape is closed
      if (entity.shape) {
        const pFirst = transform(verts[0].x, verts[0].y);
        const pLast = transform(verts[verts.length - 1].x, verts[verts.length - 1].y);
        floorPlan.addWall(pLast.x, pLast.y, pFirst.x, pFirst.y);
      }
    }
  }

  return {
    entityCount: dxf.entities.length,
    wallCount: floorPlan.walls.length,
    bounds: { width: width * scale, height: height * scale },
  };
}
