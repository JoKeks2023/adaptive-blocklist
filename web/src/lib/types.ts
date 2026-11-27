export type RiskLevel = 'low' | 'medium' | 'high'

export interface Risk {
  level: RiskLevel
  text: string
}

export interface BuildInfo {
  time: string
  commit: string
  version: string
  status: string
  generator: string
  repository?: string
}

export interface ModuleEntry {
  id: string
  name: string
  description: string
  risk: Risk | null
  domains: number
  file: string
  bytes: number
  sources: string[]
  pending_sources: string[]
  include_deny: boolean
}

export interface ProfileEntry {
  id: string
  name: string
  description: string
  modules: string[]
  vendors?: string[]
  domains: number
  file: string
  bytes: number
}

export interface SourceEntry {
  id: string
  name: string
  homepage: string
  license: string
  license_url: string
  purpose: string
  format: string
  status: string
  domains: number
  error: string | null
}

export interface Catalog {
  schema_version: number
  build: BuildInfo
  modules: ModuleEntry[]
  vendors?: ModuleEntry[]
  profiles: ProfileEntry[]
  sources: SourceEntry[]
}

/** Modules and vendors currently enabled, plus the profile (device type) they started from. */
export interface Selection {
  profileId: string
  modules: string[]
  vendors: string[]
}
