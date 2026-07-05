const BRAND_NAME = "Connectiqo";

export function BrandLogo({ size = 40, showText = true, className = "" }) {
  return (
    <div className={`brand-logo d-flex align-items-center gap-2 ${className}`}>
      <img
        src={`${import.meta.env.BASE_URL}logo.png`}
        alt={BRAND_NAME}
        width={size}
        height={size}
        className="brand-logo__img"
        style={{ width: size, height: size }}
      />
      {showText ? (
        <div className="brand-logo__text lh-sm">
          <span className="brand-logo__title d-block">{BRAND_NAME}</span>
          <span className="brand-logo__subtitle d-block">Admin Panel</span>
        </div>
      ) : null}
    </div>
  );
}

export { BRAND_NAME };
