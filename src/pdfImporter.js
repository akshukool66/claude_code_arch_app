import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker - use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

/**
 * Render a PDF file to an image data URL for background tracing,
 * and attempt to extract vector lines as walls.
 *
 * @param {ArrayBuffer} arrayBuffer - The PDF file contents
 * @param {number} [pageNum=1] - Which page to render
 * @returns {Promise<{dataUrl: string, lines: Array<{x1:number,y1:number,x2:number,y2:number}>, pageCount: number, width: number, height: number}>}
 */
export async function parsePDF(arrayBuffer, pageNum = 1) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);

  // Render page to canvas at 2x scale for clarity
  const scale = 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');

  // Attempt to extract vector line data from the PDF operator list
  const lines = await extractLines(page, viewport);

  return {
    dataUrl,
    lines,
    pageCount: pdf.numPages,
    width: viewport.width / scale,
    height: viewport.height / scale,
  };
}

/**
 * Extract line segments from PDF page operator list.
 * PDF drawing commands use moveTo (m), lineTo (l), rect (re), stroke (S), etc.
 */
async function extractLines(page, viewport) {
  const ops = await page.getOperatorList();
  const lines = [];
  let currentX = 0, currentY = 0;
  let pathStartX = 0, pathStartY = 0;
  const segments = [];

  // PDF operator constants from pdfjs
  const OPS = pdfjsLib.OPS;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    switch (fn) {
      case OPS.moveTo:
        currentX = args[0];
        currentY = args[1];
        pathStartX = currentX;
        pathStartY = currentY;
        break;

      case OPS.lineTo:
        segments.push({
          x1: currentX,
          y1: currentY,
          x2: args[0],
          y2: args[1],
        });
        currentX = args[0];
        currentY = args[1];
        break;

      case OPS.rectangle: {
        const [rx, ry, rw, rh] = args;
        // A rectangle = 4 line segments
        segments.push({ x1: rx, y1: ry, x2: rx + rw, y2: ry });
        segments.push({ x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh });
        segments.push({ x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh });
        segments.push({ x1: rx, y1: ry + rh, x2: rx, y2: ry });
        break;
      }

      case OPS.closePath:
        if (currentX !== pathStartX || currentY !== pathStartY) {
          segments.push({
            x1: currentX,
            y1: currentY,
            x2: pathStartX,
            y2: pathStartY,
          });
        }
        currentX = pathStartX;
        currentY = pathStartY;
        break;

      case OPS.stroke:
      case OPS.closeStroke:
      case OPS.fillStroke:
      case OPS.closeFillStroke:
      case OPS.eoFillStroke:
      case OPS.closeEOFillStroke:
        // Commit the path segments as actual lines
        for (const seg of segments) {
          // Transform from PDF coordinates (origin bottom-left) to viewport coordinates
          const [tx1, ty1] = pdfjsLib.Util.applyTransform([seg.x1, seg.y1], viewport.transform);
          const [tx2, ty2] = pdfjsLib.Util.applyTransform([seg.x2, seg.y2], viewport.transform);
          lines.push({
            x1: tx1 / viewport.scale,
            y1: ty1 / viewport.scale,
            x2: tx2 / viewport.scale,
            y2: ty2 / viewport.scale,
          });
        }
        segments.length = 0;
        break;

      case OPS.endPath:
        // Path was used for clipping or was invisible — discard
        segments.length = 0;
        break;
    }
  }

  return lines;
}

/**
 * Import extracted PDF lines into the floor plan data model.
 * Filters out very short segments (likely decorative) and normalizes scale.
 *
 * @param {Array<{x1:number,y1:number,x2:number,y2:number}>} lines
 * @param {object} floorPlan - FloorPlanData instance
 * @param {number} pdfWidth - PDF page width in points
 * @param {number} pdfHeight - PDF page height in points
 * @returns {{wallCount: number, totalLines: number}}
 */
export function importPDFLines(lines, floorPlan, pdfWidth, pdfHeight) {
  if (lines.length === 0) return { wallCount: 0, totalLines: 0 };

  floorPlan.clear();

  // Normalize to ~20m across the largest dimension
  const maxDim = Math.max(pdfWidth, pdfHeight);
  const scale = 20 / maxDim;

  // Filter out very short lines (< 0.2m after scaling — likely text/decoration)
  const minLength = 0.2;
  let wallCount = 0;

  for (const line of lines) {
    const x1 = line.x1 * scale;
    const y1 = line.y1 * scale;
    const x2 = line.x2 * scale;
    const y2 = line.y2 * scale;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len >= minLength) {
      floorPlan.addWall(x1, y1, x2, y2);
      wallCount++;
    }
  }

  return { wallCount, totalLines: lines.length };
}
