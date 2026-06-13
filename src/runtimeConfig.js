import { Capacitor } from "@capacitor/core"

const WEB_API_ROOT = "/api"
const ANDROID_API_ROOT = "https://soflipco.com/api"
const PUBLIC_APP_ORIGIN = "https://soflipco.com"
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"])

export const BACKEND_UNAVAILABLE_MESSAGE =
  "Saw Rent could not reach the backend. Check your connection and try again."

export function isNativePlatform() {
  return Capacitor.isNativePlatform()
}

function normalizeRoot(value, fallback) {
  const raw = String(value || "").trim()
  if (!raw) return fallback
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

function readEnvValue(...keys) {
  for (const key of keys) {
    const value = import.meta.env[key]
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }

  return ""
}

function isLocalApiRoot(value) {
  try {
    const url = new URL(value)
    return LOCAL_API_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function normalizeConfiguredRoot(value, fallback) {
  const normalized = normalizeRoot(value, fallback)
  const allowLocalApi = import.meta.env.VITE_ALLOW_LOCAL_API === "true"

  if (import.meta.env.PROD && !allowLocalApi && isLocalApiRoot(normalized)) {
    return fallback
  }

  return normalized
}

export function getApiRoot() {
  const explicitRoot = readEnvValue("VITE_API_BASE_URL", "VITE_API_ROOT")
  if (explicitRoot) {
    return normalizeConfiguredRoot(explicitRoot, WEB_API_ROOT)
  }

  if (isNativePlatform()) {
    const androidRoot = readEnvValue("VITE_ANDROID_API_BASE_URL", "VITE_ANDROID_API_ROOT")
    return normalizeConfiguredRoot(androidRoot, ANDROID_API_ROOT)
  }

  return WEB_API_ROOT
}

export function getPublicAppOrigin() {
  const explicitOrigin = readEnvValue("VITE_PUBLIC_APP_ORIGIN")
  if (explicitOrigin) {
    return normalizeRoot(explicitOrigin, PUBLIC_APP_ORIGIN)
  }

  if (isNativePlatform()) {
    return PUBLIC_APP_ORIGIN
  }

  return window.location.origin
}
