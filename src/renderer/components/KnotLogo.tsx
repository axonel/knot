import React from 'react';

interface KnotLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  subtitle?: boolean;
}

export const KnotLogo: React.FC<KnotLogoProps> = ({
  className = '',
  size = 36,
  showText = false,
  subtitle = false,
}) => {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-label="Knot logo"
      >
        {/* Blackout squircle base */}
        <rect width="64" height="64" rx="14" fill="#1B1D1F" />
        <rect
          width="62"
          height="62"
          x="1"
          y="1"
          rx="13"
          stroke="#F0F0ED"
          strokeOpacity="0.12"
          strokeWidth="1.5"
        />

        {/* Elevated Dark Loop (Left to Center Knot) */}
        <path
          d="M18 20 C18 36, 26 44, 32 32 C38 20, 46 28, 46 44"
          stroke="#292C2F"
          strokeWidth="4.5"
          strokeLinecap="round"
        />

        {/* Signal Red Agent Loop (Right to Center Knot - Interlaced) */}
        <path
          d="M46 44 C46 28, 38 20, 32 32 C26 44, 18 36, 18 20"
          stroke="#E05252"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="18 6"
        />

        {/* Central Interlocking Knot Nexus */}
        <circle cx="32" cy="32" r="4.5" fill="#1B1D1F" stroke="#F0F0ED" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="1.5" fill="#F0F0ED" />

        {/* Agent 1 Node (Top-Left: Neutral Dark with White Pip) */}
        <circle cx="18" cy="20" r="7" fill="#292C2F" stroke="#F0F0ED" strokeWidth="2" />
        <circle cx="18" cy="20" r="2.5" fill="#F0F0ED" />

        {/* Agent 2 Node (Bottom-Right: Signal Red with White Pip) */}
        <circle cx="46" cy="44" r="7" fill="#E05252" stroke="#F0F0ED" strokeWidth="2" />
        <circle cx="46" cy="44" r="2.5" fill="#F0F0ED" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-tight text-[#F0F0ED] text-base font-sans">Knot</span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#292C2F] text-[#F0F0ED]/90 border border-white/10">
              v1.0
            </span>
          </div>
          {subtitle && (
            <span className="text-[11px] text-[#A5A5A0] tracking-normal font-normal">
              Where AI agents work together.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const BrandLogo = KnotLogo;
export default KnotLogo;
