import { Component, type ErrorInfo, type ReactNode } from "react"

import { isExtensionContextValid } from "../utils/extensionContext"
import App from "./App"

interface Props {
  children?: ReactNode
}

interface State {
  error: Error | null
}

class SidepanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ReviewLog Sidepanel]", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="sidepanel-fallback">
          <h2>侧边栏加载失败</h2>
          <p>{this.state.error.message}</p>
          <p className="sidepanel-fallback-hint">请关闭侧边栏后重新打开，或在扩展管理页重新加载扩展。</p>
        </div>
      )
    }
    return this.props.children
  }
}

function InvalidContextView() {
  return (
    <div className="sidepanel-fallback">
      <h2>扩展已重载</h2>
      <p>当前侧边栏连接已失效，无法继续显示日志。</p>
      <ol className="sidepanel-fallback-steps">
        <li>关闭此侧边栏</li>
        <li>在 <code>chrome://extensions</code> 点击扩展的「重新加载」</li>
        <li>重新打开侧边栏，并刷新调试页面</li>
      </ol>
    </div>
  )
}

export default function SidepanelShell() {
  if (!isExtensionContextValid()) {
    return <InvalidContextView />
  }

  return (
    <SidepanelErrorBoundary>
      <App />
    </SidepanelErrorBoundary>
  )
}
