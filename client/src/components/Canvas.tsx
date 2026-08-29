import { useRef } from 'react';
import { useAnimationFrame } from '../store';

interface Props {
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  height?: number;
  style?: React.CSSProperties;
}

// Self-sizing, DPR-aware canvas that redraws every animation frame.
export function Canvas({ draw, height, style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useAnimationFrame(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0 || h === 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    drawRef.current(ctx, w, h);
    ctx.restore();
  });

  return <canvas ref={ref} style={{ height: height ? `${height}px` : '100%', ...style }} />;
}
