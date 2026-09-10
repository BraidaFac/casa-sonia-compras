/**
 * Design tokens for bank promotions.
 *
 * PROMO_TOKENS_PDF  — hardcoded light values for pdf-lib (no CSS vars there)
 * PROMO_TOKENS_PAGE — CSS var references aligned to app dark theme
 */

/** PDF generation — always light (for print/paper) */
export const PROMO_TOKENS_PDF = {
  accent:       "#B5563C",
  accentBg:     "rgba(181,86,60,0.08)",
  accentBorder: "rgba(181,86,60,0.22)",
  pageBg:       "#F7F7F8",
  headerBg:     "#0D0D0D",
  cardBg:       "#FFFFFF",
  cardBorder:   "#E5E7EB",
  text1:        "#111827",
  text2:        "#6B7280",
  text3:        "#9CA3AF",
  sectionLine:  "#D1D5DB",
} as const;

/** Page UI — dark theme, matches app CSS vars (theme.css + Mantine amber) */
export const PROMO_TOKENS_PAGE = {
  accent:       "var(--accent)",         // #d97706 amber
  accentBg:     "var(--accent-bg)",      // rgba(217,119,6,0.1)
  accentBorder: "rgba(217,119,6,0.28)",
  pageBg:       "var(--bg)",             // #1c1917
  headerBg:     "var(--surface2)",       // #2c2a27
  cardBg:       "var(--surface)",        // #242220
  cardBorder:   "var(--border)",         // #3a3835
  text1:        "var(--text)",           // #f5f0eb
  text2:        "var(--text2)",          // #a89880
  text3:        "var(--text3)",          // #6b5e52
  sectionLine:  "var(--border)",         // #3a3835
} as const;

/** @deprecated use PROMO_TOKENS_PDF for pdf-lib, PROMO_TOKENS_PAGE for UI */
export const PROMO_TOKENS = PROMO_TOKENS_PDF;
