# Saw Rent DESIGN.md

## 1. Purpose

This file defines the **visual design system** for Saw Rent.

Use this file for:
- color roles
- typography
- spacing
- component styling
- visual density
- desktop-shell visual tone
- module visual presentation

Do **not** use this file as the source of truth for shell mechanics such as:
- taskbar state logic
- start menu behavior
- window manager behavior
- minimize / restore / focus rules
- z-index policies
- launcher logic
- app instance rules

Those behaviors should follow:
- `AGENTS.md`
- `reference/phias-fab-os/`

This file is about **how Saw Rent should look**, not the full behavior model.

---

## 2. Product Visual Direction

Saw Rent should feel like a **rugged rental operating system**.

The visual identity should communicate:
- work-ready
- industrial
- fast
- practical
- clean
- credible
- operator-friendly

It should feel closer to:
- equipment desk software
- fleet / service software
- desktop utility tooling

It should not feel like:
- a playful consumer app
- a toy dashboard
- a fake retro gimmick
- a generic SaaS card grid

The shell should look like a serious desktop environment built for managing rentals, reservations, inventory, and service operations.

---

## 3. Visual Theme & Atmosphere

Saw Rent uses a **dark industrial desktop** visual base with controlled high-contrast accents.

The overall atmosphere should feel:
- matte
- grounded
- metallic
- operational
- focused
- slightly heavy
- clean under pressure

The shell background should support an immersive desktop feeling without competing with the windows.
Windows should feel like working surfaces layered above the desktop, with clear separation between active and inactive states.

The visual priority order is:
1. active window
2. taskbar / shell controls
3. primary data inside the current module
4. secondary windows
5. desktop background

The design should create the feeling that the user is operating a rental system, not browsing a marketing site.

---

## 4. Color Palette & Roles

### Core Surfaces
- **Desktop Background**: `#111315`
- **Shell Surface**: `#171a1d`
- **Window Surface**: `#1d2125`
- **Panel Surface**: `#23282d`
- **Elevated Surface**: `#2a3036`
- **Muted Surface**: `#14181b`

### Borders
- **Primary Border**: `#313840`
- **Soft Border**: `#2a3138`
- **Strong Border**: `#454f59`

### Text
- **Primary Text**: `#f3f5f7`
- **Secondary Text**: `#b8c0c8`
- **Muted Text**: `#8a949d`
- **Disabled Text**: `#66717b`

### Brand / Accent
- **Saw Rent Orange**: `#f97316`
- **Saw Rent Amber**: `#f59e0b`
- **Accent Hover**: `#fb923c`
- **Accent Active**: `#ea580c`

### Semantic
- **Success**: `#22c55e`
- **Warning**: `#f59e0b`
- **Danger**: `#ef4444`
- **Info**: `#38bdf8`

### Usage Rules
- Use orange/amber for primary actions, selected states, and high-value status moments.
- Keep most surfaces neutral and dark.
- Do not flood large surfaces with accent color.
- Use semantic colors only when the meaning is real.
- Keep inactive UI calmer and lower contrast than active UI.

---

## 5. Typography Rules

### Font Family
Primary:
- `Inter`
- `system-ui`
- `Segoe UI`
- `Roboto`
- `sans-serif`

The typography should feel:
- compact
- crisp
- readable
- operator-efficient

Avoid overly soft or luxury styling.
Avoid playful rounded display type.

### Type Scale

| Role | Size | Weight | Line Height | Notes |
|------|------|--------|-------------|-------|
| App Title | 22px | 700 | 1.2 | Module / window heading |
| Section Title | 18px | 700 | 1.25 | Major content section |
| Panel Title | 16px | 600 | 1.25 | Cards / sub-panels |
| Body Strong | 14px | 600 | 1.4 | Labels / emphasized info |
| Body | 14px | 400 | 1.5 | Standard text |
| UI Label | 13px | 500 | 1.35 | Inputs / controls |
| Small | 12px | 500 | 1.35 | Secondary UI text |
| Micro | 11px | 600 | 1.3 | Status pills / helper labels |

### Typography Principles
- Use strong hierarchy, not oversized text.
- Prefer 13–16px for most working UI.
- Keep headings compact and functional.
- Use boldness for structure, not decoration.
- Avoid airy marketing-style typography.

---

## 6. Spacing & Density

Saw Rent should use a **dense but breathable desktop spacing system**.

Base spacing unit:
- `4px`

Preferred scale:
- `4px`
- `8px`
- `12px`
- `16px`
- `20px`
- `24px`
- `32px`

### Density Rules
- Shell chrome should be compact.
- Window controls should be tight but easy to hit.
- Data-heavy modules should favor efficient use of space.
- Avoid oversized cards and oversized empty gaps.
- Use more compact spacing in tables, lists, timelines, and admin tooling.
- Use more breathing room only in top-level shell framing and major section transitions.

---

## 7. Border Radius

Saw Rent should feel more industrial than soft.

Use:
- **4px** for compact controls
- **6px** for inputs and small panels
- **8px** for cards and module surfaces
- **10px** for larger shell panels
- **999px** only for pills / status chips where needed

Do not use overly rounded consumer-app styling across the system.

---

## 8. Elevation & Depth

Depth should separate desktop, taskbar, and windows clearly.

### Elevation Levels

| Level | Use | Treatment |
|------|-----|-----------|
| Level 0 | Desktop | Flat background |
| Level 1 | Shell / taskbar | subtle border + low shadow |
| Level 2 | Inactive window | moderate shadow + border |
| Level 3 | Active window | stronger shadow + clearer border |
| Level 4 | Menus / overlays | highest shadow + strongest separation |

### Shadow Philosophy
Use shadows to communicate:
- active vs inactive
- stacked layers
- shell structure
- focus

Do not use soft fluffy SaaS shadows.
Shadows should feel controlled, dry, and practical.

Suggested direction:
- low blur on shell elements
- stronger shadow on active windows
- cleaner border contrast on focused UI

---

## 9. Shell Visual Principles

This section covers **visual shell treatment only**.

The Saw Rent shell should visually present:
- a desktop surface
- app windows
- a grounded taskbar
- distinct chrome
- clearly framed working modules

### Desktop
- dark matte background
- subtle visual texture or gradient allowed
- should not distract from windows
- may include restrained industrial imagery only if it stays low-noise

### Taskbar
- anchored, strong horizontal base
- darker than windows or clearly separated from them
- should feel like persistent system chrome
- open apps and active app must be visually distinct

### Windows
- clear titlebar
- strong active/inactive contrast
- framed content area
- visually read as applications, not simple cards

### Titlebars
- compact
- high contrast
- app identity visible
- controls should feel intentional and OS-like

---

## 10. Component Styling

### Buttons
Primary button:
- accent orange background
- near-dark text or white text depending on contrast
- compact height
- strong hover and active states
- used sparingly for primary actions

Secondary button:
- dark neutral surface
- bordered
- lighter text
- subtle hover lift

Ghost button:
- transparent or near-transparent
- used in toolbars / chrome / utility actions

Danger button:
- semantic red only for destructive actions

### Inputs
- dark panel surface
- clear border
- readable text
- compact height
- visible focus state using accent outline or glow
- placeholder text should remain readable but subdued

### Tables / Lists
- compact rows
- strong column clarity
- restrained striping or dividers
- status and next action easy to scan
- designed for real operator use

### Cards / Panels
- used only where structure helps
- keep panels flatter and more utility-oriented than SaaS marketing cards
- avoid oversized floating-card feel

### Status Pills
- compact
- semantically colored
- readable at small sizes
- used for reservation, maintenance, inventory, and workflow state

---

## 11. Module Presentation Principles

Each module should feel like its own app inside the shell, while still belonging to one operating system.

### Dashboard
Should feel like command overview:
- summary
- alerts
- today view
- operational status

### Reservations
Should feel schedule-driven and time-aware:
- queue
- timeline
- urgency
- status visibility

### Checkout
Should feel transactional and decisive:
- customer
- item
- duration
- confirmation
- money/action clarity

### Inventory
Should feel structured and practical:
- equipment-first
- condition
- availability
- service linkage

### Customers
Should feel relationship-aware:
- history
- active work
- recent actions
- derived or persisted identity

### Calendar
Should feel operational, not decorative:
- schedule
- reservations
- service timing
- due/return awareness

### Maintenance
Should feel workshop-oriented:
- records
- due dates
- service state
- history
- completion flow

### Settings
Should feel system-level:
- business identity
- defaults
- operational preferences
- environment controls

---

## 12. Responsive Behavior

Saw Rent is **desktop-first**.

### Priority
1. desktop operator workflow
2. laptop usability
3. tablet survivability
4. mobile accessibility where practical

### Rules
- Do not collapse the app into a generic mobile card stack unless necessary.
- Preserve module identity across sizes.
- Keep shell structure as intact as practical on laptop/tablet.
- On smaller screens, simplify layout before destroying hierarchy.
- Keep dense data readable.

---

## 13. Do’s and Don’ts

### Do
- keep visuals dark, operational, and industrial
- make active windows clearly stronger than inactive ones
- keep typography compact and useful
- prioritize scanning and working speed
- use accent color intentionally
- make each module feel like an application
- keep shell chrome visually strong and coherent

### Don’t
- don’t make it feel like a toy OS
- don’t turn it into a glossy marketing dashboard
- don’t over-round everything
- don’t use giant soft cards everywhere
- don’t flood the UI with orange
- don’t rely on visual gimmicks over clarity
- don’t use this file to define window-manager logic

---

## 14. Reference Relationship

Use files in the following order:

1. `AGENTS.md`  
   repo rules and working rules

2. `DESIGN.md`  
   visual system and presentation rules

3. `reference/phias-fab-os/`  
   shell behavior and interaction fidelity reference

If a task involves:
- colors
- spacing
- typography
- component visuals
- shell visual tone

use `DESIGN.md`.

If a task involves:
- taskbar behavior
- desktop launching
- start menu behavior
- minimize / restore
- focus / blur
- z-order
- window state
- app launching logic

use `reference/phias-fab-os/` and follow `AGENTS.md`.

---

## 15. Agent Implementation Guidance

When doing UI work:
1. read `AGENTS.md`
2. read `DESIGN.md`
3. inspect the current implementation
4. if shell fidelity is involved, inspect `reference/phias-fab-os/`
5. make targeted changes
6. preserve working business logic
7. leave the app buildable

This design system should improve the app’s clarity, cohesion, and desktop-shell presentation without causing fake behavior or unnecessary rewrites.