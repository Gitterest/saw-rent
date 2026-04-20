# Shell QA Checklist

Use this checklist after shell/window-manager changes.

## Startup

- Open `/admin` in a fresh browser profile or after clearing `saw-rent-admin-workspace-v3`.
- Verify the admin desktop loads with no app windows open.
- Verify the taskbar shows no running app buttons.
- Reload the page and verify no window appears unless intentionally restored or launched.

## Launch And Focus

- Launch an app from a desktop icon and verify it opens, becomes active, and appears in the taskbar.
- Launch an app from Start and verify it opens or focuses the existing instance.
- Open at least three apps and verify clicking a window brings it to the front.
- Verify the taskbar active indicator follows the focused non-minimized window.

## Minimize, Restore, And Close

- Minimize the active window and verify it stays on the taskbar as minimized.
- Restore the minimized window from the taskbar and verify it becomes active.
- Close a non-dashboard/admin app and verify it disappears from the desktop and taskbar.
- Verify closing a window does not change reservations, checkout, inventory, maintenance, or settings data.

## Workspace Controls

- Use Start > Workspace > Tile Windows with no visible windows and verify the shell does not break.
- Open several apps, minimize one, then use Tile Windows and verify only visible windows are tiled.
- Use Reset Window Positions and verify open windows return to readable default placements.
- Use Clear Workspace and verify all app windows close while the desktop remains usable.
- Use Restore Workspace and verify a saved workspace reopens only when this action is intentionally selected.

## Persistence

- Open and arrange windows, then reload without the explicit restore flow and verify the clean desktop behavior remains correct.
- Trigger the approved restore flow and verify open windows, minimized windows, active window, taskbar order, and frames restore coherently.
- Verify stale or awkward positions can be recovered with Reset Window Positions or Tile Windows.
