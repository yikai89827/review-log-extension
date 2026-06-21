import "./ContextMenu.css"

export interface ContextMenuItem {
  label: string
  onClick: () => void
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="context-menu" style={{ left: x, top: y }}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="context-menu-item"
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
