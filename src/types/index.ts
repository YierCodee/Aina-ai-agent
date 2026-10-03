/**
 * Tipe global frontend.
 */

export type SidecarStatus = {
  running: boolean
  url: string
  detail: string
}

export type HealthResponse = {
  status: string
  version: string
  uptime_seconds?: number
}
