export default function ScreenTitle({
  title,
  level = "h1",
  eyebrow,
  description,
  className,
}: {
  title: string
  level?: "h1" | "h2" | "h3"
  eyebrow?: string
  description?: string
  className?: string
}) {
  const Heading = level
  const hasSupportingContent =
    eyebrow !== undefined || description !== undefined
  const heading = (
    <Heading className={hasSupportingContent ? undefined : className}>
      {title}
    </Heading>
  )

  if (!hasSupportingContent) return heading

  return (
    <div className={className}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {heading}
      {description !== undefined && <p>{description}</p>}
    </div>
  )
}
