/**
 * Everything an agent can wear. Keys are stored in profiles.avatar and the
 * "<slot>:<item>" pairs that are earned (not free) are listed in the
 * agent_locked_items table — the database refuses them until unlocked.
 */

export interface AgentConfig {
  skin: string;
  eyes: string;
  brows: string;
  mouth: string;
  cheeks: boolean;
  hair: string;
  hairColor: string;
  hat: string;
  glasses: string;
  outfit: string;
  outfitColor: string;
  accessory: string;
  held: string;
  pet: string;
  bg: string;
}

export type Mood = 'idle' | 'happy' | 'sleepy' | 'focus' | 'celebrate' | 'wave';

export const SKINS: Record<string, { label: string; base: string; shade: string }> = {
  s1: { label: 'Porcelain', base: '#FDE3D3', shade: '#F2C6AF' },
  s2: { label: 'Peach', base: '#F8D0B4', shade: '#E8B08E' },
  s3: { label: 'Honey', base: '#E9B48A', shade: '#D4956A' },
  s4: { label: 'Caramel', base: '#D19A6E', shade: '#B67C52' },
  s5: { label: 'Bronze', base: '#B57A4E', shade: '#975F38' },
  s6: { label: 'Cocoa', base: '#8D5634', shade: '#6F4024' },
  s7: { label: 'Espresso', base: '#653B22', shade: '#4C2A16' },
  s8: { label: 'Ebony', base: '#47291A', shade: '#341C10' },
  f1: { label: 'Lilac', base: '#D9CCFF', shade: '#BBA8F5' },
  f2: { label: 'Mint', base: '#BFF2DD', shade: '#94DDBF' },
  f3: { label: 'Sky', base: '#BFE3FF', shade: '#93C8F2' },
  f4: { label: 'Bubblegum', base: '#FFC9DD', shade: '#F5A3C1' },
};

export const HAIR_COLORS: Record<string, { label: string; base: string; shine: string }> = {
  black: { label: 'Black', base: '#1E1B26', shine: '#3A3547' },
  darkbrown: { label: 'Dark brown', base: '#3B2418', shine: '#5A3A28' },
  brown: { label: 'Brown', base: '#6B4226', shine: '#8C5B38' },
  auburn: { label: 'Auburn', base: '#93391E', shine: '#B9532F' },
  blonde: { label: 'Blonde', base: '#E5B858', shine: '#F6D586' },
  platinum: { label: 'Platinum', base: '#EDE6D6', shine: '#FFFFFF' },
  grey: { label: 'Silver', base: '#9C9AA6', shine: '#C4C2CC' },
  rose: { label: 'Rose', base: '#F37BA5', shine: '#FFA6C4' },
  blue: { label: 'Ocean', base: '#3A7BF2', shine: '#6EA0FF' },
  purple: { label: 'Violet', base: '#7C5CFF', shine: '#A48EFF' },
  green: { label: 'Matcha', base: '#3CB98A', shine: '#6BD8AE' },
};

export const OUTFIT_COLORS: Record<string, { label: string; base: string; shade: string }> = {
  ink: { label: 'Ink', base: '#23212E', shade: '#15141C' },
  snow: { label: 'Snow', base: '#F4F3F8', shade: '#DCDAE5' },
  violet: { label: 'Iris', base: '#7C5CFF', shade: '#5F41E0' },
  sky: { label: 'Sky', base: '#4FA8F5', shade: '#2F87D6' },
  mint: { label: 'Mint', base: '#34C796', shade: '#22A47A' },
  lemon: { label: 'Lemon', base: '#FFCF3F', shade: '#E7B320' },
  peach: { label: 'Peach', base: '#FF8F5E', shade: '#E8703E' },
  rose: { label: 'Rose', base: '#FF5E8E', shade: '#E23E70' },
  forest: { label: 'Forest', base: '#2F6B4F', shade: '#1F4E39' },
  navy: { label: 'Navy', base: '#2B3A67', shade: '#1C284D' },
  maroon: { label: 'Maroon', base: '#7A2638', shade: '#5A1726' },
  sand: { label: 'Sand', base: '#D9C3A0', shade: '#BFA67F' },
};

export const BACKGROUNDS: Record<string, { label: string; from: string; to: string; pattern?: 'dots' | 'stars' | 'waves' }> = {
  violet: { label: 'Iris', from: '#C9BBFF', to: '#8E74FF' },
  sky: { label: 'Sky', from: '#C2E4FF', to: '#68B4FF' },
  mint: { label: 'Mint', from: '#C6F5E3', to: '#5ED6AA' },
  peach: { label: 'Peach', from: '#FFD9C6', to: '#FF9F75' },
  lemon: { label: 'Lemon', from: '#FFF1B8', to: '#FFD24A' },
  rose: { label: 'Rose', from: '#FFD0E0', to: '#FF7BA6' },
  ink: { label: 'Midnight', from: '#3A3650', to: '#14121D' },
  snow: { label: 'Cloud', from: '#FFFFFF', to: '#E4E2EE' },
  dots: { label: 'Confetti', from: '#E8E2FF', to: '#C9EEFF', pattern: 'dots' },
  waves: { label: 'Lagoon', from: '#BFF3F0', to: '#7FC8FF', pattern: 'waves' },
  galaxy: { label: 'Galaxy', from: '#4B2B9A', to: '#120B2E', pattern: 'stars' },
};

export interface SlotItem {
  id: string;
  label: string;
}

export const SLOTS: {
  key: keyof AgentConfig;
  label: string;
  items?: SlotItem[];
  colors?: 'skin' | 'hair' | 'outfit' | 'bg';
}[] = [
  { key: 'skin', label: 'Skin', colors: 'skin' },
  {
    key: 'eyes', label: 'Eyes', items: [
      { id: 'dot', label: 'Bright' }, { id: 'big', label: 'Sparkly' }, { id: 'happy', label: 'Happy' },
      { id: 'sleepy', label: 'Dreamy' }, { id: 'wink', label: 'Wink' }, { id: 'cool', label: 'Chill' },
      { id: 'star', label: 'Starry' }, { id: 'heart', label: 'Hearts' },
    ],
  },
  {
    key: 'brows', label: 'Brows', items: [
      { id: 'none', label: 'None' }, { id: 'soft', label: 'Soft' }, { id: 'raised', label: 'Curious' },
      { id: 'determined', label: 'Focused' }, { id: 'worried', label: 'Gentle' },
    ],
  },
  {
    key: 'mouth', label: 'Mouth', items: [
      { id: 'smile', label: 'Smile' }, { id: 'grin', label: 'Grin' }, { id: 'cat', label: 'Kitty' },
      { id: 'o', label: 'Ooh' }, { id: 'smirk', label: 'Smirk' }, { id: 'flat', label: 'Calm' }, { id: 'tongue', label: 'Cheeky' },
    ],
  },
  {
    key: 'hair', label: 'Hair', colors: 'hair', items: [
      { id: 'none', label: 'Bald' }, { id: 'buzz', label: 'Buzz' }, { id: 'swoop', label: 'Swoop' },
      { id: 'spiky', label: 'Spiky' }, { id: 'bob', label: 'Bob' }, { id: 'long', label: 'Long' },
      { id: 'bun', label: 'Bun' }, { id: 'curly', label: 'Curly' }, { id: 'mohawk', label: 'Mohawk' },
      { id: 'pigtails', label: 'Pigtails' }, { id: 'hijab', label: 'Hijab' },
    ],
  },
  {
    key: 'hat', label: 'Headwear', items: [
      { id: 'none', label: 'None' }, { id: 'headset', label: 'Headset' }, { id: 'headset_gold', label: 'Golden headset' },
      { id: 'beanie', label: 'Beanie' }, { id: 'cap', label: 'Cap' }, { id: 'beret', label: 'Beret' },
      { id: 'cat_ears', label: 'Cat ears' }, { id: 'party', label: 'Party hat' }, { id: 'flower', label: 'Flower' },
      { id: 'crown', label: 'Crown' }, { id: 'halo', label: 'Halo' },
    ],
  },
  {
    key: 'glasses', label: 'Glasses', items: [
      { id: 'none', label: 'None' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' },
      { id: 'shades', label: 'Agent shades' }, { id: 'heart', label: 'Heart' }, { id: 'monocle', label: 'Monocle' },
      { id: 'star', label: 'Star shades' },
    ],
  },
  {
    key: 'outfit', label: 'Outfit', colors: 'outfit', items: [
      { id: 'tee', label: 'Tee' }, { id: 'hoodie', label: 'Hoodie' }, { id: 'suit', label: 'Agent suit' },
      { id: 'sweater', label: 'Knit' }, { id: 'overalls', label: 'Overalls' }, { id: 'jersey', label: 'Jersey' },
      { id: 'labcoat', label: 'Lab coat' }, { id: 'kurta', label: 'Kurta' }, { id: 'tuxedo', label: 'Tuxedo' },
    ],
  },
  {
    key: 'accessory', label: 'Neck', items: [
      { id: 'none', label: 'None' }, { id: 'bowtie', label: 'Bow tie' }, { id: 'scarf', label: 'Scarf' },
      { id: 'chain', label: 'Chain' }, { id: 'lanyard', label: 'NUUKE badge' }, { id: 'pearls', label: 'Pearls' },
    ],
  },
  {
    key: 'held', label: 'Holding', items: [
      { id: 'none', label: 'Nothing' }, { id: 'coffee', label: 'Coffee' }, { id: 'phone', label: 'Phone' },
      { id: 'laptop', label: 'Laptop' }, { id: 'pencil', label: 'Pencil' }, { id: 'megaphone', label: 'Megaphone' },
      { id: 'plant', label: 'Plant' }, { id: 'trophy', label: 'Trophy' },
    ],
  },
  {
    key: 'pet', label: 'Sidekick', items: [
      { id: 'none', label: 'None' }, { id: 'cat', label: 'Cat' }, { id: 'dog', label: 'Pup' },
      { id: 'chick', label: 'Chick' }, { id: 'blob', label: 'Blob' }, { id: 'dragon', label: 'Baby dragon' },
    ],
  },
  { key: 'bg', label: 'Backdrop', colors: 'bg' },
];

export const DEFAULT_AGENT: AgentConfig = {
  skin: 's3', eyes: 'dot', brows: 'soft', mouth: 'smile', cheeks: true, hair: 'swoop', hairColor: 'black',
  hat: 'none', glasses: 'none', outfit: 'hoodie', outfitColor: 'violet', accessory: 'none', held: 'none', pet: 'none', bg: 'violet',
};

/** Earned items. Mirrors agent_locked_items; the database is the authority. */
export const LOCKED_ITEMS = new Set([
  'hat:headset_gold', 'glasses:star', 'held:trophy', 'hat:crown', 'pet:dragon', 'hat:halo', 'bg:galaxy', 'outfit:tuxedo',
]);

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A pleasant, distinct starting agent for anyone who has not built one yet. */
export function agentFromSeed(seed: string): AgentConfig {
  let h = hash(seed || 'nuuke');
  const take = <T,>(arr: T[]): T => {
    const v = arr[h % arr.length];
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    return v;
  };
  return {
    skin: take(['s1', 's2', 's3', 's4', 's5', 's6', 's7']),
    eyes: take(['dot', 'big', 'happy', 'dot']),
    brows: take(['soft', 'soft', 'raised', 'none']),
    mouth: take(['smile', 'grin', 'cat', 'smile']),
    cheeks: take([true, true, false]),
    hair: take(['swoop', 'bob', 'spiky', 'long', 'bun', 'curly', 'buzz']),
    hairColor: take(['black', 'darkbrown', 'brown', 'black', 'auburn']),
    hat: 'none',
    glasses: take(['none', 'none', 'round', 'none']),
    outfit: take(['hoodie', 'tee', 'sweater', 'jersey']),
    outfitColor: take(['violet', 'sky', 'mint', 'peach', 'rose', 'lemon', 'ink']),
    accessory: 'none',
    held: 'none',
    pet: 'none',
    bg: take(['violet', 'sky', 'mint', 'peach', 'rose', 'lemon']),
  };
}

/** Reads whatever is stored, filling gaps so old or partial configs still render. */
export function normaliseAgent(raw: unknown, seed = ''): AgentConfig {
  const base = agentFromSeed(seed);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AgentConfig>;
  const out = { ...base } as AgentConfig;
  for (const key of Object.keys(base) as (keyof AgentConfig)[]) {
    if (r[key] !== undefined && r[key] !== null) (out as unknown as Record<string, unknown>)[key] = r[key];
  }
  return out;
}

export const isEmptyAgent = (raw: unknown) => !raw || (typeof raw === 'object' && Object.keys(raw as object).length === 0);
