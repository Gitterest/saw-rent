import crypto from "node:crypto"

const COOKIE_NAME = "sawrent_admin"
const SESSION_TTL_MS = 1000 * 60 * 60 * 12

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, "base64").toString("utf8")
}

function safeCompare(a, b) {
  const left = Buffer.from(a || "", "utf8")
  const right = Buffer.from(b || "", "utf8")

  if (left.length !== right.length) {
    return false
  }

  return crypto.timingSafeEqual(left, right)
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 24) {
    throw new Error("ADMIN_SESSION_SECRET must be set with at least 24 characters.")
  }

  return secret
}

function signSessionPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex")
}

export function verifyAdminPassword(password) {
  const configured = process.env.ADMIN_PASSWORD
  if (!configured) {
    throw new Error("ADMIN_PASSWORD must be set in environment.")
  }

  return safeCompare(configured, String(password || ""))
}

export function createSessionToken(adminLabel = "owner") {
  const secret = getSessionSecret()
  const nonce = crypto.randomBytes(12).toString("hex")
  const expiresAt = String(Date.now() + SESSION_TTL_MS)
  const payload = `${adminLabel}.${expiresAt}.${nonce}`
  const signature = signSessionPayload(payload, secret)
  return base64Url(`${payload}.${signature}`)
}

export function readSessionToken(token) {
  try {
    const secret = getSessionSecret()
    const decoded = fromBase64Url(token)
    const [adminLabel, expiresAtRaw, nonce, signature] = decoded.split(".")

    if (!adminLabel || !expiresAtRaw || !nonce || !signature) {
      return null
    }

    const payload = `${adminLabel}.${expiresAtRaw}.${nonce}`
    const expected = signSessionPayload(payload, secret)
    if (!safeCompare(expected, signature)) {
      return null
    }

    const expiresAt = Number(expiresAtRaw)
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return null
    }

    return { adminLabel, expiresAt }
  } catch {
    return null
  }
}

export function setAdminCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  })
}

export function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  const session = token ? readSessionToken(token) : null

  if (!session) {
    res.status(401).json({ error: "Admin authentication required." })
    return
  }

  req.adminSession = session
  next()
}

export function readAdminSession(req) {
  const token = req.cookies?.[COOKIE_NAME]
  return token ? readSessionToken(token) : null
}

