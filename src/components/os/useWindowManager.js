import { useEffect, useMemo, useRef, useState } from "react"

import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  TILE_PADDING,
  clearWorkspaceState,
  closeWindowState,
  createInitialWindowState,
  focusWindowState,
  minimizeWindowState,
  normalizeWindowState,
  resetWindowPositionsState,
  restoreWindowState,
  restoreWorkspaceState,
  tileVisibleWindowState,
  toggleMaximizeWindowState,
  toggleTaskbarWindowState,
  updateFrameWindowState,
} from "./windowManagerState"

function readPersistedState(storageKeys) {
  if (!storageKeys.length || typeof window === "undefined") return null

  for (const storageKey of storageKeys) {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        return parsed
      }
    } catch {
      continue
    }
  }

  return null
}

function readWindowUrlParam(paramName, validKeys) {
  if (typeof window === "undefined") return ""
  const params = new URLSearchParams(window.location.search)
  const nextKey = params.get(paramName) || ""
  return validKeys.has(nextKey) ? nextKey : ""
}

function getWorkspaceBounds() {
  if (typeof document === "undefined") {
    return { width: 1200, height: 720 }
  }

  const workspace = document.querySelector(".window-grid--admin, .window-grid--public, .window-grid")
  const rect = workspace?.getBoundingClientRect()

  if (rect?.width && rect?.height) {
    return {
      width: Math.max(MIN_WINDOW_WIDTH + (TILE_PADDING * 2), Math.round(rect.width)),
      height: Math.max(MIN_WINDOW_HEIGHT + (TILE_PADDING * 2), Math.round(rect.height)),
    }
  }

  return {
    width: Math.max(900, window.innerWidth - 240),
    height: Math.max(560, window.innerHeight - 140),
  }
}

export function useWindowManager({
  definitions,
  defaultOpenKeys,
  defaultActiveKey,
  storageKey,
  legacyStorageKeys = [],
  restoreFromStorage = true,
  restoreFromUrl = false,
  syncUrl = false,
  urlParamName = "module",
}) {
  const validKeys = useMemo(() => new Set(definitions.map((definition) => definition.key)), [definitions])
  const hasInteractedRef = useRef(false)
  const persistedState = useMemo(
    () => (restoreFromStorage ? readPersistedState([storageKey, ...legacyStorageKeys].filter(Boolean)) : null),
    [legacyStorageKeys, restoreFromStorage, storageKey],
  )
  const urlWindow = useMemo(
    () => (restoreFromUrl ? readWindowUrlParam(urlParamName, validKeys) : ""),
    [restoreFromUrl, urlParamName, validKeys],
  )

  const [state, setState] = useState(() => {
    return createInitialWindowState({
      definitions,
      persistedState,
      defaultOpenKeys,
      defaultActiveKey,
      urlWindow,
    })
  })

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return

    const isEmptyState =
      state.openWindows.length === 0 &&
      state.minimizedWindows.length === 0 &&
      !state.activeWindow &&
      state.windowOrder.length === 0

    if (!restoreFromStorage && !hasInteractedRef.current && isEmptyState) {
      return
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        openWindows: state.openWindows,
        minimizedWindows: state.minimizedWindows,
        activeWindow: state.activeWindow,
        windowOrder: state.windowOrder,
        frames: state.frames,
      }),
    )
  }, [restoreFromStorage, state, storageKey])

  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return

    const url = new URL(window.location.href)
    if (state.activeWindow) {
      url.searchParams.set(urlParamName, state.activeWindow)
    } else {
      url.searchParams.delete(urlParamName)
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
  }, [state.activeWindow, syncUrl, urlParamName])

  function updateState(updater) {
    setState((current) => normalizeWindowState(updater(current), definitions))
  }

  function focusWindow(key) {
    if (!validKeys.has(key)) return
    hasInteractedRef.current = true

    updateState((current) => focusWindowState(current, definitions, key))
  }

  function closeWindow(key) {
    if (!validKeys.has(key)) return
    hasInteractedRef.current = true

    updateState((current) => closeWindowState(current, definitions, key))
  }

  function minimizeWindow(key) {
    if (!validKeys.has(key)) return
    hasInteractedRef.current = true

    updateState((current) => minimizeWindowState(current, definitions, key))
  }

  function restoreWindow(key) {
    if (!validKeys.has(key)) return
    hasInteractedRef.current = true

    updateState((current) => restoreWindowState(current, definitions, key))
  }

  function toggleTaskbarWindow(key) {
    if (!validKeys.has(key)) return
    hasInteractedRef.current = true

    updateState((current) => toggleTaskbarWindowState(current, definitions, key))
  }

  function updateFrame(key, nextFrame) {
    if (!validKeys.has(key) || !nextFrame) return
    hasInteractedRef.current = true

    updateState((current) => updateFrameWindowState(current, definitions, key, nextFrame))
  }

  function restoreWorkspace() {
    const persisted = readPersistedState([storageKey, ...legacyStorageKeys].filter(Boolean))
    if (!persisted) {
      return { ok: false, reason: "empty" }
    }

    const result = restoreWorkspaceState(persisted, definitions)
    if (!result.ok) return result

    hasInteractedRef.current = true
    setState(result.state)
    return result
  }

  function clearWorkspace() {
    hasInteractedRef.current = true

    updateState((current) => clearWorkspaceState(current, definitions))

    return { ok: true }
  }

  function tileVisibleWindows() {
    const result = tileVisibleWindowState(state, definitions, getWorkspaceBounds())
    if (!result.ok) return result
    hasInteractedRef.current = true
    setState(result.state)
    return result
  }

  function resetWindowPositions() {
    const result = resetWindowPositionsState(state, definitions)
    if (!result.ok) return result
    hasInteractedRef.current = true
    setState(result.state)
    return result
  }

  function toggleMaximizeWindow(key) {
    if (!validKeys.has(key)) return
    hasInteractedRef.current = true

    updateState((current) => toggleMaximizeWindowState(current, definitions, key))
  }

  const windowStates = state.openWindows.map((key) => ({
    key,
    minimized: state.minimizedWindows.includes(key),
    active: state.activeWindow === key,
    zIndex: 40 + state.windowOrder.indexOf(key),
    frame: state.frames[key],
  }))

  return {
    ...state,
    windowStates,
    focusWindow,
    openWindow: focusWindow,
    closeWindow,
    minimizeWindow,
    restoreWindow,
    toggleTaskbarWindow,
    updateFrame,
    restoreWorkspace,
    clearWorkspace,
    tileVisibleWindows,
    resetWindowPositions,
    toggleMaximizeWindow,
  }
}
