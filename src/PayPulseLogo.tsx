import { useId } from "react"

type PayPulseLogoProps = {
  className?: string
  showName?: boolean
  nameClassName?: string
}

export default function PayPulseLogo({
  className = "",
  showName = false,
  nameClassName = "",
}: PayPulseLogoProps) {
  const gradientId = useId().replace(/:/g, "")

  return (
    <span className={`paypulse-logo ${className}`.trim()}>
      <svg
        className="paypulse-logo-mark"
        viewBox="0 0 368 368"
        role="img"
        aria-label={showName ? undefined : "PayPulse"}
        aria-hidden={showName ? true : undefined}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="30"
            y1="30"
            x2="338"
            y2="338"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#153B78" />
            <stop offset=".58" stopColor="#2457EB" />
            <stop offset="1" stopColor="#167E9E" />
          </linearGradient>
        </defs>
        <rect width="368" height="368" rx="104" fill={`url(#${gradientId})`} />
        <circle cx="292" cy="76" r="58" fill="#5AE1D2" opacity=".2" />
        <path
          d="M66 190h61l28-55 43 102 37-77 24 30h43"
          fill="none"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="23"
        />
        <circle cx="302" cy="190" r="13" fill="#72F0D8" />
      </svg>
      {showName && (
        <strong className={`paypulse-logo-name ${nameClassName}`.trim()}>
          <span>Pay</span>
          <span className="paypulse-wordmark-accent">Pulse</span>
        </strong>
      )}
    </span>
  )
}
