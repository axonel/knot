import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  subtitle?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
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
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-label="Threadline logo"
      >
        {/* Background rounded base for crisp contrast on dark surfaces */}
        <rect width="48" height="48" rx="10" fill="#092634" />
        <rect
          width="47"
          height="47"
          x="0.5"
          y="0.5"
          rx="9.5"
          stroke="#F9F9F9"
          strokeOpacity="0.08"
        />

        {/* Lower Communication Thread (Orange to Blue flow) */}
        <path
          d="M34 24C34 30.5 29 33 24 33C18 33 14 28 14 24"
          stroke="#FF6E42"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Upper Communication Thread (Blue to Orange flow) */}
        <path
          d="M14 24C14 17.5 19 15 24 15C30 15 34 20 34 24"
          stroke="#004E72"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Central Nexus Intersection: Shared Threadline knot */}
        <line
          x1="21"
          y1="24"
          x2="27"
          y2="24"
          stroke="#F9F9F9"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1 3"
        />

        {/* Agent 1 Node (Left: Primary Blue with White Center) */}
        <circle cx="14" cy="24" r="5.5" fill="#004E72" stroke="#F9F9F9" strokeWidth="1.5" />
        <circle cx="14" cy="24" r="2" fill="#F9F9F9" />

        {/* Agent 2 Node (Right: Accent Orange with White Center) */}
        <circle cx="34" cy="24" r="5.5" fill="#FF6E42" stroke="#F9F9F9" strokeWidth="1.5" />
        <circle cx="34" cy="24" r="2" fill="#F9F9F9" />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-tight text-white text-base">Threadline</span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#004E72]/40 text-[#F9F9F9]/80 border border-[#F9F9F9]/10">
              Dev
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
