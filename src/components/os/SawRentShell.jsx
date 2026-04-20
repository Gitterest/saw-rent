import { useEffect, useMemo, useRef, useState } from "react"

function formatTaskbarTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatTaskbarDay(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
}

function groupLauncherItems(items) {
  return items.reduce((groups, item) => {
    const key = item.group || "Apps"
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(item)
    return groups
  }, {})
}

const MIN_WINDOW_WIDTH = 360
const MIN_WINDOW_HEIGHT = 260
const RECOVERABLE_EDGE = 80

const RESIZE_DIRECTIONS = ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-right", "bottom-left"]

function clampFrameToWorkspace(frame, bounds) {
  const maxWidth = Math.max(MIN_WINDOW_WIDTH, bounds.width + RECOVERABLE_EDGE)
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT, bounds.height + RECOVERABLE_EDGE)
  const width = Math.max(MIN_WINDOW_WIDTH, Math.min(frame.width, maxWidth))
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(frame.height, maxHeight))
  const minLeft = Math.min(0, RECOVERABLE_EDGE - width)
  const maxLeft = Math.max(0, bounds.width - RECOVERABLE_EDGE)
  const maxTop = Math.max(0, bounds.height - RECOVERABLE_EDGE)

  return {
    ...frame,
    x: Math.max(minLeft, Math.min(frame.x, maxLeft)),
    y: Math.max(0, Math.min(frame.y, maxTop)),
    width,
    height,
  }
}

function buildDragFrame(frame, deltaX, deltaY, bounds) {
  return clampFrameToWorkspace(
    {
      ...frame,
      x: frame.x + deltaX,
      y: frame.y + deltaY,
    },
    bounds,
  )
}

function buildResizeFrame(direction, frame, deltaX, deltaY, bounds) {
  const next = { ...frame }
  const affectsLeft = direction.includes("left")
  const affectsRight = direction.includes("right")
  const affectsTop = direction.includes("top")
  const affectsBottom = direction.includes("bottom")

  if (affectsRight) {
    next.width = frame.width + deltaX
  }

  if (affectsBottom) {
    next.height = frame.height + deltaY
  }

  if (affectsLeft) {
    const right = frame.x + frame.width
    next.x = frame.x + deltaX
    next.width = right - next.x

    if (next.width < MIN_WINDOW_WIDTH) {
      next.width = MIN_WINDOW_WIDTH
      next.x = right - MIN_WINDOW_WIDTH
    }
  }

  if (affectsTop) {
    const bottom = frame.y + frame.height
    next.y = frame.y + deltaY
    next.height = bottom - next.y

    if (next.height < MIN_WINDOW_HEIGHT) {
      next.height = MIN_WINDOW_HEIGHT
      next.y = bottom - MIN_WINDOW_HEIGHT
    }
  }

  return clampFrameToWorkspace(next, bounds)
}

export function SawRentShell({
  brand,
  subtitle,
  shellLabel,
  desktopItems,
  launcherItems,
  launcherFeaturedItems = [],
  launcherRailItems = [],
  launcherOpen,
  launcherQuery,
  onLauncherQueryChange,
  onToggleLauncher,
  taskbarItems,
  systemBadges,
  children,
}) {
  const [clock, setClock] = useState(() => new Date())
  const launcherRef = useRef(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date())
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!launcherOpen) return

    function handlePointerDown(event) {
      if (launcherRef.current?.contains(event.target)) return
      if (event.target.closest(".sr-taskbar__launcher, .sr-taskbar__search")) return
      onToggleLauncher()
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onToggleLauncher()
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [launcherOpen, onToggleLauncher])

  const groupedLauncherItems = useMemo(
    () => groupLauncherItems(launcherItems),
    [launcherItems],
  )

  const desktopLeftItems = desktopItems.filter((item) => item.side !== "right")
  const desktopRightItems = desktopItems.filter((item) => item.side === "right")

  return (
    <div className="sr-shell" data-testid="shell-root">
      <div className="os-desktop-bg-media" aria-hidden="true">
        <iframe
          title="Animated Chainsaw Low-Poly Background"
          frameBorder="0"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          src="https://sketchfab.com/models/1587c6a9f506407ca0512fe3122959f8/embed?autostart=1&ui_theme=dark&ui_infos=0&ui_controls=0&ui_stop=0&ui_watermark=0&ui_watermark_link=0&dnt=1"
        />
        <div className="os-desktop-bg-overlay" />
      </div>

      <div className="sr-shell__backdrop" aria-hidden="true">
        <div className="sr-shell__horizon" />
        <div className="sr-shell__burst" />
        <div className="sr-shell__ambient sr-shell__ambient--left" />
        <div className="sr-shell__ambient sr-shell__ambient--right" />
      </div>

      <div className="sr-shell__overlay">
        <section className="sr-shell__console" aria-label="Workspace summary">
          <p className="sr-shell__eyebrow">{shellLabel}</p>
          <div className="sr-shell__console-row">
            <div className="sr-shell__brand-mark">SR</div>
            <div>
              <h1>{brand}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
        </section>

        <div className="sr-shell__status-row" data-testid="shell-status-row">
          {systemBadges.map((badge) => (
            <span key={badge.label} className={`sr-badge tone-${badge.tone || "neutral"}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="sr-shell__desktop" data-testid="shell-desktop">
        <aside className="sr-shell__icons sr-shell__icons--left" aria-label="Desktop shortcuts">
          {desktopLeftItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sr-desktop-icon ${item.active ? "is-active" : ""} ${item.running ? "is-running" : ""}`}
              data-testid={`shell-desktop-icon-${item.key}`}
              data-active={item.active ? "true" : "false"}
              data-running={item.running ? "true" : "false"}
              onClick={item.onSelect}
            >
              <span className="sr-desktop-icon__glyph" aria-hidden="true">{item.icon}</span>
              <span className="sr-desktop-icon__label">{item.label}</span>
              <span className="sr-desktop-icon__meta">{item.meta}</span>
            </button>
          ))}
        </aside>

        <main className="sr-shell__workspace" data-testid="shell-workspace">{children}</main>

        <aside className="sr-shell__icons sr-shell__icons--right" aria-label="System shortcuts">
          {desktopRightItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sr-desktop-icon ${item.active ? "is-active" : ""} ${item.running ? "is-running" : ""}`}
              data-testid={`shell-desktop-icon-${item.key}`}
              data-active={item.active ? "true" : "false"}
              data-running={item.running ? "true" : "false"}
              onClick={item.onSelect}
            >
              <span className="sr-desktop-icon__glyph" aria-hidden="true">{item.icon}</span>
              <span className="sr-desktop-icon__label">{item.label}</span>
              <span className="sr-desktop-icon__meta">{item.meta}</span>
            </button>
          ))}
        </aside>
      </div>

      {launcherOpen ? (
        <div ref={launcherRef} className="sr-launcher" role="dialog" aria-label="Launcher" data-testid="shell-start-menu">
          <div className="sr-launcher__inner">
            <div className="sr-launcher__rail">
              {launcherRailItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="sr-launcher__rail-button"
                  onClick={item.onSelect}
                  aria-label={item.label}
                  title={item.label}
                >
                  <span aria-hidden="true">{item.icon}</span>
                </button>
              ))}
            </div>

            <div className="sr-launcher__apps">
              <div className="sr-launcher__header">
                <div>
                  <p>All apps</p>
                  <input
                    type="search"
                    value={launcherQuery}
                    onChange={(event) => onLauncherQueryChange(event.target.value)}
                    placeholder="Search apps and actions"
                  />
                </div>
              </div>

              <div className="sr-launcher__body">
                {Object.entries(groupedLauncherItems).map(([group, items]) => (
                  <section key={group} className="sr-launcher__section">
                    <div className="sr-launcher__label">{group}</div>
                    <div className="sr-launcher__list">
                      {items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="sr-launcher__item"
                          data-testid={item.testId || `shell-launcher-item-${item.key}`}
                          data-shell-group={item.group || "Apps"}
                          onClick={item.onSelect}
                        >
                          <span className="sr-launcher__icon" aria-hidden="true">{item.icon}</span>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="sr-launcher__featured">
              {launcherFeaturedItems.length > 0 ? (
                <>
                  <div className="sr-launcher__label">Pinned</div>
                  <div className="sr-launcher__featured-grid">
                    {launcherFeaturedItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="sr-launcher__tile"
                        data-testid={`shell-launcher-tile-${item.key}`}
                        onClick={item.onSelect}
                      >
                        <span className="sr-launcher__tile-icon" aria-hidden="true">{item.icon}</span>
                        <span className="sr-launcher__tile-label">{item.label}</span>
                        <small>{item.description}</small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="sr-launcher__empty">No pinned launchers matched the current query.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="sr-taskbar" data-testid="shell-taskbar">
        <button type="button" className="sr-taskbar__launcher" data-testid="shell-start-button" onClick={onToggleLauncher}>
          <span aria-hidden="true">SR</span>
          <span>Start</span>
        </button>

        <button type="button" className="sr-taskbar__search" onClick={onToggleLauncher} aria-label="Open launcher">
          <span aria-hidden="true">⌕</span>
        </button>

        <div className="sr-taskbar__apps" aria-label="Open applications" data-testid="shell-taskbar-items">
          {taskbarItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={[
                "sr-taskbar__app",
                item.active ? "is-active" : "",
                item.minimized ? "is-minimized" : "",
              ].filter(Boolean).join(" ")}
              data-testid={`shell-taskbar-item-${item.key}`}
              data-active={item.active ? "true" : "false"}
              data-minimized={item.minimized ? "true" : "false"}
              onClick={item.onSelect}
            >
              <span className="sr-taskbar__app-icon" aria-hidden="true">{item.icon}</span>
              <span className="sr-taskbar__app-label">{item.label}</span>
              <span className="sr-taskbar__app-indicator" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="sr-taskbar__system">
          <div className="sr-taskbar__meter">
            <strong>{formatTaskbarTime(clock)}</strong>
            <span>{formatTaskbarDay(clock)}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function WindowSurface({
  windowKey,
  title,
  subtitle,
  icon,
  active,
  size = "standard",
  toolbar,
  actions,
  footer,
  frame,
  zIndex,
  onFocus,
  onClose,
  onMinimize,
  onToggleMaximize,
  onFrameChange,
  minimized,
  children,
}) {
  const windowRef = useRef(null)
  const cleanupRef = useRef(null)
  const stableWindowKey = windowKey || title

  useEffect(() => () => cleanupRef.current?.(), [])

  useEffect(() => {
    if (!frame || frame.maximized || !onFrameChange || window.matchMedia("(max-width: 959px)").matches) {
      return
    }

    const node = windowRef.current
    const bounds = node?.parentElement?.getBoundingClientRect()

    if (!node || !bounds) {
      return
    }

    const next = clampFrameToWorkspace(frame, bounds)

    if (
      next.x !== frame.x ||
      next.y !== frame.y ||
      next.width !== frame.width ||
      next.height !== frame.height
    ) {
      onFrameChange(next)
    }
  }, [frame, onFrameChange])

  const windowStyle = useMemo(() => {
    if (!frame) return { zIndex }

    if (frame.maximized) {
      return {
        zIndex,
        inset: "0",
      }
    }

    return {
      zIndex,
      left: `${frame.x}px`,
      top: `${frame.y}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
    }
  }, [frame, zIndex])

  function startFrameInteraction(event, options) {
    if (event.button !== 0 || event.target.closest("button")) {
      return
    }

    event.preventDefault()
    onFocus?.()

    if (!frame || !onFrameChange || window.matchMedia("(max-width: 959px)").matches) {
      return
    }

    const node = windowRef.current
    const bounds = node?.parentElement?.getBoundingClientRect()

    if (!node || !bounds) {
      return
    }

    const startX = event.clientX
    const startY = event.clientY
    const pointerOffsetX = startX - node.getBoundingClientRect().left
    const restoredWidth = frame.restoreFrame?.width || Math.min(frame.width, Math.max(MIN_WINDOW_WIDTH, bounds.width * 0.72))
    const restoredHeight = frame.restoreFrame?.height || Math.min(frame.height, Math.max(MIN_WINDOW_HEIGHT, bounds.height * 0.78))
    const restoredX = Math.max(0, Math.min(startX - bounds.left - pointerOffsetX, bounds.width - RECOVERABLE_EDGE))
    const restoredFrame = frame.maximized && options.kind === "drag"
      ? clampFrameToWorkspace(
          {
            ...(frame.restoreFrame || frame),
            x: restoredX,
            y: 0,
            width: restoredWidth,
            height: restoredHeight,
            maximized: false,
            restoreFrame: null,
          },
          bounds,
        )
      : { ...frame, maximized: false, restoreFrame: null }

    if (frame.maximized) {
      onFrameChange(restoredFrame)
    }

    function handlePointerMove(moveEvent) {
      moveEvent.preventDefault()
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      const next = options.kind === "resize"
        ? buildResizeFrame(options.direction, restoredFrame, deltaX, deltaY, bounds)
        : buildDragFrame(restoredFrame, deltaX, deltaY, bounds)

      onFrameChange(next)
    }

    function handlePointerUp() {
      cleanupRef.current?.()
      cleanupRef.current = null
    }

    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }

  function handleHeaderPointerDown(event) {
    startFrameInteraction(event, { kind: "drag" })
  }

  function handleResizePointerDown(event, direction) {
    startFrameInteraction(event, { kind: "resize", direction })
  }

  return (
    <section
      ref={windowRef}
      className={[
        "sr-window",
        `sr-window--${size}`,
        active ? "is-active" : "",
        minimized ? "is-minimized" : "",
        frame?.maximized ? "is-maximized" : "",
      ].filter(Boolean).join(" ")}
      style={windowStyle}
      data-window-key={stableWindowKey}
      data-testid={`shell-window-${stableWindowKey}`}
      data-active={active ? "true" : "false"}
      data-minimized={minimized ? "true" : "false"}
      data-window-state={minimized ? "minimized" : (active ? "active" : "inactive")}
      onMouseDown={onFocus}
      aria-hidden={minimized ? "true" : "false"}
    >
      <header
        className="sr-window__header"
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={onToggleMaximize}
      >
        <div className="sr-window__title">
          <span className="sr-window__icon" aria-hidden="true">{icon}</span>
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        <div className="sr-window__controls">
          {actions}
          {onMinimize ? (
            <button
              type="button"
              className="sr-window__control"
              data-testid={`shell-window-${stableWindowKey}-minimize`}
              onClick={onMinimize}
              aria-label={`Minimize ${title}`}
            >
              −
            </button>
          ) : null}
          {onToggleMaximize ? (
            <button
              type="button"
              className="sr-window__control"
              data-testid={`shell-window-${stableWindowKey}-maximize`}
              onClick={onToggleMaximize}
              aria-label={`Maximize ${title}`}
            >
              {frame?.maximized ? "❐" : "□"}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="sr-window__control sr-window__control--close"
              data-testid={`shell-window-${stableWindowKey}-close`}
              onClick={onClose}
              aria-label={`Close ${title}`}
            >
              ×
            </button>
          ) : null}
        </div>
      </header>
      {toolbar ? <div className="sr-window__toolbar">{toolbar}</div> : null}
      <div className="sr-window__body">{children}</div>
      {footer ? <footer className="sr-window__footer">{footer}</footer> : null}
      {onFrameChange ? (
        <div className="sr-window__resize-layer" aria-hidden="true">
          {RESIZE_DIRECTIONS.map((direction) => (
            <span
              key={direction}
              className={`sr-window__resize-handle sr-window__resize-handle--${direction}`}
              onPointerDown={(event) => handleResizePointerDown(event, direction)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
