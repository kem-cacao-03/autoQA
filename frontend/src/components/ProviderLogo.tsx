/**
 * Official brand logo SVGs for each LLM provider.
 * Used wherever provider icons are displayed.
 */

export function ProviderLogo({
  provider,
  className = "w-4 h-4",
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case "openai":
      return (
        // OpenAI "bloom" logo
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="OpenAI">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zm-9.022 12.61a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95A4.5 4.5 0 0 1 3.6 18.304zm-1.26-10.408a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.371 2.019-1.168a.076.076 0 0 1 .072 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.402-.679zm2.008-3.014l-.141-.085-4.774-2.753a.776.776 0 0 0-.785 0L9.409 8.283V5.95a.071.071 0 0 1 .028-.063l4.83-2.786a4.5 4.5 0 0 1 6.678 4.632zm-12.61 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681v6.731zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5v-2.999z" />
        </svg>
      );

    case "gemini":
      return (
        // Google Gemini 4-pointed star
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Gemini">
          <path d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12" />
        </svg>
      );

    case "claude":
      return (
        // Anthropic / Claude starburst logo — 13 radiating rays
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Claude">
          <g transform="translate(12,12)">
            {Array.from({ length: 13 }, (_, i) => (
              <rect
                key={i}
                x="-1.15"
                y="-10.5"
                width="2.3"
                height="7.2"
                rx="1.15"
                transform={`rotate(${(i * 360) / 13})`}
              />
            ))}
          </g>
        </svg>
      );

    default:
      return null;
  }
}
