import { initials } from '../lib/format.js';
import { DEPARTMENT_COLOR } from '../lib/palette.js';
import { useData } from '../context/DataContext.jsx';

/**
 * Initials on a dark disc, ringed in the person's squad colour — identity and
 * team in one mark, without needing photographs.
 */
export default function Avatar({ personId, size = 'md', showRing = true }) {
  const { byId } = useData();
  const person = byId('people', personId);
  const cls = `av${size === 'sm' ? ' av-sm' : size === 'lg' ? ' av-lg' : ''}`;

  if (!person) {
    return (
      <span className={cls} style={{ background: 'var(--sunk)', color: 'var(--text-3)' }} aria-hidden="true">
        ·
      </span>
    );
  }

  const ring = DEPARTMENT_COLOR[person.department] ?? 'var(--line-strong)';
  return (
    <span
      className={cls}
      title={`${person.name} — ${person.role_title ?? ''}`}
      style={showRing ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}
    >
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({ ids = [] }) {
  if (!ids.length) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <span className="av-stack">
      {ids.slice(0, 4).map((id) => <Avatar key={id} personId={id} size="sm" />)}
      {ids.length > 4 && (
        <span className="av av-sm" style={{ background: 'var(--sunk)', color: 'var(--text-2)' }}>
          +{ids.length - 4}
        </span>
      )}
    </span>
  );
}
