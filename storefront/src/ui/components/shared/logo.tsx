/**
 * Brand-aware visual mark. In multi-brand mode a missing uploaded logo uses the
 * brand name, never the generic Paper mark from another storefront.
 */
interface LogoProps {
  className?: string;
  ariaLabel?: string;
  inverted?: boolean;
  src?: string;
  invertedSrc?: string;
  fallbackText?: string;
}

export const Logo = ({
  className, ariaLabel, inverted = false, src, invertedSrc, fallbackText,
}: LogoProps) => {
  const selected = inverted ? (invertedSrc ?? src) : src;
  if (fallbackText && !selected) {
    return <span className={`inline-flex items-center font-semibold tracking-tight ${className ?? ""}`}>{fallbackText}</span>;
  }
  const imageSrc = selected ?? (inverted ? "/logo-dark.svg" : "/logo.svg");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageSrc} alt={ariaLabel ?? fallbackText ?? "Paper by Saleor"} width={100} height={23}
      className={`aspect-[100/23] ${className ?? ""}`} />
  );
};
