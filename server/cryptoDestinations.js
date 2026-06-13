import crypto from "node:crypto"

function destinationError(message, status = 503) {
  const error = new Error(message)
  error.status = status
  error.expose = true
  return error
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim()
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

function buildJsonHeaders(token = "") {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function appendPath(baseUrl, fallbackPath) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  return /\/(addresses|allocate)$/i.test(normalized) ? normalized : `${normalized}${fallbackPath}`
}

function stableLocalAddress(prefix, requestId, attempt) {
  const seed = `${prefix}:${requestId}:${attempt}:${crypto.randomUUID()}`
  return crypto.createHash("sha256").update(seed).digest("hex")
}

export class LocalDevCryptoDestinationProvider {
  async createDestination({ currency, requestId, attempt }) {
    const digest = stableLocalAddress(currency, requestId, attempt)

    if (currency === "BTC") {
      return {
        address: `btc_dev_${digest.slice(0, 42)}`,
        provider: "local-dev-btc-destination",
        unique: true,
        destinationAllocationState: "allocated",
        btcDerivationIndex: attempt,
        btcDerivationPath: `local-dev/${requestId}/${attempt}`,
        destinationMetadata: {
          mode: "local-dev",
        },
      }
    }

    return {
      address: `xmr_dev_${digest}${digest.slice(0, 31)}`,
      provider: "local-dev-xmr-destination",
      unique: true,
      destinationAllocationState: "allocated",
      xmrAccountIndex: 0,
      xmrSubaddressIndex: attempt,
      destinationMetadata: {
        mode: "local-dev",
      },
    }
  }
}

export class StaticCryptoDestinationProvider {
  constructor({ btcAddress = "", xmrAddress = "" } = {}) {
    this.addresses = {
      BTC: String(btcAddress || "").trim(),
      XMR: String(xmrAddress || "").trim(),
    }
  }

  async createDestination({ currency }) {
    const address = this.addresses[currency]
    if (!address) {
      throw destinationError(`${currency} static receive address is not configured.`)
    }

    return {
      address,
      provider: currency === "BTC" ? "static-btc-address" : "static-xmr-address",
      unique: false,
      destinationAllocationState: "static_configured",
      destinationMetadata: {
        mode: "static_txid",
      },
    }
  }
}

export class BtcWalletServiceDestinationProvider {
  constructor({
    allocateUrl = "",
    token = "",
    account = "",
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.allocateUrl = appendPath(allocateUrl, "/btc/addresses")
    this.token = token
    this.account = account
    this.fetchImpl = fetchImpl
  }

  async createDestination({ requestId, paymentId, attempt }) {
    if (!this.allocateUrl) {
      throw destinationError("BTC wallet allocation endpoint is not configured.")
    }
    if (typeof this.fetchImpl !== "function") {
      throw destinationError("Server fetch is unavailable for BTC destination allocation.")
    }

    const response = await this.fetchImpl(this.allocateUrl, {
      method: "POST",
      headers: buildJsonHeaders(this.token),
      body: JSON.stringify({
        requestId,
        paymentId,
        attempt,
        account: this.account || undefined,
        label: `Saw Rent ${requestId}`,
      }),
    })

    if (!response.ok) {
      throw destinationError(`BTC wallet allocation failed (${response.status}).`)
    }

    const payload = await response.json()
    const address = String(payload.address || payload.receiveAddress || "").trim()
    const derivationIndex = Number.parseInt(payload.derivationIndex ?? payload.index, 10)

    if (!address) {
      throw destinationError("BTC wallet allocation did not return an address.")
    }
    if (!Number.isFinite(derivationIndex) || derivationIndex < 0) {
      throw destinationError("BTC wallet allocation did not return a derivation index.")
    }

    return {
      address,
      provider: payload.provider || "btc-wallet-service",
      unique: true,
      destinationAllocationState: "allocated",
      btcDerivationIndex: derivationIndex,
      btcDerivationPath: String(payload.derivationPath || ""),
      destinationMetadata: {
        account: String(payload.account || this.account || ""),
        walletReference: String(payload.walletReference || ""),
      },
    }
  }
}

export class MoneroWalletRpcDestinationProvider {
  constructor({
    rpcUrl = "",
    username = "",
    password = "",
    accountIndex = 0,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.rpcUrl = normalizeBaseUrl(rpcUrl)
    this.username = username
    this.password = password
    this.accountIndex = Number.isFinite(Number(accountIndex)) ? Number(accountIndex) : 0
    this.fetchImpl = fetchImpl
  }

  async rpc(method, params) {
    if (!this.rpcUrl) {
      throw destinationError("Monero wallet RPC URL is not configured.")
    }
    if (typeof this.fetchImpl !== "function") {
      throw destinationError("Server fetch is unavailable for Monero destination allocation.")
    }

    const headers = buildJsonHeaders()
    if (this.username || this.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`
    }

    const response = await this.fetchImpl(`${this.rpcUrl}/json_rpc`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `saw-rent-${Date.now()}`,
        method,
        params,
      }),
    })

    if (!response.ok) {
      throw destinationError(`Monero wallet RPC ${method} failed (${response.status}).`)
    }

    const payload = await response.json()
    if (payload.error) {
      throw destinationError(`Monero wallet RPC ${method} failed: ${payload.error.message || payload.error.code}`)
    }

    return payload.result || {}
  }

  async createDestination({ requestId, attempt }) {
    const result = await this.rpc("create_address", {
      account_index: this.accountIndex,
      label: `Saw Rent ${requestId} attempt ${attempt}`,
    })
    const address = String(result.address || "").trim()
    const subaddressIndex = Number.parseInt(result.address_index, 10)

    if (!address) {
      throw destinationError("Monero wallet RPC did not return a subaddress.")
    }
    if (!Number.isFinite(subaddressIndex) || subaddressIndex < 0) {
      throw destinationError("Monero wallet RPC did not return a subaddress index.")
    }

    return {
      address,
      provider: "xmr-wallet-rpc",
      unique: true,
      destinationAllocationState: "allocated",
      xmrAccountIndex: this.accountIndex,
      xmrSubaddressIndex: subaddressIndex,
      destinationMetadata: {
        accountIndex: this.accountIndex,
      },
    }
  }
}

export class WalletCryptoDestinationProvider {
  constructor({ btcProvider, xmrProvider } = {}) {
    this.btcProvider = btcProvider
    this.xmrProvider = xmrProvider
  }

  async createDestination(args) {
    if (args.currency === "BTC") {
      if (!this.btcProvider) throw destinationError("BTC wallet destination provider is not configured.")
      return this.btcProvider.createDestination(args)
    }

    if (args.currency === "XMR") {
      if (!this.xmrProvider) throw destinationError("XMR wallet destination provider is not configured.")
      return this.xmrProvider.createDestination(args)
    }

    throw destinationError("Crypto currency must be BTC or XMR.", 400)
  }
}

export function createCryptoDestinationProvider(config = {}, options = {}) {
  const mode = String(config.mode || "").trim().toLowerCase()
  if (["", "static", "static_txid"].includes(mode)) {
    return new StaticCryptoDestinationProvider(config.static || {})
  }

  if (mode === "local-dev") {
    return new LocalDevCryptoDestinationProvider()
  }

  return new WalletCryptoDestinationProvider({
    btcProvider: options.btcProvider || new BtcWalletServiceDestinationProvider(config.btc || {}),
    xmrProvider: options.xmrProvider || new MoneroWalletRpcDestinationProvider(config.xmr || {}),
  })
}
