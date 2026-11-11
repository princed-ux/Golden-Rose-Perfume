export function BottleArt({ variant = 1 }: { variant?: 1 | 2 | 3 }) {
  return (
    <div className={`bottle-art bottle-art--${variant}`} aria-label="Stylized fragrance bottle illustration" role="img">
      <span className="bottle-art__glow" />
      <span className="bottle-art__cap" />
      <span className="bottle-art__neck" />
      <span className="bottle-art__body">
        <span className="bottle-art__label">GOLDEN ROSE<span>PARFUM</span></span>
      </span>
      <span className="bottle-art__shadow" />
    </div>
  );
}

