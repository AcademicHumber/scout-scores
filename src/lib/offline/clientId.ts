"use client"

import { getMeta, setMeta } from "./db"

let cachedClientId: string | null = null

export async function getOrCreateClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId

  const stored = await getMeta("clientId")
  if (typeof stored === "string") {
    cachedClientId = stored
    return stored
  }

  // Genera un UUID v4 compatible con todos los browsers modernos
  const id = crypto.randomUUID()
  await setMeta("clientId", id)
  cachedClientId = id
  return id
}
