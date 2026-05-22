import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  AppWindow,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type ThemeId = 'neko-tron' | 'pearl-white' | 'abyss-teal' | 'ember' | 'mosswood' | 'rose-noir'

type LauncherApp = {
  id: string
  name: string
  repo: string
  description: string
  accent: string
  icon: string
  category: string
  executablePath: string | null
  installedVersion: string | null
  latestVersion: string | null
  releaseUrl: string | null
  releaseCheckedAt: string | null
  releaseNotes: string | null
  visible: boolean
}

type AppSettings = {
  theme: ThemeId
  compactLabels: boolean
}

type ControlCenterState = {
  settings: AppSettings
  apps: LauncherApp[]
  buildVersion: string
  dataDir: string
}

type Theme = {
  id: ThemeId
  name: string
  colors: string[]
}

const themes: Theme[] = [
  { id: 'neko-tron', name: 'Neko Tron', colors: ['#050505', '#17100a', '#ff6a00'] },
  { id: 'pearl-white', name: 'Pearl', colors: ['#ffffff', '#f0f0f6', '#635bdc'] },
  { id: 'abyss-teal', name: 'Abyss', colors: ['#161d1f', '#1f2a2c', '#2ec4b6'] },
  { id: 'ember', name: 'Ember', colors: ['#241e18', '#352c24', '#f2a65a'] },
  { id: 'mosswood', name: 'Moss', colors: ['#18201b', '#233028', '#4cc38a'] },
  { id: 'rose-noir', name: 'Rose', colors: ['#21191b', '#322629', '#e07383'] },
]

const fallbackState: ControlCenterState = {
  settings: { theme: 'neko-tron', compactLabels: false },
  buildVersion: 'dev',
  dataDir: '',
  apps: [
    app('batchlapse', 'BatchLapse', 'BatchLapse', 'Batch tools for image and media workflows.', '#5b8def', 'BL', 'Work Stuff'),
    app('depth-map-ai-generator', 'DepthMap AI', 'DepthMapAIGenerator', 'Depth map generation utilities.', '#43b883', 'DM', 'Work Stuff'),
    app('image-to-ascii-3d', 'ASCII 3D', 'ImageToASCII3D', 'Image-to-ASCII 3D conversion.', '#f0a848', 'A3', 'Work Stuff'),
    app('markrush', 'MarkRush', 'MarkRush', 'Markdown-focused writing and publishing tools.', '#e05d7b', 'MR', 'Work Stuff'),
    app('opensplit', 'OpenSplit', 'OpenSplit', 'Split-screen and window workflow utility.', '#4fb6d8', 'OS', 'Work Stuff'),
    app('venice-media-local', 'Venice Media', 'VeniceMediaLocal', 'Local Venice media generator.', '#34c6a3', 'VM', 'Work Stuff'),
    app('walletwitness', 'WalletWitness', 'WalletWitness', 'Wallet and transaction inspection utility.', '#e3b342', 'WW', 'Work Stuff'),
    app('purpleplanet', 'PurplePlanet', 'PurplePlanet', 'Creative app from the ForPublic collection.', '#8c65df', 'PP', 'Fun Stuff'),
    app('stargaze', 'StarGaze', 'StarGaze', 'Astronomy and sky-oriented utility.', '#6b7cff', 'SG', 'Fun Stuff'),
  ],
}

function app(id: string, name: string, repo: string, description: string, accent: string, icon: string, category: string): LauncherApp {
  return {
    id,
    name,
    repo,
    description,
    accent,
    icon,
    category,
    executablePath: null,
    installedVersion: null,
    latestVersion: null,
    releaseUrl: null,
    releaseCheckedAt: null,
    releaseNotes: null,
    visible: true,
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is not active')
  }
  return invoke<T>(command, args)
}

function classNames(...items: Array<string | false | null | undefined>): string {
  return items.filter(Boolean).join(' ')
}

function formatCheckedAt(value: string | null): string {
  if (!value) return 'Not checked'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Checked'
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function versionStatus(appInfo: LauncherApp): 'ready' | 'update' | 'unknown' {
  if (!appInfo.latestVersion) return 'unknown'
  if (!appInfo.installedVersion) return 'ready'
  return appInfo.installedVersion === appInfo.latestVersion ? 'ready' : 'update'
}

function fileName(path: string | null): string {
  if (!path) return ''
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function categoryLabel(category: string): string {
  const value = category.trim()
  return value || 'Work Stuff'
}

type GridItem =
  | { kind: 'category'; id: string; label: string }
  | { kind: 'app'; app: LauncherApp }

function gridItems(apps: LauncherApp[]): GridItem[] {
  const items: GridItem[] = []
  let lastCategory = ''

  for (const appInfo of apps) {
    const category = categoryLabel(appInfo.category)
    if (category !== lastCategory) {
      items.push({ kind: 'category', id: `category-${category}`, label: category })
      lastCategory = category
    }
    items.push({ kind: 'app', app: appInfo })
  }

  return items
}

function moveApp(apps: LauncherApp[], fromId: string, toId: string): LauncherApp[] {
  if (fromId === toId) return apps
  const fromIndex = apps.findIndex((candidate) => candidate.id === fromId)
  const toIndex = apps.findIndex((candidate) => candidate.id === toId)
  if (fromIndex < 0 || toIndex < 0) return apps

  const nextApps = [...apps]
  const [moved] = nextApps.splice(fromIndex, 1)
  nextApps.splice(toIndex, 0, moved)
  return nextApps
}

export default function App() {
  const [state, setState] = useState<ControlCenterState>(fallbackState)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('Ready')
  const [selectedId, setSelectedId] = useState<string>('venice-media-local')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const visibleApps = useMemo(() => state.apps.filter((candidate) => candidate.visible), [state.apps])
  const selectedApp = useMemo(
    () => visibleApps.find((candidate) => candidate.id === selectedId) ?? visibleApps[0] ?? state.apps[0],
    [selectedId, state.apps, visibleApps],
  )

  const configuredCount = visibleApps.filter((candidate) => candidate.executablePath).length
  const updateCount = visibleApps.filter((candidate) => versionStatus(candidate) === 'update').length
  const hiddenCount = state.apps.length - visibleApps.length
  const visibleGridItems = useMemo(() => gridItems(visibleApps), [visibleApps])

  useEffect(() => {
    void loadState()
  }, [])

  async function loadState() {
    if (!isTauriRuntime()) {
      setNotice('Browser preview. Launching and saved paths work in the desktop runtime.')
      return
    }

    try {
      const nextState = await call<ControlCenterState>('get_state')
      setState(nextState)
      const nextVisibleApps = nextState.apps.filter((candidate) => candidate.visible)
      setSelectedId((current) => nextVisibleApps.some((candidate) => candidate.id === current) ? current : nextVisibleApps[0]?.id ?? nextState.apps[0]?.id ?? '')
      setNotice('Ready')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function scanForUpdates() {
    setBusy(true)
    setNotice('Scanning GitHub releases...')
    try {
      const apps = await call<LauncherApp[]>('scan_releases')
      setState((current) => ({ ...current, apps }))
      setNotice('Release scan complete')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function launchSelected() {
    if (!selectedApp) return
    setBusy(true)
    setNotice(`Launching ${selectedApp.name}...`)
    try {
      await call<void>('launch_app', { request: { appId: selectedApp.id } })
      setNotice(`${selectedApp.name} launched`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function chooseExecutable(appInfo: LauncherApp) {
    if (!isTauriRuntime()) {
      setNotice('Executable selection is available in the desktop runtime.')
      return
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Windows executable', extensions: ['exe'] }],
    })
    if (typeof selected !== 'string') return

    try {
      const apps = await call<LauncherApp[]>('save_executable', {
        request: { appId: appInfo.id, executablePath: selected },
      })
      setState((current) => ({ ...current, apps }))
      setNotice(`${appInfo.name} executable saved`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function openRelease(appInfo: LauncherApp) {
    try {
      await call<void>('open_release_url', { request: { appId: appInfo.id } })
    } catch (error) {
      window.open(appInfo.releaseUrl ?? `https://github.com/flashosophy/${appInfo.repo}/releases`, '_blank', 'noopener')
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function setTheme(theme: ThemeId) {
    setState((current) => ({ ...current, settings: { ...current.settings, theme } }))
    if (!isTauriRuntime()) return
    try {
      const settings = await call<AppSettings>('save_settings', { request: { theme } })
      setState((current) => ({ ...current, settings }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function setCompactLabels(compactLabels: boolean) {
    setState((current) => ({ ...current, settings: { ...current.settings, compactLabels } }))
    if (!isTauriRuntime()) return
    try {
      const settings = await call<AppSettings>('save_settings', { request: { compactLabels } })
      setState((current) => ({ ...current, settings }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function persistLayout(apps: LauncherApp[], message: string) {
    setState((current) => ({ ...current, apps }))
    const nextVisibleApps = apps.filter((candidate) => candidate.visible)
    setSelectedId((current) => nextVisibleApps.some((candidate) => candidate.id === current) ? current : nextVisibleApps[0]?.id ?? apps[0]?.id ?? '')

    if (!isTauriRuntime()) {
      setNotice(message)
      return
    }

    try {
      const savedApps = await call<LauncherApp[]>('save_layout', { request: { apps } })
      setState((current) => ({ ...current, apps: savedApps }))
      setNotice(message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  function handleDrop(targetId: string) {
    if (!draggedId) return
    const apps = moveApp(state.apps, draggedId, targetId)
    setDraggedId(null)
    if (apps !== state.apps) {
      void persistLayout(apps, 'Layout saved')
    }
  }

  function setAppVisible(appId: string, visible: boolean) {
    const visibleCount = state.apps.filter((candidate) => candidate.visible).length
    if (!visible && visibleCount <= 1) {
      setNotice('At least one app must stay visible')
      return
    }
    const apps = state.apps.map((candidate) => candidate.id === appId ? { ...candidate, visible } : candidate)
    void persistLayout(apps, visible ? 'App shown' : 'App hidden')
  }

  async function resetLayout() {
    setBusy(true)
    try {
      if (!isTauriRuntime()) {
        const apps = fallbackState.apps.map((candidate) => ({ ...candidate, visible: true }))
        setState((current) => ({ ...current, apps }))
        setSelectedId(apps[0]?.id ?? '')
        setNotice('Layout reset')
        return
      }

      const apps = await call<LauncherApp[]>('reset_layout')
      setState((current) => ({ ...current, apps }))
      setSelectedId(apps.find((candidate) => candidate.visible)?.id ?? apps[0]?.id ?? '')
      setNotice('Layout reset')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={classNames('app-shell', `theme-${state.settings.theme}`, state.settings.compactLabels && 'compact-labels')}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <h1>Neko Legends Control Center</h1>
            <p>{configuredCount}/{visibleApps.length} apps wired · {updateCount} updates{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => setSettingsOpen((open) => !open)} title="Theme settings">
            <Settings2 size={17} />
          </button>
          <button className="scan-button" type="button" onClick={scanForUpdates} disabled={busy} title="Scan GitHub releases">
            {busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            Scan
          </button>
        </div>
      </header>

      {settingsOpen && (
        <section className="settings-band">
          <div className="settings-main">
            <div className="theme-row">
              {themes.map((theme) => (
                <button
                  className={classNames('theme-button', state.settings.theme === theme.id && 'active')}
                  type="button"
                  key={theme.id}
                  onClick={() => void setTheme(theme.id)}
                  title={theme.name}
                >
                  <span className="swatches">
                    {theme.colors.map((color) => <i key={color} style={{ background: color }} />)}
                  </span>
                  <strong>{theme.name}</strong>
                </button>
              ))}
            </div>
            <div className="visibility-row" aria-label="Visible apps">
              {state.apps.map((appInfo) => (
                <label className={classNames('app-toggle', !appInfo.visible && 'hidden')} key={appInfo.id} title={appInfo.name}>
                  <input
                    type="checkbox"
                    checked={appInfo.visible}
                    onChange={(event) => setAppVisible(appInfo.id, event.currentTarget.checked)}
                  />
                  <span>{appInfo.icon}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="settings-actions">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={state.settings.compactLabels}
                onChange={(event) => void setCompactLabels(event.currentTarget.checked)}
              />
              <span>Compact labels</span>
            </label>
            <button className="secondary-action reset-action" type="button" onClick={resetLayout} disabled={busy}>
              Reset layout
            </button>
          </div>
        </section>
      )}

      <main className="launcher-layout">
        <section
          className="app-grid"
          aria-label="App launcher"
          style={{ '--visible-count': visibleApps.length } as React.CSSProperties}
        >
          {visibleGridItems.map((item) => {
            if (item.kind === 'category') {
              return (
                <div className="category-row" key={item.id}>
                  <span>{`-= ${item.label} =-`}</span>
                </div>
              )
            }

            const appInfo = item.app
            const selected = appInfo.id === selectedApp?.id
            const status = versionStatus(appInfo)
            return (
              <button
                key={appInfo.id}
                type="button"
                className={classNames('app-tile', selected && 'selected')}
                style={{ '--app-accent': appInfo.accent } as React.CSSProperties}
                draggable
                onDragStart={(event) => {
                  setDraggedId(appInfo.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', appInfo.id)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDragEnd={() => setDraggedId(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  handleDrop(appInfo.id)
                }}
                onClick={() => setSelectedId(appInfo.id)}
                onDoubleClick={() => appInfo.executablePath ? void launchSelected() : void chooseExecutable(appInfo)}
              >
                <span className="app-icon">{appInfo.icon}</span>
                <span className="app-copy">
                  <strong>{appInfo.name}</strong>
                  <small>{status === 'update' ? 'Update ready' : appInfo.executablePath ? 'Ready' : 'Set path'}</small>
                </span>
                {status === 'update' && <span className="update-dot" />}
              </button>
            )
          })}
        </section>

        {selectedApp && (
          <aside className="detail-panel">
            <div className="detail-heading">
              <div className="detail-icon" style={{ '--app-accent': selectedApp.accent } as React.CSSProperties}>
                {selectedApp.icon}
              </div>
              <div>
                <h2>{selectedApp.name}</h2>
                <p>{selectedApp.description}</p>
              </div>
            </div>

            <div className="detail-meta">
              <div>
                <span>Repository</span>
                <strong>flashosophy/{selectedApp.repo}</strong>
              </div>
              <div>
                <span>Release</span>
                <strong>{selectedApp.latestVersion ?? 'Unknown'}</strong>
              </div>
              <div>
                <span>Checked</span>
                <strong>{formatCheckedAt(selectedApp.releaseCheckedAt)}</strong>
              </div>
              <div>
                <span>Executable</span>
                <strong>{selectedApp.executablePath ? fileName(selectedApp.executablePath) : 'Not set'}</strong>
              </div>
            </div>

            <div className="detail-actions">
              <button className="primary-action" type="button" onClick={launchSelected} disabled={busy || !selectedApp.executablePath}>
                <Play size={17} />
                Launch
              </button>
              <button className="secondary-action" type="button" onClick={() => void chooseExecutable(selectedApp)}>
                <FolderOpen size={17} />
                Path
              </button>
              <button className="secondary-action" type="button" onClick={() => void openRelease(selectedApp)}>
                {versionStatus(selectedApp) === 'update' ? <Download size={17} /> : <ExternalLink size={17} />}
                Release
              </button>
            </div>

            <div className="release-note">
              <AppWindow size={16} />
              <span>{selectedApp.releaseNotes ?? 'Scan releases when you want the hub to check GitHub.'}</span>
            </div>
          </aside>
        )}
      </main>

      <footer className="statusbar">
        <span>{notice}</span>
        <span>v{state.buildVersion}</span>
      </footer>
    </div>
  )
}
