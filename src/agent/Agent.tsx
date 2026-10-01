import { memo, useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BACKGROUNDS, HAIR_COLORS, OUTFIT_COLORS, SKINS, type AgentConfig, type Mood,
} from './catalog';

/**
 * A NUUKE agent. Drawn on a 240×240 grid:
 *   head   centre (120, 104), 60 × 56
 *   eyes   (98, 110) and (142, 110)
 *   mouth  (120, 134)
 *   body   a rounded bust from y = 164
 *   held item bottom right, sidekick bottom left
 */

const INK = '#1D1A2B';

interface Props {
  config: AgentConfig;
  size?: number;
  mood?: Mood;
  /** Idle bobbing and blinking. Turn off for long lists. */
  animated?: boolean;
  shape?: 'circle' | 'squircle' | 'none';
  className?: string;
  title?: string;
}

function AgentImpl({ config, size = 96, mood = 'idle', animated = true, shape = 'circle', className, title }: Props) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const live = animated && !reduce;

  const skin = SKINS[config.skin] ?? SKINS.s3;
  const hair = HAIR_COLORS[config.hairColor] ?? HAIR_COLORS.black;
  const outfit = OUTFIT_COLORS[config.outfitColor] ?? OUTFIT_COLORS.violet;
  const bg = BACKGROUNDS[config.bg] ?? BACKGROUNDS.violet;

  const eyes = mood === 'happy' || mood === 'celebrate' ? 'happy' : mood === 'sleepy' ? 'sleepy' : config.eyes;
  const mouth = mood === 'celebrate' ? 'grin' : mood === 'sleepy' ? 'o' : config.mouth;

  const clip = shape === 'circle' ? <circle cx="120" cy="120" r="120" /> : shape === 'squircle' ? <rect width="240" height="240" rx="64" /> : <rect width="240" height="240" />;

  const bob = live
    ? mood === 'celebrate'
      ? { animate: { y: [0, -16, 0, -8, 0] }, transition: { duration: 1.1, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' as const } }
      : { animate: { y: [0, mood === 'sleepy' ? 2 : -3, 0] }, transition: { duration: mood === 'sleepy' ? 4.5 : 3.2, repeat: Infinity, ease: 'easeInOut' as const } }
    : {};

  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title ?? 'Agent'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <clipPath id={`clip-${uid}`}>{clip}</clipPath>
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg.from} />
          <stop offset="1" stopColor={bg.to} />
        </linearGradient>
        <radialGradient id={`glow-${uid}`} cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`body-${uid}`}>
          <path d="M50 244 C50 192 80 164 120 164 C160 164 190 192 190 244 Z" />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${uid})`}>
        {shape !== 'none' && (
          <>
            <rect width="240" height="240" fill={`url(#bg-${uid})`} />
            <Pattern kind={bg.pattern} />
            <rect width="240" height="240" fill={`url(#glow-${uid})`} />
          </>
        )}

        {mood === 'celebrate' && live && <Sparkles />}
        {mood === 'sleepy' && live && <Zzz />}

        <motion.g {...bob}>
          <HairBack style={config.hair} hair={hair} />
          <Body outfit={config.outfit} color={outfit} skin={skin} uid={uid} />
          <Accessory kind={config.accessory} color={outfit} />
          <Ears skin={skin} hidden={config.hair === 'hijab'} />
          {/* head */}
          <ellipse cx="120" cy="104" rx="60" ry="56" fill={skin.base} />
          <ellipse cx="120" cy="138" rx="44" ry="18" fill={skin.shade} opacity="0.18" />
          <HairFront style={config.hair} hair={hair} />
          {config.cheeks && (
            <g fill="#FF7FA0" opacity="0.32">
              <ellipse cx="80" cy="128" rx="10" ry="7" />
              <ellipse cx="160" cy="128" rx="10" ry="7" />
            </g>
          )}
          <ellipse cx="120" cy="123" rx="3.2" ry="2.2" fill={skin.shade} opacity="0.9" />
          <Brows kind={config.brows} color={config.hair === 'none' || config.hair === 'hijab' ? INK : hair.base} />
          <Eyes kind={eyes} skin={skin.base} live={live && eyes !== 'happy' && eyes !== 'sleepy'} />
          <Mouth kind={mouth} />
          <Glasses kind={config.glasses} />
          <Hat kind={config.hat} />
          {mood === 'focus' && live && <SoundWaves />}
          <Held kind={config.held} skin={skin} />
          {mood === 'wave' && <WaveHand skin={skin} live={live} />}
        </motion.g>

        <Pet kind={config.pet} live={live} />
      </g>
      {title && <title>{title}</title>}
    </svg>
  );
}

export const Agent = memo(AgentImpl);

/* ============================================================== background */
function Pattern({ kind }: { kind?: 'dots' | 'stars' | 'waves' }) {
  if (kind === 'dots') {
    const dots: ReactNode[] = [];
    const colors = ['#7C5CFF', '#FF6B9A', '#34D3A0', '#FFD54A', '#5AB8FF'];
    for (let i = 0; i < 26; i++) {
      const x = (i * 53) % 240;
      const y = (i * 89) % 240;
      dots.push(<circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 5 : 3.2} fill={colors[i % colors.length]} opacity="0.55" />);
    }
    return <g>{dots}</g>;
  }
  if (kind === 'stars') {
    const stars: ReactNode[] = [];
    for (let i = 0; i < 34; i++) {
      const x = (i * 67 + 13) % 240;
      const y = (i * 41 + 7) % 240;
      const r = i % 5 === 0 ? 2.4 : 1.2;
      stars.push(<circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={i % 2 ? 0.9 : 0.55} />);
    }
    return (
      <g>
        <ellipse cx="60" cy="70" rx="70" ry="30" fill="#FF6B9A" opacity="0.18" transform="rotate(-20 60 70)" />
        <ellipse cx="190" cy="170" rx="80" ry="34" fill="#5AB8FF" opacity="0.16" transform="rotate(25 190 170)" />
        {stars}
      </g>
    );
  }
  if (kind === 'waves') {
    return (
      <g fill="none" stroke="#fff" strokeWidth="3" opacity="0.45" strokeLinecap="round">
        {[30, 70, 110, 150, 190, 230].map((y) => (
          <path key={y} d={`M-10 ${y} Q20 ${y - 12} 50 ${y} T110 ${y} T170 ${y} T230 ${y} T290 ${y}`} />
        ))}
      </g>
    );
  }
  return null;
}

function Sparkles() {
  const items = [
    { x: 40, y: 50, c: '#FFD54A', d: 0 }, { x: 196, y: 44, c: '#FF6B9A', d: 0.3 },
    { x: 206, y: 120, c: '#34D3A0', d: 0.6 }, { x: 30, y: 130, c: '#5AB8FF', d: 0.9 },
    { x: 120, y: 22, c: '#7C5CFF', d: 0.45 },
  ];
  return (
    <g>
      {items.map((s, i) => (
        <motion.path
          key={i}
          d={`M${s.x} ${s.y - 9} L${s.x + 2.5} ${s.y - 2.5} L${s.x + 9} ${s.y} L${s.x + 2.5} ${s.y + 2.5} L${s.x} ${s.y + 9} L${s.x - 2.5} ${s.y + 2.5} L${s.x - 9} ${s.y} L${s.x - 2.5} ${s.y - 2.5} Z`}
          fill={s.c}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0], rotate: [0, 90] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: s.d }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      ))}
    </g>
  );
}

function Zzz() {
  return (
    <g fill={INK} fontFamily="Archivo, sans-serif" fontWeight="800">
      {[0, 1, 2].map((i) => (
        <motion.text
          key={i}
          x={178 + i * 10}
          y={64 - i * 14}
          fontSize={12 + i * 4}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.8, 0], y: -10 }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.6 }}
        >
          z
        </motion.text>
      ))}
    </g>
  );
}

function SoundWaves() {
  return (
    <g fill="none" stroke="#7C5CFF" strokeWidth="3.5" strokeLinecap="round">
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${196 + i * 9} ${96 - i * 4} q${7 + i * 2} ${14 + i * 4} 0 ${28 + i * 8}`}
          animate={{ opacity: [0.15, 1, 0.15] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </g>
  );
}

/* ==================================================================== body */
type Shade = { base: string; shade: string };

function Ears({ skin, hidden }: { skin: Shade; hidden: boolean }) {
  if (hidden) return null;
  return (
    <g>
      <circle cx="61" cy="112" r="12" fill={skin.base} />
      <circle cx="179" cy="112" r="12" fill={skin.base} />
      <circle cx="62" cy="112" r="6" fill={skin.shade} opacity="0.7" />
      <circle cx="178" cy="112" r="6" fill={skin.shade} opacity="0.7" />
    </g>
  );
}

function Body({ outfit, color, skin, uid }: { outfit: string; color: Shade; skin: Shade; uid: string }) {
  const mound = 'M50 244 C50 192 80 164 120 164 C160 164 190 192 190 244 Z';
  const clip = `url(#body-${uid})`;
  return (
    <g>
      {/* neck */}
      <path d="M104 146 h32 v26 q-16 8 -32 0 Z" fill={skin.shade} />
      {(() => {
        switch (outfit) {
          case 'hoodie':
            return (
              <g>
                <path d="M74 182 C78 160 100 154 120 154 C140 154 162 160 166 182 C150 172 136 170 120 170 C104 170 90 172 74 182 Z" fill={color.shade} />
                <path d={mound} fill={color.base} />
                <g clipPath={clip}>
                  <path d="M92 174 Q120 196 148 174" fill="none" stroke={color.shade} strokeWidth="6" strokeLinecap="round" />
                  <rect x="86" y="214" width="68" height="34" rx="12" fill={color.shade} opacity="0.55" />
                </g>
                <path d="M110 184 v20 M130 184 v20" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
                <circle cx="110" cy="206" r="3" fill="#fff" /><circle cx="130" cy="206" r="3" fill="#fff" />
              </g>
            );
          case 'suit':
          case 'tuxedo': {
            const jacket = outfit === 'tuxedo' ? '#17161F' : '#23212E';
            const tie = outfit === 'tuxedo' ? '#17161F' : color.base;
            return (
              <g>
                <path d={mound} fill={jacket} />
                <g clipPath={clip}>
                  <path d="M98 166 L120 214 L142 166 Z" fill="#FAFAFC" />
                  <path d="M98 166 L120 214 L102 244 L66 244 C70 200 82 176 98 166 Z" fill={outfit === 'tuxedo' ? '#2C2A38' : '#2E2B3C'} />
                  <path d="M142 166 L120 214 L138 244 L174 244 C170 200 158 176 142 166 Z" fill={outfit === 'tuxedo' ? '#2C2A38' : '#2E2B3C'} />
                  {outfit === 'tuxedo' ? (
                    <g fill={tie}>
                      <path d="M120 176 L106 168 L106 184 Z" /><path d="M120 176 L134 168 L134 184 Z" />
                      <circle cx="120" cy="176" r="4" />
                    </g>
                  ) : (
                    <g>
                      <path d="M114 170 h12 l-2 8 h-8 Z" fill={color.shade} />
                      <path d="M116 178 h8 l5 30 -9 9 -9 -9 Z" fill={tie} />
                    </g>
                  )}
                  <circle cx="120" cy="226" r="2.6" fill="#55516A" />
                </g>
              </g>
            );
          }
          case 'sweater':
            return (
              <g>
                <path d={mound} fill={color.base} />
                <g clipPath={clip} stroke={color.shade} strokeWidth="5" opacity="0.6">
                  <path d="M40 204 H200 M40 220 H200 M40 236 H200" strokeDasharray="7 5" />
                </g>
                <path d="M96 170 Q120 186 144 170" fill="none" stroke={color.shade} strokeWidth="9" strokeLinecap="round" />
              </g>
            );
          case 'overalls':
            return (
              <g>
                <path d={mound} fill="#F7F6FB" />
                <g clipPath={clip}>
                  <path d="M88 196 h64 v52 h-64 Z" fill={color.base} rx="10" />
                  <path d="M86 168 L96 198 M154 168 L144 198" stroke={color.base} strokeWidth="9" strokeLinecap="round" />
                  <rect x="108" y="206" width="24" height="16" rx="5" fill={color.shade} />
                  <circle cx="96" cy="200" r="4" fill="#FFD54A" /><circle cx="144" cy="200" r="4" fill="#FFD54A" />
                </g>
              </g>
            );
          case 'jersey':
            return (
              <g>
                <path d={mound} fill={color.base} />
                <g clipPath={clip}>
                  <path d="M96 166 L120 190 L144 166" fill="none" stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
                  <path d="M52 200 q14 -8 22 0 v44 h-22 Z M188 200 q-14 -8 -22 0 v44 h22 Z" fill={color.shade} />
                  <text x="120" y="232" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="900" fontSize="30" fill="#fff" opacity="0.92">N</text>
                </g>
              </g>
            );
          case 'labcoat':
            return (
              <g>
                <path d={mound} fill="#FBFBFE" />
                <g clipPath={clip}>
                  <path d="M102 166 L120 200 L138 166 Z" fill={color.base} />
                  <path d="M102 166 L120 200 L112 244 L72 244 C76 204 88 178 102 166 Z" fill="#EDECF4" />
                  <path d="M138 166 L120 200 L128 244 L168 244 C164 204 152 178 138 166 Z" fill="#EDECF4" />
                  <rect x="140" y="212" width="18" height="12" rx="3" fill="#DCDAE7" />
                  <path d="M146 208 v8" stroke={color.base} strokeWidth="3" strokeLinecap="round" />
                </g>
              </g>
            );
          case 'kurta':
            return (
              <g>
                <path d={mound} fill={color.base} />
                <g clipPath={clip}>
                  <rect x="113" y="166" width="14" height="70" rx="4" fill={color.shade} />
                  {[176, 190, 204, 218].map((y) => (
                    <circle key={y} cx="120" cy={y} r="2.6" fill="#FFD54A" />
                  ))}
                  <path d="M100 168 q20 10 40 0" fill="none" stroke="#FFD54A" strokeWidth="3" strokeDasharray="2 4" strokeLinecap="round" />
                </g>
              </g>
            );
          default: // tee
            return (
              <g>
                <path d={mound} fill={color.base} />
                <path d="M100 168 Q120 184 140 168" fill="none" stroke={color.shade} strokeWidth="5" strokeLinecap="round" />
              </g>
            );
        }
      })()}
    </g>
  );
}

function Accessory({ kind, color }: { kind: string; color: Shade }) {
  switch (kind) {
    case 'bowtie':
      return (
        <g transform="translate(120 172)">
          <path d="M0 0 L-16 -9 L-16 9 Z" fill="#FF5E8E" /><path d="M0 0 L16 -9 L16 9 Z" fill="#FF5E8E" />
          <circle r="4.5" fill="#E23E70" />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path d="M88 164 Q120 184 152 164 L156 176 Q120 198 84 176 Z" fill="#FF8F5E" />
          <path d="M138 178 l10 40 -14 2 -6 -38 Z" fill="#E8703E" />
          <path d="M90 170 Q120 188 150 170" fill="none" stroke="#FFD54A" strokeWidth="3" strokeDasharray="5 5" />
        </g>
      );
    case 'chain':
      return (
        <g>
          <path d="M98 168 Q120 200 142 168" fill="none" stroke="#F2C14E" strokeWidth="3.5" strokeDasharray="4 2" />
          <circle cx="120" cy="190" r="6" fill="#F2C14E" stroke="#C99A26" strokeWidth="2" />
        </g>
      );
    case 'lanyard':
      return (
        <g>
          <path d="M100 166 L114 206 M140 166 L126 206" stroke={color.shade === '#15141C' ? '#7C5CFF' : '#1D1A2B'} strokeWidth="4" />
          <rect x="106" y="202" width="28" height="34" rx="5" fill="#fff" stroke="#E2E0EA" />
          <rect x="111" y="207" width="18" height="6" rx="2" fill="#1D1A2B" />
          <text x="120" y="229" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="900" fontSize="13" fill="#7C5CFF">N</text>
        </g>
      );
    case 'pearls':
      return (
        <g fill="#FFFFFF" stroke="#E5E1EE" strokeWidth="1">
          {[-24, -16, -8, 0, 8, 16, 24].map((dx) => (
            <circle key={dx} cx={120 + dx} cy={172 + Math.abs(dx) * -0.3 + 8 - (dx * dx) / 110} r="4" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

/* ==================================================================== hair */
type HairShade = { base: string; shine: string };

function HairBack({ style, hair }: { style: string; hair: HairShade }) {
  switch (style) {
    case 'bob':
      return <path d="M52 112 C48 54 86 38 120 38 C154 38 192 54 188 112 C188 140 182 156 172 160 L68 160 C58 156 52 140 52 112 Z" fill={hair.base} />;
    case 'long':
      return <path d="M54 104 C52 52 88 38 120 38 C152 38 188 52 186 104 L192 196 C178 214 156 210 150 196 L90 196 C84 210 62 214 48 196 Z" fill={hair.base} />;
    case 'curly':
      return (
        <g fill={hair.base}>
          {[[58, 92], [56, 120], [64, 146], [182, 92], [184, 120], [176, 146]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="17" />
          ))}
        </g>
      );
    case 'pigtails':
      return (
        <g fill={hair.base}>
          <ellipse cx="46" cy="136" rx="17" ry="28" transform="rotate(14 46 136)" />
          <ellipse cx="194" cy="136" rx="17" ry="28" transform="rotate(-14 194 136)" />
          <circle cx="58" cy="108" r="6" fill="#FF6B9A" /><circle cx="182" cy="108" r="6" fill="#FF6B9A" />
        </g>
      );
    case 'hijab':
      return <path d="M50 110 C46 52 84 32 120 32 C156 32 194 52 190 110 C192 150 196 196 204 244 L36 244 C44 196 48 150 50 110 Z" fill={hair.base} />;
    default:
      return null;
  }
}

function HairFront({ style, hair }: { style: string; hair: HairShade }) {
  const shine = <path d="M92 58 Q108 50 126 52" fill="none" stroke={hair.shine} strokeWidth="5" strokeLinecap="round" opacity="0.8" />;
  switch (style) {
    case 'buzz':
      return <path d="M60 100 C58 60 88 44 120 44 C152 44 182 60 180 100 C172 78 152 66 120 66 C88 66 68 78 60 100 Z" fill={hair.base} opacity="0.92" />;
    case 'swoop':
      return (
        <g>
          <path d="M58 104 C54 58 88 40 122 40 C158 40 186 60 182 104 C178 86 168 74 156 70 C140 86 104 96 66 92 C62 96 60 100 58 104 Z" fill={hair.base} />
          {shine}
        </g>
      );
    case 'spiky':
      return (
        <g>
          <path d="M58 102 C56 76 64 60 76 52 L74 34 L92 46 L98 26 L112 42 L122 22 L132 42 L146 26 L150 46 L168 36 L164 54 C176 62 184 78 182 102 C172 80 150 70 120 70 C90 70 68 80 58 102 Z" fill={hair.base} />
          {shine}
        </g>
      );
    case 'bob':
      return (
        <g>
          <path d="M58 112 C54 60 88 42 120 42 C152 42 186 60 182 112 L172 112 C170 92 168 82 162 76 C140 82 100 82 78 76 C72 82 70 92 68 112 Z" fill={hair.base} />
          {shine}
        </g>
      );
    case 'long':
      return (
        <g>
          <path d="M58 108 C54 58 88 42 120 42 C152 42 186 58 182 108 C176 84 160 70 136 66 L120 80 L104 66 C80 70 64 84 58 108 Z" fill={hair.base} />
          {shine}
        </g>
      );
    case 'bun':
      return (
        <g>
          <circle cx="120" cy="36" r="20" fill={hair.base} />
          <path d="M60 100 C58 58 88 44 120 44 C152 44 182 58 180 100 C172 78 152 64 120 64 C88 64 68 78 60 100 Z" fill={hair.base} />
          <path d="M112 30 Q120 26 128 30" fill="none" stroke={hair.shine} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 'curly':
      return (
        <g fill={hair.base}>
          {[[66, 76], [80, 58], [100, 46], [120, 42], [140, 46], [160, 58], [174, 76], [88, 72], [112, 62], [134, 64], [154, 72]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="16" />
          ))}
        </g>
      );
    case 'mohawk':
      return (
        <g>
          <path d="M60 100 C58 62 88 46 120 46 C152 46 182 62 180 100 C172 80 152 68 120 68 C88 68 68 80 60 100 Z" fill={hair.base} opacity="0.35" />
          <path d="M106 66 L104 40 L112 46 L116 22 L122 40 L130 20 L132 42 L140 34 L136 66 Z" fill={hair.base} />
        </g>
      );
    case 'pigtails':
      return (
        <g>
          <path d="M58 106 C54 58 88 42 120 42 C152 42 186 58 182 106 C174 84 156 70 128 66 L120 74 L112 66 C84 70 66 84 58 106 Z" fill={hair.base} />
          {shine}
        </g>
      );
    case 'hijab':
      return (
        <g>
          <path d="M60 96 C62 60 90 46 120 46 C150 46 178 60 180 96 C168 72 148 62 120 62 C92 62 72 72 60 96 Z" fill={hair.shine} opacity="0.55" />
          <path d="M64 136 C70 156 92 168 120 168 C148 168 170 156 176 136 C180 150 176 170 168 178 C150 190 90 190 72 178 C64 170 60 150 64 136 Z" fill={hair.base} />
        </g>
      );
    default:
      return null;
  }
}

/* ===================================================================== face */
function Brows({ kind, color }: { kind: string; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 4, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'soft':
      return <g><path d="M88 92 Q98 87 108 91" {...s} /><path d="M132 91 Q142 87 152 92" {...s} /></g>;
    case 'raised':
      return <g><path d="M87 88 Q98 79 109 86" {...s} /><path d="M131 86 Q142 79 153 88" {...s} /></g>;
    case 'determined':
      return <g><path d="M88 88 L108 94" {...s} /><path d="M132 94 L152 88" {...s} /></g>;
    case 'worried':
      return <g><path d="M88 94 L108 88" {...s} /><path d="M132 88 L152 94" {...s} /></g>;
    default:
      return null;
  }
}

function Eye({ kind, x, skin }: { kind: string; x: number; skin: string }) {
  const y = 110;
  switch (kind) {
    case 'big':
      return (
        <g>
          <ellipse cx={x} cy={y} rx="10" ry="12" fill={INK} />
          <circle cx={x + 3.5} cy={y - 4.5} r="4" fill="#fff" />
          <circle cx={x - 3} cy={y + 4} r="1.8" fill="#fff" opacity="0.9" />
        </g>
      );
    case 'happy':
      return <path d={`M${x - 9} ${y + 3} Q${x} ${y - 9} ${x + 9} ${y + 3}`} fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />;
    case 'sleepy':
      return <path d={`M${x - 9} ${y} Q${x} ${y + 7} ${x + 9} ${y}`} fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />;
    case 'cool':
      return (
        <g>
          <ellipse cx={x} cy={y + 1} rx="8.5" ry="8" fill={INK} />
          <circle cx={x + 3} cy={y + 2} r="2.4" fill="#fff" />
          <path d={`M${x - 11} ${y - 8} H${x + 11} V${y - 1} Q${x} ${y + 1} ${x - 11} ${y - 1} Z`} fill={skin} />
          <path d={`M${x - 10} ${y - 1} Q${x} ${y + 1} ${x + 10} ${y - 1}`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'star':
      return (
        <path
          d={`M${x} ${y - 11} L${x + 3.4} ${y - 3.4} L${x + 11} ${y} L${x + 3.4} ${y + 3.4} L${x} ${y + 11} L${x - 3.4} ${y + 3.4} L${x - 11} ${y} L${x - 3.4} ${y - 3.4} Z`}
          fill={INK}
        />
      );
    case 'heart':
      return (
        <path
          d={`M${x} ${y + 9} C${x - 14} ${y} ${x - 10} ${y - 11} ${x} ${y - 4} C${x + 10} ${y - 11} ${x + 14} ${y} ${x} ${y + 9} Z`}
          fill="#FF4F86"
        />
      );
    default: // dot
      return (
        <g>
          <ellipse cx={x} cy={y} rx="6.5" ry="8" fill={INK} />
          <circle cx={x + 2.4} cy={y - 3} r="2.3" fill="#fff" />
        </g>
      );
  }
}

function Eyes({ kind, skin, live }: { kind: string; skin: string; live: boolean }) {
  const left = kind === 'wink' ? 'big' : kind;
  const right = kind === 'wink' ? 'happy' : kind;
  const blink = live
    ? {
        animate: { scaleY: [1, 1, 0.08, 1] },
        transition: { duration: 4.6, times: [0, 0.93, 0.96, 1], repeat: Infinity, repeatDelay: 0.4 },
      }
    : {};
  return (
    <motion.g {...blink} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <Eye kind={left} x={98} skin={skin} />
      <Eye kind={right} x={142} skin={skin} />
    </motion.g>
  );
}

function Mouth({ kind }: { kind: string }) {
  const s = { fill: 'none', stroke: INK, strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'grin':
      return (
        <g>
          <path d="M104 130 Q120 154 136 130 Z" fill="#3A1D2C" />
          <path d="M106 131 H134 Q132 136 130 137 H110 Q108 136 106 131 Z" fill="#fff" />
          <ellipse cx="120" cy="143" rx="8" ry="4.5" fill="#FF7FA0" />
        </g>
      );
    case 'cat':
      return <path d="M106 131 Q113 139 120 132 Q127 139 134 131" {...s} />;
    case 'o':
      return <ellipse cx="120" cy="136" rx="5.5" ry="6.5" fill="#3A1D2C" />;
    case 'smirk':
      return <path d="M108 136 Q122 140 133 129" {...s} />;
    case 'flat':
      return <path d="M110 135 H130" {...s} />;
    case 'tongue':
      return (
        <g>
          <path d="M106 131 Q120 144 134 131" {...s} />
          <path d="M122 138 q2 10 9 8 q5 -2 2 -11" fill="#FF7FA0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      );
    default: // smile
      return <path d="M106 131 Q120 145 134 131" {...s} />;
  }
}

function Glasses({ kind }: { kind: string }) {
  switch (kind) {
    case 'round':
      return (
        <g fill="rgba(255,255,255,0.18)" stroke={INK} strokeWidth="4">
          <circle cx="98" cy="110" r="16" /><circle cx="142" cy="110" r="16" />
          <path d="M114 108 Q120 103 126 108" fill="none" />
          <path d="M82 106 L64 102 M158 106 L176 102" />
        </g>
      );
    case 'square':
      return (
        <g fill="rgba(255,255,255,0.18)" stroke={INK} strokeWidth="4" strokeLinejoin="round">
          <rect x="80" y="97" width="36" height="27" rx="7" /><rect x="124" y="97" width="36" height="27" rx="7" />
          <path d="M116 106 H124 M80 104 L64 101 M160 104 L176 101" fill="none" />
        </g>
      );
    case 'shades':
      return (
        <g>
          <path d="M74 100 H166 V106 Q166 128 146 128 Q126 128 124 108 H116 Q114 128 94 128 Q74 128 74 106 Z" fill="#14121C" />
          <path d="M84 106 l12 0 M132 106 l12 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M74 103 L62 100 M166 103 L178 100" stroke="#14121C" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 'star':
      return (
        <g fill="#FFD54A" stroke="#E0A800" strokeWidth="2.5" strokeLinejoin="round">
          {[98, 142].map((x) => (
            <path key={x} d={`M${x} 92 L${x + 6} 104 L${x + 19} 106 L${x + 9} 115 L${x + 12} 128 L${x} 121 L${x - 12} 128 L${x - 9} 115 L${x - 19} 106 L${x - 6} 104 Z`} opacity="0.95" />
          ))}
          <path d="M117 108 H123" stroke="#E0A800" strokeWidth="4" />
        </g>
      );
    case 'heart':
      return (
        <g fill="#FF5E8E" stroke="#C92A5E" strokeWidth="2.5" opacity="0.92">
          {[98, 142].map((x) => (
            <path key={x} d={`M${x} 126 C${x - 24} 112 ${x - 16} 92 ${x} 104 C${x + 16} 92 ${x + 24} 112 ${x} 126 Z`} />
          ))}
          <path d="M116 108 H124" stroke="#C92A5E" strokeWidth="4" />
        </g>
      );
    case 'monocle':
      return (
        <g fill="rgba(255,255,255,0.2)" stroke="#C99A26" strokeWidth="3.5">
          <circle cx="142" cy="110" r="16" />
          <path d="M156 118 Q170 150 160 180" fill="none" strokeDasharray="3 3" />
        </g>
      );
    default:
      return null;
  }
}

/* ===================================================================== hats */
function Hat({ kind }: { kind: string }) {
  switch (kind) {
    case 'headset':
    case 'headset_gold': {
      const band = kind === 'headset_gold' ? '#E8B321' : '#2A2735';
      const cup = kind === 'headset_gold' ? '#FFD54A' : '#3A3648';
      const pad = kind === 'headset_gold' ? '#FFF1B8' : '#7C5CFF';
      return (
        <g>
          <path d="M60 106 C56 50 92 34 120 34 C148 34 184 50 180 106" fill="none" stroke={band} strokeWidth="8" strokeLinecap="round" />
          <rect x="48" y="96" width="22" height="34" rx="9" fill={cup} />
          <rect x="170" y="96" width="22" height="34" rx="9" fill={cup} />
          <rect x="52" y="102" width="6" height="22" rx="3" fill={pad} />
          <rect x="182" y="102" width="6" height="22" rx="3" fill={pad} />
          <path d="M180 126 Q178 148 146 146" fill="none" stroke={band} strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="144" cy="146" r="6" fill={cup} />
          {kind === 'headset_gold' && <circle cx="186" cy="100" r="2.5" fill="#fff" />}
        </g>
      );
    }
    case 'beanie':
      return (
        <g>
          <path d="M58 92 C56 52 88 34 120 34 C152 34 184 52 182 92 Z" fill="#FF6B5E" />
          <rect x="54" y="80" width="132" height="20" rx="10" fill="#E24B40" />
          <g stroke="#FF8A80" strokeWidth="3" opacity="0.8">
            {[72, 88, 104, 120, 136, 152, 168].map((x) => <path key={x} d={`M${x} 82 v16`} />)}
          </g>
          <circle cx="120" cy="30" r="11" fill="#FFF3EE" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M60 88 C58 50 90 34 120 34 C150 34 182 50 180 88 Z" fill="#2B3A67" />
          <path d="M60 86 C90 74 150 74 180 86 C186 96 176 100 160 98 C140 94 100 94 80 98 C64 100 54 96 60 86 Z" fill="#1C284D" />
          <path d="M120 36 V82" stroke="#3E4F86" strokeWidth="3" />
          <circle cx="120" cy="35" r="4" fill="#3E4F86" />
          <path d="M100 60 h40" stroke="#FFD54A" strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case 'beret':
      return (
        <g>
          <ellipse cx="112" cy="56" rx="62" ry="22" fill="#D63A5A" transform="rotate(-10 112 56)" />
          <path d="M66 70 Q120 86 168 60" fill="none" stroke="#B02844" strokeWidth="5" strokeLinecap="round" />
          <path d="M116 36 q2 -10 8 -12" stroke="#B02844" strokeWidth="4" strokeLinecap="round" fill="none" />
        </g>
      );
    case 'cat_ears':
      return (
        <g>
          <path d="M68 70 L72 30 L102 52 Z" fill="#2A2735" /><path d="M172 70 L168 30 L138 52 Z" fill="#2A2735" />
          <path d="M76 62 L78 40 L96 53 Z" fill="#FF8FB1" /><path d="M164 62 L162 40 L144 53 Z" fill="#FF8FB1" />
          <path d="M66 74 Q120 44 174 74" fill="none" stroke="#2A2735" strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case 'party':
      return (
        <g transform="rotate(12 130 40)">
          <path d="M110 64 L134 4 L158 64 Z" fill="#7C5CFF" />
          <path d="M118 46 L148 40 M114 56 L154 50 M124 30 L142 26" stroke="#FFD54A" strokeWidth="5" strokeLinecap="round" />
          <circle cx="134" cy="4" r="8" fill="#FF6B9A" />
          <ellipse cx="134" cy="64" rx="26" ry="5" fill="#5F41E0" />
        </g>
      );
    case 'flower':
      return (
        <g transform="translate(160 66)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-11" rx="7.5" ry="11" fill="#FF8FB1" transform={`rotate(${a})`} />
          ))}
          <circle r="7" fill="#FFD54A" />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path d="M78 66 L84 26 L102 48 L120 18 L138 48 L156 26 L162 66 Z" fill="#FFD54A" stroke="#E0A800" strokeWidth="3" strokeLinejoin="round" />
          <rect x="76" y="60" width="88" height="12" rx="5" fill="#F2B90F" />
          <circle cx="120" cy="38" r="5.5" fill="#FF5E8E" /><circle cx="96" cy="64" r="4" fill="#34D3A0" />
          <circle cx="120" cy="66" r="4.5" fill="#5AB8FF" /><circle cx="144" cy="64" r="4" fill="#34D3A0" />
        </g>
      );
    case 'halo':
      return (
        <g>
          <ellipse cx="120" cy="30" rx="44" ry="12" fill="none" stroke="#FFE27A" strokeWidth="9" />
          <ellipse cx="120" cy="30" rx="44" ry="12" fill="none" stroke="#FFF6CC" strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

/* ============================================================ hands & items */
function Hand({ x, y, skin }: { x: number; y: number; skin: Shade }) {
  return (
    <g>
      <circle cx={x} cy={y} r="12" fill={skin.base} />
      <path d={`M${x - 6} ${y - 6} q6 -3 12 0`} stroke={skin.shade} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Held({ kind, skin }: { kind: string; skin: Shade }) {
  if (kind === 'none') return null;
  const hand = <Hand x={172} y={214} skin={skin} />;
  switch (kind) {
    case 'coffee':
      return (
        <g>
          <path d="M162 176 q-4 -8 2 -14 M172 176 q-4 -8 2 -14" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
          <rect x="156" y="180" width="32" height="34" rx="7" fill="#FFFFFF" />
          <rect x="156" y="190" width="32" height="12" fill="#7C5CFF" />
          <path d="M188 188 q12 2 10 12 q-2 8 -10 8" fill="none" stroke="#FFFFFF" strokeWidth="5" />
          {hand}
        </g>
      );
    case 'phone':
      return (
        <g>
          <rect x="158" y="166" width="28" height="48" rx="7" fill="#1D1A2B" />
          <rect x="161" y="172" width="22" height="34" rx="4" fill="#7C5CFF" />
          <circle cx="172" cy="189" r="5" fill="#fff" opacity="0.85" />
          {hand}
        </g>
      );
    case 'laptop':
      return (
        <g>
          <path d="M138 186 h56 l-6 32 h-44 Z" fill="#C9C6D6" />
          <rect x="136" y="216" width="60" height="7" rx="3.5" fill="#A9A5BA" />
          <circle cx="166" cy="200" r="5" fill="#fff" opacity="0.9" />
          <Hand x={146} y={222} skin={skin} />
        </g>
      );
    case 'pencil':
      return (
        <g transform="rotate(-30 172 200)">
          <rect x="166" y="150" width="12" height="56" rx="3" fill="#FFD54A" />
          <path d="M166 206 h12 l-6 12 Z" fill="#F2C9A0" /><path d="M170 214 h4 l-2 4 Z" fill="#1D1A2B" />
          <rect x="166" y="146" width="12" height="8" rx="2" fill="#FF8FB1" />
          {hand}
        </g>
      );
    case 'megaphone':
      return (
        <g>
          <path d="M160 196 L196 174 L196 222 Z" fill="#FF6B5E" />
          <rect x="150" y="190" width="14" height="18" rx="4" fill="#E24B40" />
          <ellipse cx="196" cy="198" rx="6" ry="24" fill="#FFB0A8" />
          {hand}
        </g>
      );
    case 'plant':
      return (
        <g>
          <path d="M172 184 q-16 -10 -14 -26 q14 4 14 26 Z" fill="#34C796" />
          <path d="M172 184 q14 -12 16 -26 q-16 6 -16 26 Z" fill="#22A47A" />
          <path d="M156 184 h32 l-4 28 h-24 Z" fill="#FF8F5E" />
          {hand}
        </g>
      );
    case 'trophy':
      return (
        <g>
          <path d="M156 168 h32 v14 q0 18 -16 20 q-16 -2 -16 -20 Z" fill="#FFD54A" stroke="#E0A800" strokeWidth="2.5" />
          <path d="M156 172 q-10 0 -8 10 q2 8 10 8 M188 172 q10 0 8 10 q-2 8 -10 8" fill="none" stroke="#E0A800" strokeWidth="3" />
          <rect x="166" y="202" width="12" height="8" fill="#E0A800" />
          <path d="M168 180 l4 6 6 -10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
          {hand}
        </g>
      );
    default:
      return null;
  }
}

function WaveHand({ skin, live }: { skin: Shade; live: boolean }) {
  return (
    <motion.g
      animate={live ? { rotate: [0, 18, -6, 18, 0] } : undefined}
      transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.8 }}
      style={{ transformOrigin: '196px 196px' }}
    >
      <path d="M184 196 Q196 176 200 156" stroke={skin.base} strokeWidth="14" strokeLinecap="round" fill="none" />
      <circle cx="201" cy="150" r="13" fill={skin.base} />
      <path d="M194 144 q7 -4 14 0" stroke={skin.shade} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </motion.g>
  );
}

/* ===================================================================== pets */
function Pet({ kind, live }: { kind: string; live: boolean }) {
  if (kind === 'none') return null;
  const hop = live ? { animate: { y: [0, -5, 0] }, transition: { duration: 1.8, repeat: Infinity, repeatDelay: 1.6, ease: 'easeOut' as const } } : {};
  const face = (cx: number, cy: number) => (
    <g>
      <circle cx={cx - 6} cy={cy} r="2.6" fill={INK} /><circle cx={cx + 6} cy={cy} r="2.6" fill={INK} />
      <path d={`M${cx - 3} ${cy + 6} q3 3 6 0`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
  let art: ReactNode = null;
  switch (kind) {
    case 'cat':
      art = (
        <g>
          <ellipse cx="40" cy="226" rx="22" ry="14" fill="#F2A65A" />
          <path d="M22 204 L24 186 L36 198 Z M58 204 L56 186 L44 198 Z" fill="#F2A65A" />
          <circle cx="40" cy="208" r="18" fill="#F2A65A" />
          <path d="M26 196 L27 189 L32 194 Z M54 196 L53 189 L48 194 Z" fill="#FFC9A0" />
          {face(40, 206)}
          <path d="M22 212 h-8 M22 216 h-7 M58 212 h8 M58 216 h7" stroke={INK} strokeWidth="1.5" opacity="0.6" />
        </g>
      );
      break;
    case 'dog':
      art = (
        <g>
          <ellipse cx="40" cy="228" rx="22" ry="13" fill="#C98E5C" />
          <circle cx="40" cy="208" r="18" fill="#E3B285" />
          <ellipse cx="22" cy="206" rx="7" ry="13" fill="#8C5B38" transform="rotate(15 22 206)" />
          <ellipse cx="58" cy="206" rx="7" ry="13" fill="#8C5B38" transform="rotate(-15 58 206)" />
          <ellipse cx="40" cy="214" rx="8" ry="6" fill="#F6DCC2" />
          <circle cx="34" cy="204" r="2.6" fill={INK} /><circle cx="46" cy="204" r="2.6" fill={INK} />
          <ellipse cx="40" cy="211" rx="3.5" ry="2.5" fill={INK} />
          <path d="M40 216 q0 6 4 6" stroke="#FF7FA0" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      );
      break;
    case 'chick':
      art = (
        <g>
          <circle cx="40" cy="218" r="20" fill="#FFD54A" />
          <path d="M36 196 q4 -10 8 0" fill="#FFD54A" />
          <path d="M36 216 l8 0 -4 6 Z" fill="#FF8F5E" />
          <circle cx="34" cy="210" r="2.6" fill={INK} /><circle cx="46" cy="210" r="2.6" fill={INK} />
          <ellipse cx="22" cy="220" rx="5" ry="8" fill="#F2BF2E" transform="rotate(20 22 220)" />
        </g>
      );
      break;
    case 'blob':
      art = (
        <g>
          <path d="M18 236 Q16 196 40 194 Q64 196 62 236 Z" fill="#7C5CFF" opacity="0.92" />
          <ellipse cx="32" cy="204" rx="5" ry="3" fill="#fff" opacity="0.5" />
          {face(40, 216)}
        </g>
      );
      break;
    case 'dragon':
      art = (
        <g>
          <path d="M14 214 L4 196 L22 204 Z M66 214 L76 196 L58 204 Z" fill="#22A47A" />
          <ellipse cx="40" cy="228" rx="22" ry="13" fill="#34C796" />
          <circle cx="40" cy="208" r="18" fill="#34C796" />
          <path d="M30 192 L28 182 L36 190 Z M50 192 L52 182 L44 190 Z" fill="#FFD54A" />
          <ellipse cx="40" cy="216" rx="9" ry="5" fill="#BFF2DD" />
          {face(40, 206)}
        </g>
      );
      break;
  }
  // Drawn around (40, 210); nudged inward so a circular frame never clips it.
  return (
    <g transform="translate(24 -8)">
      <motion.g {...hop}>{art}</motion.g>
    </g>
  );
}
