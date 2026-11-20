import React from 'react';

interface DesktopCommanderLogoProps {
  className?: string;
  size?: number;
}

export const DesktopCommanderLogo: React.FC<DesktopCommanderLogoProps> = ({
  className = '',
  size = 32,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="Desktop Commander icon"
    >
      {/* Background terminal panel */}
      <rect width="32" height="32" rx="7" fill="#092634" />
      <rect width="31" height="31" x="0.5" y="0.5" rx="6.5" stroke="#F9F9F9" strokeOpacity="0.1" />

      {/* Terminal Title Bar Divider */}
      <line x1="4" y1="8.5" x2="28" y2="8.5" stroke="#F9F9F9" strokeOpacity="0.12" />

      {/* Terminal Dots */}
      <circle cx="7" cy="5.5" r="1.25" fill="#FF6E42" />
      <circle cx="10.5" cy="5.5" r="1.25" fill="#004E72" />
      <circle cx="14" cy="5.5" r="1.25" fill="#F9F9F9" fillOpacity="0.4" />

      {/* Terminal command prompt chevron '>' */}
      <path
        d="M8 14L13 18L8 22"
        stroke="#F9F9F9"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Terminal cursor underscore '_' */}
      <line
        x1="16"
        y1="22"
        x2="21"
        y2="22"
        stroke="#004E72"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Remote wireless broadcast signal rays */}
      <path
        d="M21 13C23 14.5 24 16.5 24 19"
        stroke="#FF6E42"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M24 11C26.5 13 27.5 15.8 27.5 19"
        stroke="#FF6E42"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
    </svg>
  );
};
