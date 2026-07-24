let apiBase = '/api'
let loaded: Promise<void> | null = null

interface RuntimeConfig {
  apiBase?: string
}

export function loadRuntimeConfig(): Promise<void> {
  if (!loaded) {
    loaded = fetch('/config.json')
      .then((r) => (r.ok ? (r.json() as Promise<RuntimeConfig>) : null))
      .then((data) => {
        if (data?.apiBase) apiBase = data.apiBase.replace(/\/+$/, '')
      })
      .catch(() => {})
  }
  return loaded
}

export function apiPath(path: string): string {
  return `${apiBase}${path.startsWith('/') ? path : `/${path}`}`
}
