import type { ReactNode } from "react"

export type StickerKind = "dashboard" | "wallet" | "statement" | "collect" | "link" | "transfer" | "bank" | "merchant" | "kyb" | "team" | "branding" | "notification" | "security" | "developer" | "support" | "qr" | "crypto" | "pending" | "toolbox"

const illustrations: Record<StickerKind, ReactNode> = {
  dashboard: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <rect x="9" y="30" width="15" height="23" rx="6" fill="#4385f5" />
      <rect x="25" y="18" width="16" height="35" rx="6" fill="#37b98a" />
      <rect x="42" y="9" width="14" height="44" rx="6" fill="#ffb940" />
      <path
        d="m13 26 9-7 9 2 12-10"
        fill="none"
        stroke="#2854a3"
        strokeWidth="3.5"
      />
      <path d="m39 11 5-1-1 5" fill="none" stroke="#2854a3" strokeWidth="3.5" />
    </g>
  ),
  wallet: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="M12 18a6 6 0 0 1 6-6h31a5 5 0 0 1 5 5v5H17a5 5 0 0 0-5 5z"
        fill="#5994ed"
      />
      <path
        d="M12 23h39a4 4 0 0 1 4 4v20a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z"
        fill="#3569bd"
      />
      <path d="M39 31h16v13H39a6 6 0 0 1 0-13z" fill="#f5c34e" />
      <circle cx="44" cy="37.5" r="1.8" fill="#8a5a18" stroke="none" />
    </g>
  ),
  statement: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="M16 8h24l12 12v35H16a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5z"
        fill="#f7fbff"
      />
      <path d="M40 8v12h12" fill="#b9ddff" />
      <path
        d="M20 29h21M20 37h21M20 45h13"
        fill="none"
        stroke="#4d7ab7"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <circle cx="46" cy="45" r="9" fill="#f5c34e" />
      <path
        d="M46 40v10m3-8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-4"
        fill="none"
        stroke="#8a5a18"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </g>
  ),
  collect: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <circle cx="39" cy="21" r="16" fill="#f5bd3f" />
      <path
        d="M39 12v18m5-14h-6a3 3 0 0 0 0 6h3a3 3 0 0 1 0 6h-6"
        fill="none"
        stroke="#895b17"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <path
        d="M8 39c7-8 12-10 18-7l10 5 9 1a5 5 0 0 1 0 10H30l-8 7-14-6z"
        fill="#4385f5"
      />
      <path
        d="m20 37 10 5m-8 2 8 4"
        fill="none"
        stroke="#c7e4ff"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </g>
  ),
  link: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <g transform="rotate(-42 26 33)">
        <rect x="13" y="20" width="20" height="28" rx="10" fill="#4385f5" />
        <path
          d="M18 34h10"
          fill="none"
          stroke="#c7e4ff"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </g>
      <g transform="rotate(-42 39 31)">
        <rect x="31" y="14" width="20" height="28" rx="10" fill="#f17c65" />
        <path
          d="M36 28h10"
          fill="none"
          stroke="#ffe0d8"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </g>
    </g>
  ),
  transfer: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="m13 22 8-8 8 8M21 15v20"
        fill="none"
        stroke="#4385f5"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="m51 42-8 8-8-8m8 7V29"
        fill="none"
        stroke="#f17c65"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <rect
        x="25"
        y="25"
        width="18"
        height="14"
        rx="4"
        transform="rotate(-8 34 32)"
        fill="#f5bd3f"
      />
      <path
        d="M30 32h8"
        fill="none"
        stroke="#895b17"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </g>
  ),
  bank: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path d="m7 23 25-15 25 15z" fill="#4385f5" />
      <path d="M12 26h40v5H12z" fill="#f5bd3f" />
      <path d="M16 32h7v17h-7zm12 0h8v17h-8zm13 0h7v17h-7z" fill="#fff" />
      <path d="M10 51h44v5H10z" fill="#37b98a" />
    </g>
  ),
  merchant: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path d="M13 25h38v29H13z" fill="#f6f9ff" />
      <path
        d="m10 24 6-14h32l6 14a6 6 0 0 1-11 3 6 6 0 0 1-11 0 6 6 0 0 1-11 0 6 6 0 0 1-11-3z"
        fill="#f17c65"
      />
      <path
        d="M19 11h8l-1 17a6 6 0 0 1-11 0zm16 0h8l4 17a6 6 0 0 1-11 0z"
        fill="#ffd166"
      />
      <path d="M29 37h10v17H29z" fill="#4385f5" />
      <path d="M17 35h8v8h-8z" fill="#b9ddff" />
    </g>
  ),
  kyb: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <rect x="8" y="12" width="43" height="39" rx="8" fill="#4385f5" />
      <circle cx="23" cy="27" r="7" fill="#ffd166" />
      <path d="M12 44a11 11 0 0 1 22 0" fill="#f17c65" />
      <path
        d="M36 24h10m-10 7h8"
        fill="none"
        stroke="#d8edff"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <circle cx="47" cy="45" r="11" fill="#37b98a" />
      <path
        d="m42 45 4 4 7-8"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </g>
  ),
  team: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <circle cx="32" cy="20" r="9" fill="#f5bd3f" />
      <circle cx="15" cy="27" r="7" fill="#f17c65" />
      <circle cx="49" cy="27" r="7" fill="#4385f5" />
      <path d="M17 49a15 15 0 0 1 30 0v5H17z" fill="#4385f5" />
      <path d="M5 49a10 10 0 0 1 17-7m37 7a10 10 0 0 0-17-7" fill="#37b98a" />
    </g>
  ),
  branding: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="M31 8C17 8 8 18 8 31c0 14 11 25 25 25h6a8 8 0 0 0 6-13 6 6 0 0 1 5-10C58 33 53 8 31 8z"
        fill="#f17c65"
      />
      <circle cx="20" cy="25" r="4" fill="#f5bd3f" />
      <circle cx="31" cy="18" r="4" fill="#4385f5" />
      <circle cx="42" cy="23" r="4" fill="#37b98a" />
      <circle cx="22" cy="39" r="4" fill="#b984e8" />
    </g>
  ),
  notification: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path d="M16 43h32l-4-6V26a12 12 0 0 0-24 0v11z" fill="#f5bd3f" />
      <path d="M26 48a6 6 0 0 0 12 0" fill="#f17c65" />
      <path
        d="M32 8v5m-20 8 4 3m32-3-4 3"
        fill="none"
        stroke="#4385f5"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </g>
  ),
  security: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="m32 7 21 8v15c0 14-9 23-21 29C20 53 11 44 11 30V15z"
        fill="#4385f5"
      />
      <path
        d="m21 32 7 7 15-17"
        fill="none"
        stroke="#d9ffd9"
        strokeLinecap="round"
        strokeWidth="5"
      />
    </g>
  ),
  developer: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path d="M11 12h42v31H11z" fill="#3569bd" />
      <path d="M7 46h50l-5 7H12z" fill="#f5bd3f" />
      <path
        d="m25 21-7 6 7 6m14-12 7 6-7 6m-4-12-5 14"
        fill="none"
        stroke="#d8edff"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </g>
  ),
  support: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="M12 34v-5a20 20 0 0 1 40 0v5"
        fill="none"
        stroke="#4385f5"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <rect x="8" y="30" width="12" height="19" rx="6" fill="#f17c65" />
      <rect x="44" y="30" width="12" height="19" rx="6" fill="#37b98a" />
      <path
        d="M49 48c-2 8-8 9-16 9"
        fill="none"
        stroke="#4385f5"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <circle cx="31" cy="57" r="3" fill="#f5bd3f" />
    </g>
  ),
  qr: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <rect x="8" y="8" width="21" height="21" rx="4" fill="#4385f5" />
      <rect x="35" y="8" width="21" height="21" rx="4" fill="#f17c65" />
      <rect x="8" y="35" width="21" height="21" rx="4" fill="#37b98a" />
      <path
        d="M15 15h7v7h-7zm27 0h7v7h-7zM15 42h7v7h-7zm20-6h7v7h-7zm9 7h4v4h-4zm-9 8h6v5h-6zm14-11h7v8h-7z"
        fill="#fff"
      />
    </g>
  ),
  crypto: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <circle cx="32" cy="32" r="24" fill="#f5bd3f" />
      <circle
        cx="32"
        cy="32"
        r="17"
        fill="none"
        stroke="#fff0bd"
        strokeWidth="2"
      />
      <path
        d="M30 18v28m5-26h-8a5 5 0 0 0 0 10h7a5 5 0 0 1 0 10h-9"
        fill="none"
        stroke="#895b17"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </g>
  ),
  pending: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="M19 9h26m-26 46h26M22 11c0 11 4 15 10 21-6 6-10 10-10 21m20-42c0 11-4 15-10 21 6 6 10 10 10 21"
        fill="none"
        stroke="#4385f5"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="M25 14h14l-2 11-5 5-5-5zm0 36h14l-2-10-5-5-5 5z"
        fill="#f5bd3f"
      />
      <circle cx="49" cy="17" r="8" fill="#f17c65" />
    </g>
  ),
  toolbox: (
    <g stroke="#fff" strokeLinejoin="round" strokeWidth="3">
      <path
        d="M22 16v-5a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v5"
        fill="none"
        stroke="#4385f5"
        strokeWidth="5"
      />
      <path
        d="M8 20a5 5 0 0 1 5-5h38a5 5 0 0 1 5 5v28a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"
        fill="#f5bd3f"
      />
      <path d="M8 30h48v10H8z" fill="#f17c65" />
      <path d="M27 29h10v12H27z" fill="#4385f5" />
      <path
        d="M17 47h4m22 0h4"
        fill="none"
        stroke="#895b17"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </g>
  ),
}

export default function StickerIcon({
  kind,
  size = 56,
}: {
  kind: StickerKind
  size?: number
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
    >
      {illustrations[kind]}
    </svg>
  )
}
