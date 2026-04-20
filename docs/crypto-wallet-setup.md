# Crypto Payment Setup

Saw Rent keeps rental deposits, credits, and refunds accounted for in USD. BTC and XMR are payment rails only.

## Default Static TXID Mode

The normal production mode for this app is a low-volume manual crypto flow:

1. Saw Rent creates a live USD quote for BTC or XMR.
2. The customer sends the exact quoted crypto amount to the configured static receive address.
3. The customer submits the transaction ID/hash.
4. An admin manually verifies the transaction and confirms, marks underpaid, cancels, or regenerates the quote.

Configure the public receive destinations server-side:

```env
CRYPTO_MODE=static_txid
CRYPTO_DESTINATION_PROVIDER=static_txid
CRYPTO_MONITORING_PROVIDER=none
CRYPTO_MONITOR_SCHEDULER_ENABLED=false
CRYPTO_BTC_STATIC_ADDRESS=bc1...
CRYPTO_XMR_STATIC_ADDRESS=43...
```

`CRYPTO_BTC_RECEIVING_ADDRESS` and `CRYPTO_XMR_RECEIVING_ADDRESS` remain supported as compatibility aliases, but the `*_STATIC_ADDRESS` names are preferred.

## Quote And Refund Basis

Crypto quotes store:

- USD deposit amount
- refundable USD basis
- quote source
- coin/USD rate
- quoted crypto amount
- quote timestamp
- expiration timestamp
- submitted customer TXID and note

The quoted crypto amount is locked only until expiration. Later refunds or credits must use the stored USD basis first, then convert only if the refund is sent by crypto at that future time.

## Legacy Provider Isolation

Older wallet-backed allocation and monitor modules are isolated behind provider/config switches and are not part of the default admin flow. Static TXID mode expects manual review from the submitted transaction hash.

## Admin Review Helpers

When a customer submits a TXID, the admin reservation queue shows:

- a coin-specific explorer link
- copy buttons for TXID, expected amount, receive address, and USD basis
- a verification checklist for amount, TXID, destination, quote time, and expiration
- an action timeline with customer submission and admin action notes

Admin notes entered while confirming paid, marking underpaid, or cancelling are stored in the crypto payment event history with the action timestamp.
