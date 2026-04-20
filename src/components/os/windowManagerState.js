const WINDOW_SIZE_PRESETS = {
  wide: { width: 840, height: 560 },
  tall: { width: 520, height: 640 },
  standard: { width: 640, height: 520 },
}

export const MIN_WINDOW_WIDTH = 360
export const MIN_WINDOW_HEIGHT = 260
export const TILE_GAP = 12
export const TILE_PADDING = 18

function moveToEnd(list, value) {
  return [...list.filter((entry) => entry !== value), value]
}

function hasDefinition(definitions, key) {
  return definitions.some((definition) => definition.key === key)
}

export function buildDefaultFrame(size, index) {
  const preset = WINDOW_SIZE_PRESETS[size] || WINDOW_SIZE_PRESETS.standard
  const column = index % 3
  const row = Math.floor(index / 3)

  return {
    x: 56 + (column * 36),
    y: 28 + (row * 28),
    width: preset.width,
    height: preset.height,
    maximized: false,
    restoreFrame: null,
  }
}

function readNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

export function sanitizeFrame(frame, fallback) {
  const source = frame && typeof frame === "object" ? frame : {}
  const restoreFrame = source.restoreFrame && typeof source.restoreFrame === "object"
    ? {
        x: readNumber(source.restoreFrame.x, fallback.x),
        y: readNumber(source.restoreFrame.y, fallback.y),
        width: Math.max(MIN_WINDOW_WIDTH, readNumber(source.restoreFrame.width, fallback.width)),
        height: Math.max(MIN_WINDOW_HEIGHT, readNumber(source.restoreFrame.height, fallback.height)),
      }
    : null

  return {
    x: readNumber(source.x, fallback.x),
    y: readNumber(source.y, fallback.y),
    width: Math.max(MIN_WINDOW_WIDTH, readNumber(source.width, fallback.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, readNumber(source.height, fallback.height)),
    maximized: Boolean(source.maximized),
    restoreFrame,
  }
}

export function normalizeWindowState(state = {}, definitions = []) {
  const validKeys = new Set(definitions.map((definition) => definition.key))

  const openWindows = Array.isArray(state.openWindows)
    ? state.openWindows.filter((key) => validKeys.has(key))
    : []

  const openKeySet = new Set(openWindows)
  const minimizedWindows = Array.isArray(state.minimizedWindows)
    ? state.minimizedWindows.filter((key) => openKeySet.has(key))
    : []

  const windowOrder = Array.isArray(state.windowOrder)
    ? state.windowOrder.filter((key) => openKeySet.has(key))
    : []

  for (const key of openWindows) {
    if (!windowOrder.includes(key)) {
      windowOrder.push(key)
    }
  }

  const frames = definitions.reduce((map, definition, index) => {
    const fallbackFrame = buildDefaultFrame(definition.size, index)
    map[definition.key] = sanitizeFrame(state.frames?.[definition.key], fallbackFrame)
    return map
  }, {})

  const visibleOrder = [...windowOrder].reverse().filter((key) => !minimizedWindows.includes(key))
  const activeWindow = openKeySet.has(state.activeWindow) && !minimizedWindows.includes(state.activeWindow)
    ? state.activeWindow
    : visibleOrder[0] || ""

  return {
    openWindows,
    minimizedWindows,
    activeWindow,
    windowOrder,
    frames,
  }
}

export function createInitialWindowState({
  definitions,
  persistedState = null,
  defaultOpenKeys = [],
  defaultActiveKey = "",
  urlWindow = "",
}) {
  const openWindows = [
    ...(persistedState?.openWindows || defaultOpenKeys || []),
    ...(urlWindow ? [urlWindow] : []),
  ].filter((key, index, list) => list.indexOf(key) === index)

  return normalizeWindowState(
    {
      openWindows,
      minimizedWindows: persistedState?.minimizedWindows || [],
      activeWindow: urlWindow || persistedState?.activeWindow || defaultActiveKey || "",
      windowOrder: persistedState?.windowOrder || openWindows,
      frames: persistedState?.frames || {},
    },
    definitions,
  )
}

export function restoreWorkspaceState(persistedState, definitions) {
  if (!persistedState) {
    return { ok: false, reason: "empty", state: null }
  }

  const state = normalizeWindowState(persistedState, definitions)
  if (state.openWindows.length === 0) {
    return { ok: false, reason: "empty", state }
  }

  return { ok: true, count: state.openWindows.length, state }
}

export function focusWindowState(current, definitions, key) {
  if (!hasDefinition(definitions, key)) return current

  return normalizeWindowState(
    {
      ...current,
      openWindows: current.openWindows.includes(key) ? current.openWindows : [...current.openWindows, key],
      minimizedWindows: current.minimizedWindows.filter((entry) => entry !== key),
      activeWindow: key,
      windowOrder: moveToEnd(current.windowOrder, key),
    },
    definitions,
  )
}

export function closeWindowState(current, definitions, key) {
  if (!hasDefinition(definitions, key)) return current

  return normalizeWindowState(
    {
      ...current,
      openWindows: current.openWindows.filter((entry) => entry !== key),
      minimizedWindows: current.minimizedWindows.filter((entry) => entry !== key),
      windowOrder: current.windowOrder.filter((entry) => entry !== key),
      activeWindow: current.activeWindow === key ? "" : current.activeWindow,
    },
    definitions,
  )
}

export function minimizeWindowState(current, definitions, key) {
  if (!hasDefinition(definitions, key)) return current

  return normalizeWindowState(
    {
      ...current,
      minimizedWindows: current.minimizedWindows.includes(key)
        ? current.minimizedWindows
        : [...current.minimizedWindows, key],
      activeWindow: current.activeWindow === key ? "" : current.activeWindow,
    },
    definitions,
  )
}

export function restoreWindowState(current, definitions, key) {
  if (!hasDefinition(definitions, key)) return current

  return normalizeWindowState(
    {
      ...current,
      openWindows: current.openWindows.includes(key) ? current.openWindows : [...current.openWindows, key],
      minimizedWindows: current.minimizedWindows.filter((entry) => entry !== key),
      activeWindow: key,
      windowOrder: moveToEnd(current.windowOrder, key),
    },
    definitions,
  )
}

export function toggleTaskbarWindowState(current, definitions, key) {
  if (!hasDefinition(definitions, key)) return current

  const isOpen = current.openWindows.includes(key)
  const isMinimized = current.minimizedWindows.includes(key)
  const isActive = current.activeWindow === key && !isMinimized

  if (!isOpen || isMinimized) {
    return restoreWindowState(current, definitions, key)
  }

  if (isActive) {
    return minimizeWindowState(current, definitions, key)
  }

  return focusWindowState(current, definitions, key)
}

export function updateFrameWindowState(current, definitions, key, nextFrame) {
  if (!hasDefinition(definitions, key) || !nextFrame) return current

  return normalizeWindowState(
    {
      ...current,
      frames: {
        ...current.frames,
        [key]: {
          ...current.frames[key],
          ...nextFrame,
        },
      },
    },
    definitions,
  )
}

export function clearWorkspaceState(current, definitions) {
  return normalizeWindowState(
    {
      ...current,
      openWindows: [],
      minimizedWindows: [],
      activeWindow: "",
      windowOrder: [],
    },
    definitions,
  )
}

export function buildTileFrames(keys, bounds) {
  if (keys.length === 0) return {}

  const columns = keys.length === 1 ? 1 : Math.ceil(Math.sqrt(keys.length))
  const rows = Math.ceil(keys.length / columns)
  const usableWidth = Math.max(MIN_WINDOW_WIDTH, bounds.width - (TILE_PADDING * 2) - (TILE_GAP * (columns - 1)))
  const usableHeight = Math.max(MIN_WINDOW_HEIGHT, bounds.height - (TILE_PADDING * 2) - (TILE_GAP * (rows - 1)))
  const cellWidth = Math.max(MIN_WINDOW_WIDTH, Math.floor(usableWidth / columns))
  const cellHeight = Math.max(MIN_WINDOW_HEIGHT, Math.floor(usableHeight / rows))

  return keys.reduce((frames, key, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)

    frames[key] = {
      x: TILE_PADDING + (column * (cellWidth + TILE_GAP)),
      y: TILE_PADDING + (row * (cellHeight + TILE_GAP)),
      width: cellWidth,
      height: cellHeight,
      maximized: false,
      restoreFrame: null,
    }

    return frames
  }, {})
}

export function tileVisibleWindowState(current, definitions, bounds) {
  const visibleWindows = current.windowOrder.filter((key) =>
    current.openWindows.includes(key) && !current.minimizedWindows.includes(key),
  )

  if (visibleWindows.length === 0) {
    return { ok: false, reason: "empty", state: current }
  }

  return {
    ok: true,
    count: visibleWindows.length,
    state: normalizeWindowState(
      {
        ...current,
        activeWindow: visibleWindows[visibleWindows.length - 1] || current.activeWindow,
        frames: {
          ...current.frames,
          ...buildTileFrames(visibleWindows, bounds),
        },
      },
      definitions,
    ),
  }
}

export function resetWindowPositionsState(current, definitions) {
  if (current.openWindows.length === 0) {
    return { ok: false, reason: "empty", state: current }
  }

  const definitionIndexes = new Map(definitions.map((definition, index) => [definition.key, index]))
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const resetFrames = current.openWindows.reduce((frames, key) => {
    const definition = definitionByKey.get(key)
    const index = definitionIndexes.get(key) ?? 0
    frames[key] = buildDefaultFrame(definition?.size, index)
    return frames
  }, {})

  return {
    ok: true,
    count: current.openWindows.length,
    state: normalizeWindowState(
      {
        ...current,
        frames: {
          ...current.frames,
          ...resetFrames,
        },
      },
      definitions,
    ),
  }
}

export function toggleMaximizeWindowState(current, definitions, key) {
  if (!hasDefinition(definitions, key)) return current

  const currentFrame = current.frames[key]
  if (!currentFrame) return current

  if (currentFrame.maximized) {
    return normalizeWindowState(
      {
        ...current,
        activeWindow: key,
        windowOrder: moveToEnd(current.windowOrder, key),
        minimizedWindows: current.minimizedWindows.filter((entry) => entry !== key),
        frames: {
          ...current.frames,
          [key]: {
            ...currentFrame,
            ...(currentFrame.restoreFrame || {}),
            maximized: false,
            restoreFrame: null,
          },
        },
      },
      definitions,
    )
  }

  return normalizeWindowState(
    {
      ...current,
      activeWindow: key,
      windowOrder: moveToEnd(current.windowOrder, key),
      minimizedWindows: current.minimizedWindows.filter((entry) => entry !== key),
      frames: {
        ...current.frames,
        [key]: {
          ...currentFrame,
          maximized: true,
          restoreFrame: {
            x: currentFrame.x,
            y: currentFrame.y,
            width: currentFrame.width,
            height: currentFrame.height,
          },
        },
      },
    },
    definitions,
  )
}
