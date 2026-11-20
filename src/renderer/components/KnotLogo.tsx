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
        {/* Navy squircle base */}
        <rect width="64" height="64" rx="14" fill="#092634" />
        <rect
          width="62"
          height="62"
          x="1"
          y="1"
          rx="13"
          stroke="#F9F9F9"
          strokeOpacity="0.12"
          strokeWidth="1.5"
        />

        {/* Blue Agent Loop (Left to Center Knot) */}
        <path
          d="M18 20 C18 36, 26 44, 32 32 C38 20, 46 28, 46 44"
          stroke="#004E72"
          strokeWidth="4.5"
          strokeLinecap="round"
        />

        {/* Orange Agent Loop (Right to Center Knot - Interlaced) */}
        <path
          d="M46 44 C46 28, 38 20, 32 32 C26 44, 18 36, 18 20"
          stroke="#FF6E42"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="18 6"
        />

        {/* Central Interlocking Knot Nexus */}
        <circle cx="32" cy="32" r="4.5" fill="#092634" stroke="#F9F9F9" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="1.5" fill="#F9F9F9" />

        {/* Agent 1 Node (Top-Left: Blue with White Pip) */}
        <circle cx="18" cy="20" r="7" fill="#004E72" stroke="#F9F9F9" strokeWidth="2" />
        <circle cx="18" cy="20" r="2.5" fill="#F9F9F9" />

        {/* Agent 2 Node (Bottom-Right: Orange with White Pip) */}
        <circle cx="46" cy="44" r="7" fill="#FF6E42" stroke="#F9F9F9" strokeWidth="2" />
        <circle cx="46" cy="44" r="2.5" fill="#F9F9F9" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-tight text-white text-base">Knot</span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#004E72]/40 text-[#F9F9F9]/80 border border-[#F9F9F9]/10">
              v1.0
            </span>
          </div>
          {subtitle && (
            <span className="text-[11px] text-[#F9F9F9]/60 tracking-normal font-normal">
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
