// Extension resource timings and BiDi network events omit moz-extension loads.
// Inspect only real Window globals for this document, excluding WebDriver
// sandboxes and other extension tabs in the same process.
export const parsedSourceProcessScript = (
  href: string,
  channel: string,
  marker: string,
): string => `
  (() => {
    let debuggerInstance;
    try {
      const { addDebuggerToGlobal } = ChromeUtils.importESModule('resource://gre/modules/jsdebugger.sys.mjs');
      const sandbox = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { freshCompartment: true });
      addDebuggerToGlobal(sandbox);
      debuggerInstance = new sandbox.Debugger();
      const urls = new Set();
      let matched = false;
      for (const global of debuggerInstance.findAllGlobals()) {
        if (global.class !== 'Window') continue;
        const window = global.unsafeDereference();
        // findAllGlobals also includes retired documents. Never touch their dead wrappers.
        if (Cu.isDeadWrapper(window)) continue;
        if (window.location?.href !== ${JSON.stringify(href)}) continue;
        if ((window.wrappedJSObject ?? window)[${JSON.stringify(marker)}] !== ${JSON.stringify(marker)}) continue;
        matched = true;
        debuggerInstance.addDebuggee(window);
        for (const script of debuggerInstance.findScripts({ global })) {
          const url = script.source?.url ?? script.url;
          if (typeof url === 'string') urls.add(url);
        }
      }
      if (matched && urls.size) sendAsyncMessage(${JSON.stringify(channel)}, { urls: [...urls] });
    } catch (error) {
      sendAsyncMessage(${JSON.stringify(channel)}, { error: String(error) });
    } finally {
      debuggerInstance?.removeAllDebuggees();
    }
  })();
`
