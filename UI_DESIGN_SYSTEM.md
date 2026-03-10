# UI Design System

## Style Guide & Specification

**AI 漫剧生成平台**
Soft Minimal / Clean Neutral Style

Version 1.0 · March 2026

---

## 1. Design Philosophy 设计哲学

This design system follows the **Soft Minimal / Clean Neutral** aesthetic, inspired by products like Lovart, Notion, and Linear. The core principle is: **let the content breathe**.

### Core Principles

- **Content First** — The generated comics and artwork are the visual center; UI elements recede into the background.
- **Calm & Airy** — Generous whitespace, muted tones, and minimal visual noise create a focused creative environment.
- **Low Contrast Chrome** — Navigation, toolbars, and controls use neutral grays. Strong contrast is reserved for user content and primary CTAs.
- **Warm Neutrals** — The palette is not cold/clinical; a subtle warm undertone (amber/gold accent) adds personality.
- **Consistent Restraint** — Every decorative element must earn its place. If it doesn't aid comprehension or delight, remove it.

### Design Keywords (for AI prompting)

soft minimal, clean neutral, airy, calm, content-first, generous whitespace, muted palette, warm accent, rounded corners, no harsh shadows, quiet chrome, modern SaaS aesthetic

---

## 2. Color System 色彩系统

The color palette is intentionally restrained. ~90% of the interface should be neutral tones (white/gray/black). Color is used sparingly for emphasis, status, and brand identity.

### 2.1 Neutral Palette

| Token | Hex | Usage |
|-------|-----|-------|
| white | `#FFFFFF` | Page background, card background (primary) |
| gray-50 | `#FAFAFA` | Subtle section background, hover state on white |
| gray-100 | `#F5F5F5` | Card surface, input field background, empty state |
| gray-200 | `#E8E8E8` | Dividers, borders, separator lines |
| gray-300 | `#D4D4D4` | Disabled state borders, secondary dividers |
| gray-400 | `#A3A3A3` | Placeholder text, disabled text |
| gray-500 | `#737373` | Secondary text, metadata, timestamps |
| gray-600 | `#525252` | Body text (standard) |
| gray-800 | `#262626` | Headings, primary text |
| gray-900 | `#111111` | High-emphasis text, primary button fill |

### 2.2 Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| amber-500 | `#F5A623` | Primary accent: upgrade badges, premium features |
| amber-50 | `#FFF8E1` | Accent background: banners, highlight cards |
| amber-200 | `#E8D5B0` | Accent border, subtle highlight rings |

### 2.3 Semantic / Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| success | `#22C55E` | Success states, completed generation |
| error | `#EF4444` | Error states, destructive actions |
| info | `#3B82F6` | Information, links, active/selected state |
| warning | `#F59E0B` | Warnings, credit running low |

### 2.4 CSS Variables

```css
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFAFA;
  --bg-surface: #F5F5F5;
  --border-default: #E8E8E8;
  --text-primary: #262626;
  --text-secondary: #737373;
  --text-tertiary: #A3A3A3;
  --accent-primary: #F5A623;
  --accent-bg: #FFF8E1;
  --btn-primary-bg: #111111;
  --btn-primary-text: #FFFFFF;
}
```

---

## 3. Typography 字体规范

```css
font-family: 'Inter', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
```

### 3.1 Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| display | 32px / 2rem | 700 Bold | 40px / 1.25 | Hero headings, page title |
| heading-1 | 24px / 1.5rem | 600 Semi | 32px / 1.33 | Section headings |
| heading-2 | 20px / 1.25rem | 600 Semi | 28px / 1.4 | Subsection headings |
| heading-3 | 16px / 1rem | 600 Semi | 24px / 1.5 | Card titles, labels |
| body | 14px / 0.875rem | 400 Regular | 22px / 1.57 | Default body text |
| body-sm | 13px / 0.8125rem | 400 Regular | 20px / 1.54 | Secondary text, metadata |
| caption | 12px / 0.75rem | 400 Regular | 16px / 1.33 | Timestamps, help text |
| label | 12px / 0.75rem | 500 Medium | 16px / 1.33 | Form labels, badges |

### 3.2 Text Color Pairing

- **Primary text** (headings, important): `--text-primary` (#262626)
- **Secondary text** (body, descriptions): `--text-secondary` (#737373)
- **Tertiary text** (placeholders, hints): `--text-tertiary` (#A3A3A3)
- **On dark surface** (primary button text): `#FFFFFF`

### 3.3 Rules

- Never use pure black (`#000000`) for text; use `#111111` or `#262626` for softer contrast.
- Chinese text may need +1px size or +2px line-height bump for readability at body-sm and caption sizes.

---

## 4. Spacing & Layout 间距与布局

8px base grid. All spacing values should be multiples of 4px, with 8px as the primary unit.

### 4.1 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| space-1 | 4px | Minimal gap: icon-to-text, inline elements |
| space-2 | 8px | Tight spacing: between related items |
| space-3 | 12px | Default internal padding for small components |
| space-4 | 16px | Standard padding: cards, inputs, buttons |
| space-5 | 20px | Gap between card content sections |
| space-6 | 24px | Card internal padding, section gaps |
| space-8 | 32px | Between card groups, major section spacing |
| space-10 | 40px | Page section padding |
| space-12 | 48px | Large section breaks |
| space-16 | 64px | Page top/bottom margin, hero spacing |

### 4.2 Page Layout

- Max content width: **1280px** (xl breakpoint), centered
- Left sidebar: **64px** collapsed (icon-only)
- Page horizontal padding: **32px** (desktop), **16px** (mobile)
- Card grid gap: **24px**
- Card grid columns: `auto-fill, minmax(280px, 1fr)`

### 4.3 Sidebar Navigation

Collapsed icon-only pattern (64px wide). Each nav icon sits inside a **40px circular container**, vertically stacked with **8px gaps**. Active state uses a subtle ring or light background fill.

---

## 5. Border Radius 圆角规范

| Token | Value | Usage |
|-------|-------|-------|
| radius-sm | 6px | Badges, tags, small chips |
| radius-md | 8px | Buttons, inputs, dropdowns |
| radius-lg | 12px | Cards, modals, popovers |
| radius-xl | 16px | Large cards, image containers, hero sections |
| radius-full | 9999px | Circular icons, avatar containers, pills |

---

## 6. Shadows & Elevation 阴影与层次

Default state has **NO shadow**. Shadows are used only for floating elements.

| Token | CSS Value | Usage |
|-------|-----------|-------|
| shadow-none | none | Cards, buttons (default) |
| shadow-xs | `0 1px 2px rgba(0,0,0,0.04)` | Subtle card hover state |
| shadow-sm | `0 2px 8px rgba(0,0,0,0.06)` | Dropdowns, popovers |
| shadow-md | `0 4px 16px rgba(0,0,0,0.08)` | Modals, dialogs |
| shadow-lg | `0 8px 32px rgba(0,0,0,0.12)` | Full-screen overlays |

**Critical Rule**: Default card state has NO shadow and NO visible border. Cards are differentiated from the page background only by their fill color (`#F5F5F5` on white, or `#FFFFFF` on `#FAFAFA`).

---

## 7. Components 组件规范

### 7.1 Buttons

| Variant | Style | Usage |
|---------|-------|-------|
| Primary | bg: `#111111`, text: `#FFF`, radius: 8px, h: 40px, px: 20px | Main actions |
| Secondary | bg: `#F5F5F5`, text: `#262626`, radius: 8px, h: 40px, px: 20px | Secondary actions |
| Ghost | bg: transparent, text: `#737373`, radius: 8px, h: 40px, px: 16px | Tertiary |
| Accent | bg: `#F5A623`, text: `#FFF`, radius: 9999px, h: 36px, px: 20px | Premium/Upgrade CTA (pill) |

Hover: primary buttons darken slightly (bg: `#2a2a2a`). No shadow on hover. Transition: `all 150ms ease`.

### 7.2 Cards (Project Card)

- Background: `#F5F5F5` (or white on gray page background)
- Border: **none**
- Border radius: **16px**
- Shadow: **none** (shadow-xs on hover)
- Thumbnail aspect ratio: 4:3 or 16:9, overflow hidden
- Title: heading-3, color: `--text-primary`
- Subtitle/date: caption, color: `--text-tertiary`

### 7.3 Input Fields

- Background: `#F5F5F5`
- Border: `1px solid transparent` (`1px solid #E8E8E8` on focus)
- Border radius: **12px**
- Height: 48px (single line)
- Padding: `12px 16px`
- Focus ring: `2px solid rgba(245, 166, 35, 0.3)` — subtle amber glow

### 7.4 Modal / Dialog

- Overlay: `rgba(0, 0, 0, 0.4)`, `backdrop-filter: blur(4px)`
- Surface: white, radius: 16px, shadow-md, padding: 32px
- Max width: 480px (small) / 640px (medium) / 800px (large)

### 7.5 Badges & Tags

- Background: `#F5F5F5` or `#FFF8E1` (accent)
- Text: label (12px / 500)
- Radius: 6px (rectangular) or 9999px (pill)
- Padding: `4px 10px`

---

## 8. Icons 图标规范

Use **Lucide Icons** exclusively.

| Property | Value |
|----------|-------|
| Default size | 20px |
| Small size | 16px |
| Large size | 24px |
| Stroke width | 1.5px - 2px |
| Default color | `#737373` |
| Active color | `#111111` |

---

## 9. Motion & Animation 动效规范

| Property | Value | Usage |
|----------|-------|-------|
| duration-fast | 100ms | Button press, toggle |
| duration-normal | 150ms | Hover transitions, color changes |
| duration-slow | 250ms | Card expand, modal open/close |
| duration-gentle | 400ms | Page transitions, skeleton fade-in |
| easing | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard easing |

### Loading States

- Use **skeleton screens** (animated gray shimmer), not spinners
- Skeleton color: animate between `#F5F5F5` and `#EBEBEB`
- AI generation progress: subtle progress bar or pulse animation, amber accent

---

## 10. Anti-Patterns 禁止事项

- No gradients on backgrounds or buttons
- No colored/branded sidebar backgrounds (keep white/transparent)
- No box-shadow on cards in default state
- No visible borders on cards (use fill color to differentiate)
- No pure black (`#000000`) text
- No spinner loading indicators (use skeleton shimmer)
- No bright/saturated accent colors besides amber (`#F5A623`)
- No rounded-full on rectangular cards or buttons (only for icons/avatars/pills)
- No heavy font weights above 700
- No more than 2 font sizes visible in any single card component
