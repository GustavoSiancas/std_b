export const APP_NAME = "STD 2D";
export const APP_TAGLINE = "Sistema de Trámite Documentario";

/** Isotipo de STD 2D: dos hojas superpuestas, una por cada «D» (documento y dimensión). */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="8.5" y="2.5" width="11" height="14" rx="2.2" fill="currentColor" opacity=".45" />
      <path d="M6.7 7h6.1L17 11.2v7.6a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2V9.2A2.2 2.2 0 0 1 6.7 7Z" fill="currentColor" />
      <path d="M12.8 7v3.2c0 .55.45 1 1 1H17" stroke="#9cbcff" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7.4 14.2h6.2M7.4 17.4h4.2" stroke="#2a63dd" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Logotipo completo: isotipo + «STD 2D» con «2D» en acento, y opcionalmente el nombre descriptivo. */
export default function Brand({ tagline = APP_TAGLINE }: { tagline?: string | null }) {
  return (
    <div className="brand">
      <span className="brand-mark"><BrandMark /></span>
      <span className="brand-text">
        <span className="brand-name">STD <span>2D</span></span>
        {tagline && <small>{tagline}</small>}
      </span>
    </div>
  );
}
