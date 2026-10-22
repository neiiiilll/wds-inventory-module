import { useCallback, useEffect, useRef, useState } from "react"

import {
  InventoryApiError,
  listInventoryItems,
  updateInventoryItem,
  type InventoryItemDto,
} from "../services/inventory-api"

export default function InventoryItemsPage({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<InventoryItemDto[]>([])
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current
    setErrorMessage("")
    if (items.length === 0) setLoading(true)
    else setRefreshing(true)
    try {
      const response = await listInventoryItems({ search: search || undefined, limit: 100 })
      if (sequence !== requestSequence.current) return
      setItems(response.items)
    } catch (error) {
      if (sequence !== requestSequence.current) return
      setErrorMessage(error instanceof InventoryApiError ? error.message : "Inventory could not be loaded.")
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [search, items.length])

  useEffect(() => { void load() }, [search])

  const toggleActive = async (item: InventoryItemDto) => {
    if (savingId) return
    setSavingId(item.id)
    setErrorMessage("")
    try {
      const updated = await updateInventoryItem({
        id: item.id,
        expectedVersion: item.version,
        changes: { active: !item.active },
      })
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
    } catch (error) {
      if (error instanceof InventoryApiError && error.code === "aborted") {
        setErrorMessage("This item changed elsewhere. Reload the latest item and try again.")
      } else {
        setErrorMessage(error instanceof InventoryApiError ? error.message : "The item could not be updated.")
      }
    } finally {
      setSavingId(null)
    }
  }

  return <>
    <div className="page-header">
      <div>
        <span className="eyebrow">INVENTORY CATALOG</span>
        <h1>Inventory list</h1>
        <p>Live tenant-scoped items and stock balances from the inventory database.</p>
      </div>
      <div className="page-actions">
        <button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>

    <section className="panel edge-inventory">
      <div className="filters edge-inventory-toolbar">
        <label className="search-field">
          <span className="sr-only">Search inventory</span>
          <input
            className="field"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search item code or name"
          />
        </label>
        {refreshing && <span className="edge-refreshing" role="status">Updating inventory…</span>}
      </div>

      {errorMessage && <div className="edge-state edge-error" role="alert">
        <p>{errorMessage}</p>
        <button className="btn btn-secondary" type="button" onClick={() => void load()}>Retry</button>
      </div>}

      {loading && items.length === 0 ? (
        <div className="edge-state" role="status">Loading inventory…</div>
      ) : items.length === 0 ? (
        <div className="edge-state"><strong>No inventory items found</strong><p>Try a different search or refresh the list.</p></div>
      ) : (
        <div className="table-wrap inventory-table">
          <table>
            <thead><tr><th>ITEM</th><th>CATEGORY</th><th>UNIT</th><th>BALANCE</th><th>MINIMUM</th><th>STATUS</th><th>VERSION</th>{canEdit && <th>ACTION</th>}</tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}>
              <td><div className="item-cell"><span>{item.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.itemCode}</small></div></div></td>
              <td>{item.categoryName}</td>
              <td>{item.unitName}{item.unitSymbol ? ` (${item.unitSymbol})` : ""}</td>
              <td><strong>{item.quantity.toLocaleString()}</strong></td>
              <td>{item.minimumQuantity.toLocaleString()}</td>
              <td><span className={`badge ${item.active ? "badge-available" : "badge-out"}`}><i />{item.active ? "Active" : "Inactive"}</span></td>
              <td>v{item.version}</td>
              {canEdit && <td><button className="btn btn-ghost" type="button" disabled={savingId !== null} onClick={() => void toggleActive(item)}>{savingId === item.id ? "Saving…" : item.active ? "Deactivate" : "Activate"}</button></td>}
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  </>
}
