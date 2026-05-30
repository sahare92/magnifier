const {
  app, BrowserWindow, globalShortcut, ipcMain,
  Tray, Menu, screen, nativeImage, desktopCapturer, session,
} = require('electron');
const path = require('path');
const fs = require('fs');

// ── macOS capture-path fix ──────────────────────────────────────────────────
// On modern macOS, Electron captures the screen via Apple's ScreenCaptureKit.
// That path has two behaviours that break this magnifier:
//   1. It IGNORES BrowserWindow.setContentProtection(true) — Electron's docs
//      state ScreenCaptureKit "will capture your window despite
//      setContentProtection(true)". So the always-on-top overlay captures
//      itself and re-magnifies the lens → infinite recursive zoom.
//   2. When a source is pre-selected via setDisplayMediaRequestHandler, the
//      renderer's `cursor: 'never'` constraint is dropped and the OS cursor is
//      baked into the screen feed → cursor visible inside the lens.
// Forcing Electron back onto the legacy CoreGraphics capture path fixes both:
// that path honours content protection (NSWindowSharingNone excludes the
// overlay) and respects cursor exclusion. These switches MUST be appended
// before the app `ready` event fires.
app.commandLine.appendSwitch(
  'disable-features',
  'ScreenCaptureKitMac,ScreenCaptureKitStreamPickerSonoma,ScreenCaptureKitPickerScreen'
);

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  zoom: 3,
  lensSize: 200,
  shape: 'circle',
  shortcut: 'CommandOrControl+Shift+M',
};

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

let overlayWin = null;
let toolbarWin = null;
let launcherWin = null;
let tray = null;
let magnifierActive = false;
let config = loadConfig();
let mousePollInterval = null;
let currentShortcut = null;

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  overlayWin = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  overlayWin.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  // Exclude this window from the desktopCapturer feed — prevents the overlay
  // from capturing itself and causing recursive/infinite-regress rendering.
  overlayWin.setContentProtection(true);
}

function createToolbar() {
  toolbarWin = new BrowserWindow({
    width: 520, height: 68,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  const { width } = screen.getPrimaryDisplay().bounds;
  toolbarWin.setPosition(Math.round((width - 520) / 2), 8);
  toolbarWin.loadFile(path.join(__dirname, 'toolbar.html'));
  toolbarWin.setAlwaysOnTop(true, 'screen-saver');
  toolbarWin.setContentProtection(true);
}

function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 400, height: 340,
    resizable: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f17',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  launcherWin.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWin.on('closed', () => { launcherWin = null; });
}

function broadcastMagnifierState() {
  if (launcherWin) launcherWin.webContents.send('magnifier-state', magnifierActive);
  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: magnifierActive ? 'Stop Magnifier' : 'Start Magnifier', click: toggleMagnifier },
      { label: 'Show Window', click: () => { if (launcherWin) launcherWin.focus(); else createLauncher(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { saveConfig(config); app.quit(); } },
    ]));
  }
}

function registerShortcut(accelerator) {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
    currentShortcut = null;
  }
  try {
    const ok = globalShortcut.register(accelerator, toggleMagnifier);
    if (ok) { currentShortcut = accelerator; return true; }
  } catch (e) {}
  return false;
}

async function showMagnifier() {
  magnifierActive = true;
  broadcastMagnifierState();

  // Validate that at least one screen source is available before creating windows.
  // The actual stream is acquired in the renderer via getDisplayMedia (see the
  // setDisplayMediaRequestHandler in app.whenReady) — the modern path honors
  // content protection (no recursive capture of the overlay) and supports
  // cursor: 'never' (no baked-in OS cursor inside the lens).
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    });
    if (!sources.length) throw new Error('No screen sources available');
  } catch (err) {
    magnifierActive = false;
    broadcastMagnifierState();
    if (launcherWin) launcherWin.webContents.send('capture-error', err.message);
    return;
  }

  createOverlay();
  createToolbar();

  // Windows are only starting to load now — did-finish-load will not have fired yet
  overlayWin.webContents.once('did-finish-load', () => {
    overlayWin.webContents.send('config', config);
    overlayWin.webContents.send('start-capture');
  });
  toolbarWin.webContents.once('did-finish-load', () => {
    toolbarWin.webContents.send('config', config);
  });

  // Poll mouse at 8ms (~120Hz) — overlay is click-through so mousemove never fires there
  mousePollInterval = setInterval(() => {
    if (!overlayWin) return;
    overlayWin.webContents.send('mouse-pos', screen.getCursorScreenPoint());
  }, 8);
}

function hideMagnifier() {
  magnifierActive = false;
  if (mousePollInterval) { clearInterval(mousePollInterval); mousePollInterval = null; }
  if (overlayWin) { overlayWin.destroy(); overlayWin = null; }
  if (toolbarWin) { toolbarWin.destroy(); toolbarWin = null; }
  saveConfig(config);
  broadcastMagnifierState();
}

function toggleMagnifier() {
  if (magnifierActive) hideMagnifier(); else showMagnifier();
}

ipcMain.on('config-update', (_, updates) => {
  config = { ...config, ...updates };
  if (overlayWin) overlayWin.webContents.send('config', config);
});
ipcMain.on('close-magnifier', () => hideMagnifier());
ipcMain.on('toggle-magnifier', () => toggleMagnifier());

ipcMain.on('set-shortcut', (_, accelerator) => {
  const ok = registerShortcut(accelerator);
  if (ok) {
    config.shortcut = accelerator;
    saveConfig(config);
  }
  if (launcherWin) launcherWin.webContents.send('shortcut-result', { ok, accelerator });
});

ipcMain.handle('get-config', () => config);

ipcMain.on('scroll-zoom', (_, delta) => { if (toolbarWin) toolbarWin.webContents.send('do-zoom', delta); });
ipcMain.on('key-zoom', (_, delta) => { if (toolbarWin) toolbarWin.webContents.send('do-zoom', delta); });
ipcMain.on('toolbar-drag', (_, { dx, dy }) => {
  if (!toolbarWin) return;
  const [x, y] = toolbarWin.getPosition();
  toolbarWin.setPosition(x + dx, y + dy);
});
ipcMain.on('capture-error', (_, msg) => {
  if (launcherWin) launcherWin.webContents.send('capture-error', msg);
  hideMagnifier();
});

app.whenReady().then(() => {
  // Modern screen-capture path. The renderer calls navigator.mediaDevices.getDisplayMedia();
  // this handler picks the primary screen and excludes the OS cursor from the feed.
  // Combined with overlayWin.setContentProtection(true), the overlay window itself is
  // omitted from the capture, which is what stops the recursive "magnify the magnifier"
  // regress and removes the cursor from inside the lens.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0] });
    }).catch(() => callback({}));
  }, { useSystemPicker: false });

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
  trayIcon.setTemplateImage(true);

  tray = new Tray(trayIcon);
  tray.setToolTip('Zchuchit Magnifier');
  tray.on('click', () => { if (launcherWin) launcherWin.focus(); else createLauncher(); });

  registerShortcut(config.shortcut);
  broadcastMagnifierState();
  createLauncher();
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); saveConfig(config); });
app.on('window-all-closed', (e) => e.preventDefault());
