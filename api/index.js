import path from "node:path"
import express from "express"

import { createApp } from "../server/index.js"

const app = createApp()
const distDir = path.resolve(process.cwd(), "dist")

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." })
})

app.use(express.static(distDir))

app.use((req, res, next) => {
  if (req.method !== "GET") {
    next()
    return
  }

  res.sendFile(path.join(distDir, "index.html"))
})

app.use((error, _req, res, next) => {
  void next
  const status = Number(error?.status || 500)
  const message = error?.expose || status < 500 ? error.message : "Internal server error."
  res.status(status).json({ error: message })
})

export default app
