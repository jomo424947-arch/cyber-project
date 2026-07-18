---
name: Sentinels Enterprise
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bcc8d1'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#86929a'
  outline-variant: '#3d484f'
  surface-tint: '#75d1ff'
  primary: '#92d9ff'
  on-primary: '#003548'
  primary-container: '#00c2ff'
  on-primary-container: '#004c66'
  inverse-primary: '#006688'
  secondary: '#c3c0ff'
  on-secondary: '#1d00a5'
  secondary-container: '#3626ce'
  on-secondary-container: '#b3b1ff'
  tertiary: '#ffc58d'
  on-tertiary: '#4a2800'
  tertiary-container: '#ff9e2a'
  on-tertiary-container: '#693b00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c2e8ff'
  primary-fixed-dim: '#75d1ff'
  on-primary-fixed: '#001e2b'
  on-primary-fixed-variant: '#004d67'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#ffdcbe'
  tertiary-fixed-dim: '#ffb871'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6a3c00'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  bg-main: '#0A0A0A'
  bg-elevated: '#181818'
  success: '#22C55E'
  warning: '#F59E0B'
  danger: '#EF4444'
  text-high: '#FFFFFF'
  text-medium: '#A1A1AA'
  text-disabled: '#71717A'
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.1em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-page: 32px
  card-padding: 24px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style

The design system is engineered for a high-fidelity, enterprise-grade cybersecurity environment. It prioritizes a sense of impenetrable security, absolute precision, and futuristic sophistication. The aesthetic sits at the intersection of **Corporate Modern** and **Glassmorphism**, leveraging an "Ultra-Dark" environment to reduce eye strain during long monitoring sessions while highlighting critical data through luminous accents.

The emotional response should be one of "Command and Control"—the user is an operator in a high-stakes environment, supported by a system that is both luxurious and technically superior. Visual depth is achieved through translucent layering, subtle glow effects, and a rigorous 8px grid that reinforces structural integrity.

## Colors

The palette is anchored by an **Ultra-Dark** background architecture to maximize the contrast of functional elements. 

- **Primary Cyan (#00C2FF):** Used for interactive triggers, active security states, and primary focus indicators. It should be applied with a subtle outer glow (4px-8px spread) to simulate a digital display.
- **Secondary Indigo (#4F46E5):** Used for depth in gradients, secondary actions, and identifying system-level background processes.
- **Surface Hierarchy:** The system uses three tiers of darkness (`#0A0A0A` for base, `#111111` for cards, and `#181818` for floating modals or popovers) to create depth without relying on traditional drop shadows.
- **Semantic Logic:** Success, Warning, and Danger colors are used strictly for status indicators and data alerts to prevent visual noise.

## Typography

The typography system balances technical precision with high readability. 

- **Headlines:** Space Grotesk provides a geometric, futuristic feel that echoes the security theme while maintaining enterprise professionalism. 
- **Body:** Inter is the workhorse for all interface text, chosen for its exceptional legibility in dark mode and high-density data environments.
- **Technical Labels:** JetBrains Mono is used for IDs, timestamps, status labels, and any data visualization where character alignment is critical. 
- **Scale:** On mobile devices, `headline-lg` scales down to 24px to ensure headers do not wrap awkwardly. All labels and data mono text remain consistent across devices for technical clarity.

## Layout & Spacing

This design system utilizes a **12-column fixed grid** on desktop (1440px max-width) and a **fluid 4-column grid** on mobile. 

- **Grid Rhythm:** All spacing is derived from a strict 8px base unit. Component internal padding should alternate between 16px (2 units) and 24px (3 units) to maintain a dense, information-rich environment typical of security dashboards.
- **Gutters:** Gutters are fixed at 24px to ensure distinct separation between data-heavy cards.
- **Breakpoints:**
    - Desktop: 12 columns, 32px margins.
    - Tablet: 8 columns, 24px margins.
    - Mobile: 4 columns, 16px margins.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism** rather than traditional black shadows.

- **The Layering Model:**
    - **Level 0 (Base):** #0A0A0A — The application canvas.
    - **Level 1 (Card/Surface):** #111111 — Primary content containers. These feature a 1px border at 10% white opacity and a subtle 4px backdrop blur.
    - **Level 2 (Elevated):** #181818 — Hover states, modals, and tooltips. These include a "Inner Glow" effect: a 1px top border of 20% Primary Cyan to simulate overhead lighting.
- **Shadows:** Where used for extreme depth (e.g., global modals), shadows should be ultra-diffused, using the base background color (#0A0A0A) at 80% opacity with a 40px blur.

## Shapes

The shape language is "Soft-Tech." It avoids the clinical harshness of sharp corners while maintaining a structured, masculine feel.

- **Global Radius:** A 12px (0.75rem) radius is the standard for cards and major containers.
- **Component Radius:** Buttons and input fields use a consistent 8px (0.5rem) radius.
- **Active Indicators:** Vertical indicators in sidebars or tabs use a 2px "pill" rounding to emphasize verticality and flow.

## Components

### Buttons
- **Primary:** Gradient fill (Primary Cyan to Secondary Indigo, 135deg). White text (High emphasis). 8px glow on hover.
- **Secondary:** Ghost style. 1px Primary Cyan border. Transparent background. Fill with 10% Cyan on hover.
- **Danger:** Solid #EF4444 with subtle red glow.

### Cards
- **Style:** Background #111111, 1px border (White @ 10% opacity), 12px border-radius.
- **Interaction:** On hover, the border opacity increases to 30% and the inner background shifts to #181818.

### Inputs
- **Base:** Background #0A0A0A, 1px border (#71717A).
- **Focus State:** Border changes to Primary Cyan with a 4px outer glow. Label shifts to Primary Cyan.

### Sidebar
- **Slim Profile:** 72px width when collapsed, 240px when expanded.
- **Active State:** A vertical Primary Cyan line (2px wide) on the left edge of the active item, accompanied by a subtle cyan-to-transparent background gradient.

### Tables
- **Header:** Background #181818, text `label-caps`. 
- **Rows:** Thin 1px border-bottom (#181818). No alternate row striping; use hover highlight (#181818) instead.

### Charts
- **Area Fills:** Use 10% opacity versions of the accent colors.
- **Grid Lines:** Minimal, using #181818. Data points should have a small "bloom" effect using the point's stroke color.