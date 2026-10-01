import { Agent } from '@/agent/Agent';
import { normaliseAgent, type Mood } from '@/agent/catalog';

interface Who {
  id?: string | null;
  profile_id?: string | null;
  avatar?: unknown;
  full_name?: string | null;
}

/** Anyone's agent, from whatever profile-shaped row is at hand. */
export function AgentAvatar({
  who, size = 36, animated = false, mood, ring, className,
}: { who: Who | null | undefined; size?: number; animated?: boolean; mood?: Mood; ring?: string; className?: string }) {
  const id = who?.id ?? who?.profile_id ?? '';
  const config = normaliseAgent(who?.avatar, id);
  return (
    <span
      className={className}
      style={{ display: 'inline-block', borderRadius: '50%', boxShadow: ring ? `0 0 0 2.5px var(--canvas), 0 0 0 4.5px ${ring}` : undefined }}
    >
      <Agent config={config} size={size} animated={animated} mood={mood} title={who?.full_name ?? undefined} />
    </span>
  );
}
