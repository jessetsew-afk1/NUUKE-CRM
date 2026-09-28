import wordmark from '../assets/nuuke-logo.png';
import mark from '../assets/nuuke-mark.png';

/**
 * The wordmark art is white with transparency, so on a light ground it is
 * inverted to black via the --logo-invert token. On the black rail and the
 * portal hero it is used as-is.
 */
export function Wordmark({ height = 20, invert = true, className, alt = 'Nuuke' }) {
  return (
    <img
      src={wordmark}
      alt={alt}
      className={className}
      style={{ height, width: 'auto', display: 'block', filter: invert ? 'invert(var(--logo-invert))' : 'none' }}
    />
  );
}

export function Mark({ size = 30, className }) {
  return <img src={mark} alt="" className={className} style={{ width: size, height: size, display: 'block' }} />;
}
