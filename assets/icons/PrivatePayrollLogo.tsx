interface LogoProps {
  size?: number;
  variant?: 'default' | 'alt' | 'minimal' | 'shield';
  className?: string;
}

export const PrivatePayrollLogo = ({ size = 48, variant = 'default', className }: LogoProps) => {
  const logos = {
    default: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="20" fill="#00D395"/>
        <circle cx="24" cy="24" r="16" fill="none" stroke="#00A676" strokeWidth="1.5"/>
        <rect x="8" y="19" width="32" height="10" fill="#003D29"/>
        <rect x="12" y="22" width="6" height="4" fill="#00D395"/>
        <rect x="30" y="22" width="6" height="4" fill="#00D395"/>
        <path d="M19 22 L22 22 L19 26 L22 26" stroke="#00FFB2" strokeWidth="1.25" strokeLinecap="square" fill="none"/>
        <path d="M26 22 L26 26 M28 22 L26 24 L28 26" stroke="#00FFB2" strokeWidth="1.25" strokeLinecap="square" fill="none"/>
      </svg>
    ),

    // Hexagonal crypto coin
    alt: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <polygon points="24,4 42,14 42,34 24,44 6,34 6,14" fill="#00D395"/>
        <polygon points="24,8 38,16 38,32 24,40 10,32 10,16" fill="none" stroke="#003D29" strokeWidth="1.5"/>
        <polygon points="6,20 42,20 42,28 6,28" fill="#003D29"/>
        <rect x="12" y="22" width="7" height="4" fill="#00FFB2"/>
        <rect x="29" y="22" width="7" height="4" fill="#00FFB2"/>
        <path d="M24 32 L24 36 M21 33 L27 33 Q28 33 28 34 Q28 35 24 35 Q20 35 20 36 Q20 37 21 37 L27 37" stroke="#00A676" strokeWidth="1" fill="none"/>
      </svg>
    ),

    // Bandana style - raised mask like a bandit
    minimal: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="20" fill="#00D395"/>
        <path d="M4 15 L44 15 L44 25 L4 25 Z" fill="#003D29"/>
        <rect x="12" y="18" width="24" height="4" rx="0" fill="#00FFB2"/>
        <circle cx="18" cy="20" r="1.5" fill="#003D29"/>
        <circle cx="24" cy="20" r="1.5" fill="#003D29"/>
        <circle cx="30" cy="20" r="1.5" fill="#003D29"/>
      </svg>
    ),

    // Shield with masked coin
    shield: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path d="M24 4 L42 10 L42 26 Q42 38 24 44 Q6 38 6 26 L6 10 Z" fill="#00D395"/>
        <path d="M24 8 L38 13 L38 26 Q38 35 24 40 Q10 35 10 26 L10 13 Z" fill="none" stroke="#003D29" strokeWidth="1.5"/>
        <circle cx="24" cy="24" r="10" fill="#003D29"/>
        <rect x="16" y="22" width="16" height="4" fill="#00FFB2"/>
        <rect x="22" y="23" width="4" height="2" fill="#003D29"/>
      </svg>
    ),
  };

  return logos[variant];
};

// Color exports for consistency across the app
export const privatePayrollColors = {
  primary: '#00D395',      // Crypto green
  primaryDark: '#00A676',  // Darker green
  accent: '#00FFB2',       // Bright green glow
  mask: '#003D29',         // Dark green (mask/privacy)
} as const;
