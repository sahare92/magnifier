// Keyboard shortcuts for the magnifier.
// Electron accelerator format: https://www.electronjs.org/docs/latest/api/accelerator
//
// Supported modifiers: Command, Control, CommandOrControl, Alt, Option, Shift, Super
// NOTE: 'Fn' is not a supported modifier in Electron globalShortcut.
//       Use Option (Alt) as a substitute for Fn-style shortcuts.
//
// TOGGLE is the default shortcut; it can also be changed at runtime from the
// launcher window and is persisted in config.json — editing it here only affects
// fresh installs (i.e. when no config.json exists yet).

module.exports = {
  TOGGLE:   'CommandOrControl+Shift+M',

  ZOOM_IN:  'Shift+Plus',
  ZOOM_OUT: 'Shift+-',

  SIZE_INC: 'Option+Plus',
  SIZE_DEC: 'Option+-',
};
