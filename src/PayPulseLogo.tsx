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
  return (
    <span className={`paypulse-logo ${className}`.trim()}>
      <svg
        className="paypulse-logo-mark"
        viewBox="0 0 368 368"
        role="img"
        aria-label={showName ? undefined : "PayPulse"}
        aria-hidden={showName ? true : undefined}
      >
        <rect width="368" height="368" rx="104" fill="#1D4ED8" />
        <circle cx="292" cy="76" r="58" fill="#39D3C3" opacity=".18" />
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
