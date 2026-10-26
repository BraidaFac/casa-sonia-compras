# Casa Sonia Compras — Design System

## Theme

App-wide **dark theme**. Mantine configured with `defaultColorScheme="dark"`, `primaryColor: "amber"`.

---

## CSS Variables (`src/styles/theme.css`)

### Backgrounds
| Var | Value | Use |
|-----|-------|-----|
| `--bg` | `#1c1917` | Page background |
| `--surface` | `#242220` | Card / panel background |
| `--surface2` | `#2c2a27` | Elevated surface (modals, headers) |
| `--surface3` | `#343230` | Highest elevation |

### Borders
| Var | Value |
|-----|-------|
| `--border` | `#3a3835` |
| `--border2` | `#4a4845` |

### Text
| Var | Value | Use |
|-----|-------|-----|
| `--text` | `#f5f0eb` | Primary text |
| `--text2` | `#a89880` | Secondary / label text |
| `--text3` | `#6b5e52` | Muted / placeholder text |

### Accent (amber)
| Var | Value | Use |
|-----|-------|-----|
| `--accent` | `#d97706` | Primary action, highlights |
| `--accent2` | `#b45309` | Hover / pressed state |
| `--accent-bg` | `rgba(217,119,6,0.1)` | Tinted badge/pill background |

### Semantic
| Var | Value |
|-----|-------|
| `--red` | `#ef4444` |
| `--green` | `#22c55e` |

---

## Mantine Color Aliases

Mantine maps its `dark` palette to the app's stone scale:

| Index | Value |
|-------|-------|
| `dark[0]` | `#f5f0eb` |
| `dark[1]` | `#a89880` |
| `dark[2]` | `#6b5e52` |
| `dark[3]` | `#4a4845` |
| `dark[4]` | `#3a3835` |
| `dark[5]` | `#343230` |
| `dark[6]` | `#2c2a27` |
| `dark[7]` | `#242220` |
| `dark[8]` | `#1c1917` |
| `dark[9]` | `#0f0e0c` |

Mantine Amber palette follows Tailwind amber scale (`amber[5]` = `#f59e0b`, `amber[6]` = `#d97706`).

---

## Typography

| Role | Font | CSS Var |
|------|------|---------|
| Display / headings | Syne | `var(--font-display)` |
| Body / UI | DM Sans | `var(--font-sans)` |
| Code / mono | DM Mono | `var(--font-mono)` |

---

## Promotion Tokens (`src/lib/promoTokens.ts`)

Two separate sets — **never mix them**:

### `PROMO_TOKENS_PAGE` — UI (dark, CSS vars)
Use in React components. Resolves at runtime via CSS vars.
```ts
accent:       "var(--accent)"      // amber
accentBg:     "var(--accent-bg)"
cardBg:       "var(--surface)"
cardBorder:   "var(--border)"
text1:        "var(--text)"
text2:        "var(--text2)"
text3:        "var(--text3)"
pageBg:       "var(--bg)"
headerBg:     "var(--surface2)"
sectionLine:  "var(--border)"
```

### `PROMO_TOKENS_PDF` — PDF generation (light, hardcoded hex)
Use only in `pdfPromociones.ts`. pdf-lib cannot resolve CSS vars.
Light scheme (white paper): accent `#B5563C` terracotta, `#FFFFFF` card background.
