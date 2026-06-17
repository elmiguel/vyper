// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("vyper", {
  invoke: (method, ...args) => import_electron.ipcRenderer.invoke("vyper:invoke", method, args)
});
//# sourceMappingURL=preload.cjs.map
