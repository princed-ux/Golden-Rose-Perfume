const { contextBridge, ipcRenderer } = require("electron");

if (process.argv.includes("--golden-rose-customer-display")) {
  contextBridge.exposeInMainWorld("goldenRoseDisplay", {
    subscribe(listener) {
      const receive = (_event, sale) => listener(sale);
      ipcRenderer.on("golden-rose:customer-sale", receive);
      ipcRenderer.send("golden-rose:display-ready");
      return () =>
        ipcRenderer.removeListener("golden-rose:customer-sale", receive);
    },
  });
} else {
  contextBridge.exposeInMainWorld("goldenRoseDisplay", {
    open: () => ipcRenderer.invoke("golden-rose:open-display"),
    publish: (sale) => ipcRenderer.send("golden-rose:publish-sale", sale),
  });
}
