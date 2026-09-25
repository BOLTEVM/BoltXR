import { mapToViewport, type Landmark, type Size } from './gesture-engine';

// MediaPipe's 21-point hand topology.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const HAND_COLORS = [
  { line: 'rgba(34, 211, 238, 0.85)', joint: '#f472b6', glow: '#22d3ee' },
  { line: 'rgba(251, 191, 36, 0.85)', joint: '#fb923c', glow: '#fbbf24' },
];

/** Resize a canvas to the viewport at device pixel ratio. Returns the ratio. */
export function fitCanvasToViewport(canvas: HTMLCanvasElement): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(window.innerWidth * dpr);
  const height = Math.round(window.innerHeight * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return dpr;
}

/** Draw hand skeletons aligned with a mirrored, object-fit: cover video. */
export function drawHands(canvas: HTMLCanvasElement, hands: Landmark[][], frame: Size) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = fitCanvasToViewport(canvas);
  const view = { width: window.innerWidth, height: window.innerHeight };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  hands.forEach((landmarks, hi) => {
    const color = HAND_COLORS[hi % HAND_COLORS.length];
    const points = landmarks.map(lm => mapToViewport(lm, frame, view));

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color.line;
    ctx.shadowBlur = 14;
    ctx.shadowColor = color.glow;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      if (!points[a] || !points[b]) continue;
      ctx.moveTo(points[a].x, points[a].y);
      ctx.lineTo(points[b].x, points[b].y);
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = color.joint;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

export function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
