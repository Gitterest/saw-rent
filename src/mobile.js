import { App as CapacitorApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { Network } from "@capacitor/network"
import { SplashScreen } from "@capacitor/splash-screen"
import { StatusBar, Style } from "@capacitor/status-bar"

function dispatchNetworkStatus(status) {
  window.dispatchEvent(new CustomEvent("sawrent:network-status", { detail: status }))
}

function closeTopNativeSurface() {
  const donationClose = document.querySelector(".donation-popover__close")
  if (donationClose) {
    donationClose.click()
    return true
  }

  const launcher = document.querySelector(".sr-launcher")
  if (launcher) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    return true
  }

  const activeClose = document.querySelector(".sr-window.is-active:not(.is-minimized) .sr-window__control--close")
  if (activeClose) {
    activeClose.click()
    return true
  }

  return false
}

export async function setupNativeMobile() {
  if (!Capacitor.isNativePlatform()) return

  document.documentElement.dataset.nativePlatform = Capacitor.getPlatform()

  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: "#111315" })
    await StatusBar.setOverlaysWebView({ overlay: false })
  } catch {
    // Status bar APIs can be unavailable in browser-style test environments.
  }

  try {
    dispatchNetworkStatus(await Network.getStatus())
    await Network.addListener("networkStatusChange", dispatchNetworkStatus)
  } catch {
    dispatchNetworkStatus({ connected: window.navigator.onLine, connectionType: "unknown" })
  }

  await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (closeTopNativeSurface()) return

    if (canGoBack || window.history.length > 1) {
      window.history.back()
      return
    }

    CapacitorApp.exitApp()
  })

  await CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    try {
      const incoming = new URL(url)
      const isWebLink = incoming.protocol === "https:" && incoming.hostname === "soflipco.com"
      const isCustomScheme = incoming.protocol === "com.soflipco.sawrent:"
      if (!isWebLink && !isCustomScheme) return

      const nextPath = `${incoming.pathname || "/"}${incoming.search}${incoming.hash}`
      window.location.assign(nextPath)
    } catch {
      // Ignore malformed external open events.
    }
  })

  window.setTimeout(() => {
    SplashScreen.hide().catch(() => {})
  }, 250)
}
