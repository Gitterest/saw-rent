export function normalizeCryptoTxid(txid) {
  const normalized = String(txid || "").trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : ""
}

export function getCryptoExplorerUrl(currency, txid) {
  const normalizedTxid = normalizeCryptoTxid(txid)
  if (!normalizedTxid) return ""

  const normalizedCurrency = String(currency || "").trim().toUpperCase()
  if (normalizedCurrency === "BTC") {
    return `https://mempool.space/tx/${normalizedTxid}`
  }
  if (normalizedCurrency === "XMR") {
    return `https://xmrchain.net/tx/${normalizedTxid}`
  }

  return ""
}

export function getCryptoCopyFields(entry = {}) {
  const txid = normalizeCryptoTxid(entry.customerSubmittedTxid || entry.blockchainTxid)
  return [
    txid ? { key: "txid", label: "Copy TXID", value: txid } : null,
    entry.expectedCryptoAmount || entry.cryptoAmount
      ? {
          key: "expectedCryptoAmount",
          label: "Copy expected amount",
          value: `${entry.expectedCryptoAmount || entry.cryptoAmount} ${entry.cryptoCurrency || ""}`.trim(),
        }
      : null,
    entry.cryptoAddress ? { key: "walletAddress", label: "Copy wallet address", value: entry.cryptoAddress } : null,
    Number.isFinite(Number(entry.depositUsdAmount))
      ? { key: "depositUsdAmount", label: "Copy USD basis", value: `$${Number(entry.depositUsdAmount).toFixed(2)}` }
      : null,
  ].filter(Boolean)
}
