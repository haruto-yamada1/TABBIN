const linkCaptureMessagesEn = {
  'options.linkClickCapture.title': 'Link saving gesture',
  'options.linkClickCapture.enable': 'Enable key + click saving',
  'options.linkClickCapture.instructions':
    'Hold the recorded key and left-click a link to save it without opening it. When the same key is used for link selection, dragging selects links and clicking saves one. Ctrl, Alt, Shift and Meta combinations are reserved for standard link actions and cannot be registered here.',
  'options.linkClickCapture.reserved':
    'This key conflicts with a browser, OS or standard link action. Choose a key without Ctrl, Alt, Shift or Meta.',
  'options.linkCapture.title': 'Select and save links',
  'options.linkCapture.enable': 'Enable link selection and saving',
  'options.linkCapture.description':
    'Allow access to HTTP and HTTPS sites to select links. Browser pages, extension stores, protected sites and embedded frames are unavailable. No page text is saved or sent to third parties.',
  'options.linkCapture.instructions':
    'Hold the key and drag with the left mouse button. Release the key or press Escape to cancel. To save one focused link using the keyboard, hold the key and press Enter.',
  'options.linkCapture.physical':
    'Keys use their physical position (KeyboardEvent.code); the label shows the character from your keyboard layout. Browser and OS shortcuts cannot be used. Some operating systems intercept keys before the browser can receive them.',
  'options.linkCapture.change': 'Change key',
  'options.linkCapture.save': 'Save key',
  'options.linkCapture.reset': 'Reset key',
  'options.linkCapture.cancel': 'Cancel',
  'options.linkCapture.recording':
    'Press a key or key combination. Release a modifier to use it alone. Recording ends after 10 seconds.',
  'options.linkCapture.permissionError':
    'Site access was not granted. The feature stays off. Enable it again to retry, or review site access in your browser’s extension settings.',
  'options.linkCapture.loadError':
    'Could not load these settings. Reload the settings page to try again.',
  'options.linkCapture.storageError':
    'Could not save these settings. Your previous setting is still shown. Try again.',
  'options.linkCapture.unavailable':
    'No usable key event was received. The browser or operating system may reserve this key. Try a different key.',
  'options.linkCapture.composition':
    'IME composition and AltGraph cannot be used as activation keys. Finish composition and try a different key.',
  'options.linkCapture.reserved':
    'This key conflicts with a browser or OS operation. Choose a different key.',
  'options.linkCapture.saved': 'Key saved.',
} as const

export { linkCaptureMessagesEn }
