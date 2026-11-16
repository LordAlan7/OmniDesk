---
name: Kinetic Enterprise Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464555'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#004598'
  on-tertiary: '#ffffff'
  tertiary-container: '#005cc6'
  on-tertiary-container: '#cedbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  title-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-3xs: 0.125rem
  space-2xs: 0.25rem
  space-xs: 0.375rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system serves an enterprise IT service management and knowledge orchestration platform. The visual personality blends the utilitarian speed and keyboard-first density of developer tools like Linear with the structural reliability of enterprise operations suites. 

### Target Audience & Psychological Response
- **Audience:** Site reliability engineers, IT support specialists, enterprise administrators, and cross-functional incident response teams.
- **Tone:** Authoritative, high-clarity, friction-reducing, and calm under crisis.
- **Emotional Response:** The interface must instill confidence during high-severity incidents, eliminate visual noise during ticket triage, and maintain ergonomic comfort during 8-hour shift cycles.

### Design Style
The system adopts an engineered **Corporate Minimalist** philosophy enhanced by precision density:
- **Surface Hierarchy:** Cool-slate canvases create low glare while anchoring bright white functional cards.
- **Structural Framing:** Crisp, 1px low-contrast borders organize heavy data tables, split-pane ticket inspectors, and nested knowledge base taxonomies without visual clutter.
- **Deep Contrast Navigation:** A dark slate control bar separates administrative navigation from incident workspace surfaces, creating an immediate spatial mental model.

## Colors

The palette is engineered around rapid optical parsing, high semantic fidelity, and reduced cognitive load during incident workflows.

### Primary & Brand Accents
- **Primary Indigo (`#4F46E5`):** Reserved for intentional user actions, primary interactive triggers, active tab indicators, and critical focus rings.
- **Electric Blue Accent (`#3B82F6`):** Secondary interactive actions, informational alerts, ticket links, and active filtering chips.

### Surface Architecture
- **Global App Canvas:** `#F8FAFC` (Slate-50) creates a soft, low-glare backdrop.
- **Sub-Workspace / Secondary Panes:** `#F1F5F9` (Slate-100) separates sidebars, filter trays, and table headers.
- **Card & Inspector Surfaces:** `#FFFFFF` (Pure White) houses primary data objects, modal content, and active forms.
- **Command Sidebar:** `#0F172A` (Slate-900) primary bar background, complemented by `#1E293B` (Slate-800) for hover/active flyouts and nested project trees.

### Semantic Status Tokens
Every status tier requires paired foreground, background, and stroke values for WCAG AAA accessibility:
- **Resolved / Stable / Done:** Foreground `#065F46`, Background `#ECFDF5`, Border `#A7F3D0` (Base: Emerald `#10B981`).
- **In Progress / Investigation / Pending:** Foreground `#92400E`, Background `#FFFBEB`, Border `#FDE68A` (Base: Amber `#F59E0B`).
- **Critical / P1 / Blocker:** Foreground `#991B1B`, Background `#FEF2F2`, Border `#FECACA` (Base: Crimson `#EF4444`).
- **Trivial / Backlog / Unassigned:** Foreground `#334155`, Background `#F1F5F9`, Border `#E2E8F0` (Base: Slate `#64748B`).

### Functional Line Work
- **Border Default:** `#E2E8F0` (Slate-200) for card shells, table dividers, and structural split panes.
- **Border Subtle:** `#F1F5F9` (Slate-100) for nested inner rows and list item dividers.
- **Border Strong:** `#CBD5E1` (Slate-300) for form controls and tab bars.

## Typography

Typography prioritizes scan speed, compact vertical rhythm, and clarity across multi-column data views.

### Font Pairings & Roles
- **Primary Interface Font:** `Inter` handles all structural levels from page headers to nested cell labels. It provides neutral, unopinionated forms that prevent eye fatigue during high-volume triage.
- **Monospaced Technical Font:** `JetBrains Mono` handles ticket identifiers (e.g., `INC-8942`), SLA countdown timers, IP addresses, log stack-traces, and keyboard shortcuts.

### Numerical Legibility & Tabular Figures
All tabular grids, SLA clocks, and quantitative dashboards must enforce the OpenType feature `tnum` (tabular figures) alongside `cv05` (lowercase l with tail) and `zero` (slashed zero) to prevent character confusion.

### Editorial Content (Knowledge Base)
Knowledge base documentation renders `body-lg` (16px/24px) constrained to a maximum content width of 720px for optimal reading retention.

## Layout & Spacing

The platform is designed desktop-first to support dense multi-column operational boards, while reflowing gracefully into consolidated master-detail views on narrower viewports.

### Layout Architecture
- **Global Shell:** A persistent 64px collapsed (or 240px expanded) dark vertical command sidebar on the left, an optional 280px filter/tree navigation sub-panel, and an adaptable main workspace.
- **Split-Pane Incident Inspector:** A flexible fluid master pane (table or kanban) paired with a persistent 400px–520px collapsible right-hand detail inspector for ticket resolution, telemetry, and activity logs.
- **Grid Structure:** Fluid grid system leveraging 8px baseline alignment with 16px default gutters (`gutter`). For ultra-dense incident logs and table rows, use `gutter-compact` (8px).

### Responsive Adaptation
- **Desktop (>= 1280px):** Full tri-pane view (Navigation + Master List + Detail Inspector).
- **Tablet / Laptop (768px - 1279px):** Sub-navigation collapses into an overlay drawer; detail inspector opens as a side-sheet layer over the primary list.
- **Mobile (< 768px):** Global sidebar collapses into a bottom or top navigation bar. Workspaces transition to a pure single-column stacked view with full-screen sheet modals for ticket edits.

## Elevation & Depth

Depth in this design system is established through tonal layering, crisp borders, and subtle, diffuse shadows. High-blur, heavy drop shadows are forbidden.

### Depth Hierarchy

1. **Canvas Level (0dp):** The foundation background (`#F8FAFC`). Flat, un-elevated.
2. **Structural Card & Pane Level (1dp):** Main ticket cards, table containers, and knowledge base articles. Elevated using a single-pixel perimeter line (`1px solid #E2E8F0`) and an ultra-subtle ambient shadow:
   `box-shadow: 0 1px 2px 0 rgba(15, 23, 42, 0.04);`
3. **Interactive Hover Level (2dp):** Focused list items, hovered kanban cards, and active table rows.
   `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.04);`
   Border color shifts subtly to `#CBD5E1`.
4. **Overlay Level (3dp):** Dropdowns, auto-complete search results, filter popovers, and date pickers.
   `box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04);`
   Border: `1px solid #E2E8F0`.
5. **Modal & Command Palette Level (4dp):** Global search (`Cmd+K`), critical incident confirmation modals.
   `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.04);`
   Backdrop: `rgba(15, 23, 42, 0.45)` with `backdrop-filter: blur(4px)`.

## Shapes

The geometric approach uses cohesive, engineered radii that maintain high information density while avoiding harsh corners.

### Radii Scale
- **Micro Radii (4px / `rounded-xs`):** Status badges, tag chips, SLA micro-pills, and form checkboxes.
- **Component Radii (6px / `rounded-sm`):** Buttons, text input fields, dropdown trigger buttons, and table row selections.
- **Card Radii (8px / `rounded-md`):** Ticket summary cards, knowledge base list items, and filter panels.
- **Container Radii (12px / `rounded-lg`):** Modals, flyout inspectors, split-screen cards, and global search overlays.
- **Pill (9999px / `rounded-full`):** User avatars and active presence indicators only.

## Components

### Buttons
- **Primary:** Background `#4F46E5`, foreground `#FFFFFF`, border none. Hover: `#4338CA`. Active: `#3730A3`. Height: 32px (compact), 36px (regular). Padding: 8px 14px. Focus: 2px offset with `#4F46E5` ring.
- **Secondary / Outline:** Background `#FFFFFF`, foreground `#1E293B`, border `1px solid #E2E8F0`. Hover: `#F8FAFC`, border `#CBD5E1`.
- **Tertiary / Ghost:** Background transparent, foreground `#64748B`. Hover: background `#F1F5F9`, foreground `#0F172A`.
- **Destructive:** Background `#EF4444`, foreground `#FFFFFF`. Hover: `#DC2626`.

### Badges & Status Chips
- Height: 20px–22px. Padding: 2px 8px. Typography: `label-sm` (uppercase tracking +0.04em).
- Border: `1px solid` matching the semantic tint outline.
- Format: Left-aligned 6px semantic indicator dot + text label.
- Tokens:
  - *Resolved:* Background `#ECFDF5`, text `#065F46`, dot `#10B981`.
  - *In Progress:* Background `#FFFBEB`, text `#92400E`, dot `#F59E0B`.
  - *Critical / P1:* Background `#FEF2F2`, text `#991B1B`, dot `#EF4444`.
  - *Unassigned:* Background `#F1F5F9`, text `#334155`, dot `#94A3B8`.

### Form Controls & Inputs
- **Text Inputs & Selects:** Height 34px. Background `#FFFFFF`, border `1px solid #CBD5E1`, text `#0F172A`, placeholder `#94A3B8`. Radius: 6px.
- **Focus State:** Border `#4F46E5`, box-shadow `0 0 0 3px rgba(79, 70, 229, 0.15)`.
- **Checkboxes & Radios:** 16px × 16px, border `1px solid #CBD5E1`. Checked state: background `#4F46E5` with sharp white glyph.

### Cards & Ticket Lists
- Border: `1px solid #E2E8F0`. Background: `#FFFFFF`. Radius: 8px.
- **Density Modes:** Provide a compact row height (32px) for high-volume queues and a standard height (44px) for contextual views.
- **Selection State:** Left border highlight 3px solid `#4F46E5`, background tint `#F8FAFC`.

### Command Navigation Sidebar
- Background `#0F172A`, border-right `1px solid #1E293B`.
- Items: 36px height, 8px horizontal padding, radius 6px.
- Inactive: text `#94A3B8`, icon `#64748B`.
- Hover: background `#1E293B`, text `#F8FAFC`.
- Active: background `#1E293B`, text `#FFFFFF`, icon `#818CF8` with an interior 2px left border accent `#4F46E5`.

### SLA Countdown Pill
- A specialized component using `code-sm` monospaced typography.
- States: Normal (slate icon and text), Warning (< 1h, amber background/text), Breached (red fill `#FEF2F2`, text `#991B1B`, pulsing red dot).