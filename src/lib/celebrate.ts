import confetti from 'canvas-confetti';

const COLORS = ['#7C5CFF', '#5AB8FF', '#34D3A0', '#FFD54A', '#FF6B9A', '#FF9A6B'];

export function celebrate(kind: 'small' | 'big' = 'small') {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (kind === 'small') {
    confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.7 }, colors: COLORS, scalar: 0.9, ticks: 160 });
    return;
  }
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS });
    confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
