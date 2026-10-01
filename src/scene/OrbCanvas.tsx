import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Agent } from '@/agent/Agent';
import { agentFromSeed, type AgentConfig } from '@/agent/catalog';
import markUrl from '@/assets/nuuke-mark.png';
import type { OrbScene } from './orbScene';

export interface OrbHandle {
  ripple: () => void;
  charge: (on: boolean) => void;
  error: () => void;
  warp: () => Promise<void>;
}

/** The crew that orbits the glass. */
const CREW: AgentConfig[] = [
  { ...agentFromSeed('closer'), hat: 'headset', held: 'phone', bg: 'peach' },
  { ...agentFromSeed('pixel'), hat: 'beret', held: 'pencil', bg: 'rose' },
  { ...agentFromSeed('sprint'), hat: 'none', glasses: 'round', held: 'laptop', bg: 'sky' },
  { ...agentFromSeed('pitch'), hat: 'cap', held: 'coffee', bg: 'lemon' },
  { ...agentFromSeed('deploy'), hair: 'hijab', hairColor: 'purple', hat: 'none', held: 'megaphone', bg: 'mint' },
  { ...agentFromSeed('launch'), hat: 'party', glasses: 'shades', held: 'trophy', bg: 'violet', pet: 'cat' },
];

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draws an agent off-screen and turns it into an image the 3D scene can use. */
function agentImage(config: AgentConfig) {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<Agent config={config} size={256} animated={false} />));
  const svg = (host.querySelector('svg')?.outerHTML ?? '').replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  root.unmount();
  return load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The immersive sign-in backdrop. Loads Three.js only on this page, follows light and
 * dark mode, and quietly falls back to the CSS aurora when WebGL is unavailable.
 */
export const OrbCanvas = forwardRef<OrbHandle>(function OrbCanvas(_, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<OrbScene | null>(null);
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    ripple: () => scene.current?.ripple(),
    charge: (on) => scene.current?.charge(on),
    error: () => scene.current?.error(),
    warp: () => scene.current?.warp() ?? Promise.resolve(),
  }), []);

  useEffect(() => {
    if (!canvas.current || !webglAvailable()) return;
    let cancelled = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (async () => {
      try {
        // Draw the agents after this render has finished (React will not nest renders).
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        const [{ OrbScene }, mark, ...agents] = await Promise.all([
          import('./orbScene'),
          load(markUrl),
          ...CREW.map(agentImage),
        ]);
        if (cancelled || !canvas.current) return;
        scene.current = new OrbScene({
          canvas: canvas.current,
          agents,
          mark,
          dark: document.documentElement.classList.contains('dark'),
          reducedMotion: reduced,
        });
        requestAnimationFrame(() => !cancelled && setReady(true));
      } catch (err) {
        console.warn('3D scene unavailable, using the flat background', err);
      }
    })();

    const observer = new MutationObserver(() =>
      scene.current?.setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelled = true;
      observer.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="fixed inset-0 z-0 h-full w-full touch-pan-y transition-opacity duration-[1400ms]"
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
});
