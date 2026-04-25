# AGENTS.md

## Saw Rent repo operating rules

You are working in the Saw Rent repository.

This repo already has a first-pass OS-style migration completed.
Do not redo the shell.
Do not perform another broad visual rewrite.
Do not replace working architecture unless there is a clear technical reason.

Use `DESIGN.md` for visual system decisions and `reference/phias-fab-os/` for shell behavior and interaction fidelity.

## Current architecture assumptions

The current app has already been reorganized around:
- `src/components/os/SawRentShell.jsx`
- `src/features/public/PublicWorkspace.jsx`
- `src/features/admin/AdminWorkspace.jsx`
- `src/styles/app-shell.css`
- `src/App.css`
- `src/lib/presentation.js`

Treat these as the current shell foundation unless the code clearly shows otherwise.

## Primary objective

Build on the current OS-style Saw Rent implementation by improving real operator functionality, not by re-theming the app again.

Priority order:
1. Customers
2. Maintenance
3. Settings
4. Window/module persistence and deep-linking

## Required workflow

For every substantial task:
1. Read `DESIGN.md`
2. Inspect the existing implementation before editing
3. Identify the real data flow, current components, and backend dependencies
4. Make a short plan
5. Implement with minimal disruption
6. Run validation commands before stopping

Do not guess how the app works when the repo can answer it.

## Product rules

Saw Rent must remain a serious rental business app.

Preserve and protect:
- auth
- request flow
- reservation flow
- checkout flow
- inventory flow
- admin workflows
- pricing/business logic
- existing live API integrations

Do not break working business logic just to satisfy UI preferences.

## UI and design rules

`DESIGN.md` is the source of truth for:
- visual theme
- color roles
- typography
- spacing
- elevation
- component styling
- layout behavior
- OS-style interaction model

Follow the design system, but keep usability and clarity above novelty.

The desktop shell should feel operational and efficient, not gimmicky.

Do:
- preserve the OS shell pattern
- keep module boundaries clear
- keep styling centralized
- reuse shared primitives
- keep public and admin experiences coherent
- keep desktop-first usability strong
- keep mobile/tablet usable without destroying the shell model

Do not:
- scatter one-off styles everywhere
- duplicate status formatting logic
- add fake windows or fake controls
- build pretend settings that do nothing
- create placeholder admin tools that are not backed by real data or real behavior

## Data and backend rules

Reuse existing models, routes, endpoints, and business logic whenever possible.

Do not:
- invent endpoints
- invent schemas
- invent fake persistence
- hardcode fake operational data
- create UI that implies data is saved when it is not

When backend support is missing:
- confirm that it is actually missing
- add the minimum viable backend change only when necessary
- keep backend changes small, explicit, and production-minded
- clearly report what required backend work

Derived read-only views are acceptable only when the real backend does not support editing yet.
In that case, make the read-only experience as useful as possible with real data.

## Module-specific guidance

### Customers
Customers should become a useful admin tool.
Prefer:
- searchable customer list
- customer detail view
- linkage to requests, reservations, and orders
- activity history and status visibility
- clear empty/loading/error states

If there is no real customer persistence layer, build the strongest real derived customer workspace possible from existing live data.

### Maintenance
Maintenance should become a real operational workflow.
Prefer:
- linkage to inventory/equipment
- service status
- notes/history
- overdue/upcoming indicators
- real persistence when supported

Do not fake a maintenance system.
If persistence is required and absent, add only the minimum necessary real implementation.

### Settings
Settings must map to real configurable behavior.
Only expose settings that actually save and matter.
Avoid dead toggles and pretend preferences.

### Window persistence
Improve operator quality-of-life without rewriting the shell.
Good targets:
- restore open modules on reload
- remember focused/active module
- module deep-linking
- lightweight saved workspace state

Keep this reliable and simple.

## Editing rules

Refactor in place when possible.

Prefer:
- small focused changes
- reusable shared components
- centralized tokens/styles
- shared utilities for display/state formatting
- consistency across modules

Avoid:
- unnecessary rewrites
- duplicate components with minor differences
- broad file churn without value
- changing stable code just because it looks old

Keep imports, routing, and file structure clean.

## Code quality rules

All code should be production-ready.

Requirements:
- no broken imports
- no dead placeholder logic
- no fake success states
- no console noise left behind
- no unfinished scaffolding presented as complete

When changing architecture, keep the surface area small and explain why in the final summary.

## Validation rules

Before stopping, run the relevant checks that exist in the repo.

Minimum expectation:
- lint
- build

Also run targeted checks when relevant to the work being done.

Fix regressions caused by your changes before stopping.

## Phia Fabs OS reference rules

For any shell, layout, taskbar, launcher, desktop, or window-manager work, inspect `reference/phias-fab-os/` before editing.

Inspect `reference/phias-fab-os/screenshots/` for visual examples of:
- desktop layout
- taskbar appearance
- start menu / launcher appearance
- window chrome
- stacked windows
- active vs inactive window treatment
- minimized/restored states

Use screenshots as visual/parity guidance and use the reference code files as the source for structural and interaction patterns.
Do not copy branding, text, or commerce-specific content.

Also use `reference/phias-fab-os/` as the primary shell reference for:
- desktop surface structure
- taskbar behavior
- start menu / launcher behavior
- app launching patterns
- window chrome
- focus / blur state
- minimize / restore behavior
- z-index / stacking behavior
- running-app indicators
- active-app indicators
- OS-style layout density and proportions

Mirror shell mechanics and interaction patterns from the reference.
Do not copy Shopify-specific commerce flows, branding, text, or product content.

When there is a conflict between the current Saw Rent shell and the reference shell:
- preserve Saw Rent business logic
- preserve real data flows
- prefer the Phia-style shell mechanics where practical and stable

For shell-fidelity tasks:
1. inspect the current Saw Rent shell
2. inspect `reference/phias-fab-os/`
3. identify concrete behavior gaps
4. refactor the shell toward the reference
5. keep the result buildable and production-ready

Do not stop at visual resemblance alone.
Window behavior, taskbar behavior, launcher behavior, and module/app identity must move closer to the reference shell.

## Final response rules

When finished, report:
1. what changed
2. what real workflows are now supported
3. what files were materially affected
4. what remains blocked by missing backend/data model support
5. validation commands run and results

Be precise.
Do not claim a feature works unless the repo actually supports it.