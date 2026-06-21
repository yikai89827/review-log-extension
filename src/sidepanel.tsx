import { createRoot, type Root } from "react-dom/client"

import SidepanelShell from "./sidepanel/SidepanelShell"
import "./sidepanel/style.css"

const MOUNTED_KEY = "__review_log_sidepanel_mounted__"
const ROOT_KEY = "__review_log_sidepanel_root__"

/** Plasmo 在 Side Panel 里偶发等不到 DOMContentLoaded，补一次挂载 */
function tryFallbackMount(): void {
  const g = globalThis as typeof globalThis & {
    [MOUNTED_KEY]?: boolean
    [ROOT_KEY]?: Root
  }
  if (g[MOUNTED_KEY]) return

  const el = document.getElementById("__plasmo")
  if (!el) return
  if (el.childNodes.length > 0) {
    g[MOUNTED_KEY] = true
    return
  }

  // 仍在 loading 时交给 Plasmo 默认逻辑
  if (document.readyState === "loading") return

  g[MOUNTED_KEY] = true
  g[ROOT_KEY] = createRoot(el)
  g[ROOT_KEY].render(<SidepanelShell />)
}

function scheduleFallbackMount(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      requestAnimationFrame(tryFallbackMount)
    })
  } else {
    requestAnimationFrame(tryFallbackMount)
  }
}

scheduleFallbackMount()

export default SidepanelShell
