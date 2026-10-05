import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import './stockControls.css'

const DEFAULT_UNIT = 'τμχ'
const BLOCKING_STATUSES = new Set(['zero', 'limited'])

function normalizeStatus(value) {
  return value === 'zero' || value === 'limited' ? value : 'none'
}

function parseQuantity(value) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const normalized = text.replace(',', '.')
  const number = Number(normalized)

  if (!Number.isFinite(number) || number < 0) return undefined
  return number
}

function findTaskRow(taskId) {
  if (!taskId) return null

  return Array.from(document.querySelectorAll('[data-task-id]')).find(
    (element) => String(element.dataset.taskId || '') === String(taskId)
  ) || null
}

function getActiveTaskId() {
  const activeItem = document.querySelector('.task-item-active')
  const row = activeItem?.closest?.('[data-task-id]')
  const rawId = String(row?.dataset?.taskId || '')

  return /^\d+$/.test(rawId) ? rawId : null
}

export default function StockControls() {
  const [host, setHost] = useState(null)
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [taskState, setTaskState] = useState(null)
  const [quantityInput, setQuantityInput] = useState('')
  const [unitInput, setUnitInput] = useState(DEFAULT_UNIT)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const cacheRef = useRef(new Map())
  const userIdRef = useRef(null)
  const hostRef = useRef(null)
  const activeTaskIdRef = useRef(null)

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId
  }, [activeTaskId])

  function rememberTaskState(row) {
    if (!row?.id) return

    const id = String(row.id)
    const normalized = {
      id,
      completed: Boolean(row.completed),
      stock_status: normalizeStatus(row.stock_status),
      stock_quantity: row.stock_quantity ?? null,
      stock_unit: String(row.stock_unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT,
    }

    cacheRef.current.set(id, normalized)

    const taskRow = findTaskRow(id)
    if (taskRow && taskRow.dataset.stockStatus !== normalized.stock_status) {
      taskRow.dataset.stockStatus = normalized.stock_status
    }

    window.dispatchEvent(new CustomEvent('task-stock-state', { detail: normalized }))

    if (String(activeTaskIdRef.current || '') === id) {
      setTaskState(normalized)
      setQuantityInput(
        normalized.stock_quantity === null || normalized.stock_quantity === undefined
          ? ''
          : String(normalized.stock_quantity).replace('.', ',')
      )
      setUnitInput(normalized.stock_unit || DEFAULT_UNIT)
    }
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      userIdRef.current = data?.user?.id || null
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let stopped = false
    let frameId = null
    let syncTimer = null
    let syncing = false
    let retryAfter = 0
    let retryTimer = null

    async function syncVisibleTaskStates() {
      if (stopped || syncing || Date.now() < retryAfter) return

      const ids = Array.from(document.querySelectorAll('[data-task-id]'))
        .map((element) => String(element.dataset.taskId || ''))
        .filter((id) => /^\d+$/.test(id))

      const uniqueIds = [...new Set(ids)]
      const missingIds = uniqueIds.filter((id) => !cacheRef.current.has(id))

      if (missingIds.length === 0) {
        for (const id of uniqueIds) {
          const cached = cacheRef.current.get(id)
          const taskRow = findTaskRow(id)
          if (cached && taskRow && taskRow.dataset.stockStatus !== cached.stock_status) {
            taskRow.dataset.stockStatus = cached.stock_status
          }
        }
        return
      }

      syncing = true
      try {
        for (let index = 0; index < missingIds.length; index += 100) {
          const batch = missingIds.slice(index, index + 100)
          const { data, error: fetchError } = await supabase
            .from('tasks')
            .select('id, completed, stock_status, stock_quantity, stock_unit')
            .in('id', batch)

          if (stopped) return

          if (fetchError) {
            retryAfter = Date.now() + 10000
            retryTimer = window.setTimeout(() => void syncVisibleTaskStates(), 10000)
            console.error('Stock state preload failed:', fetchError)
            return
          }

          for (const row of data || []) rememberTaskState(row)
        }
      } finally {
        syncing = false
      }
    }

    function ensureHostAndSelection() {
      if (stopped) return

      if (frameId) cancelAnimationFrame(frameId)

      frameId = requestAnimationFrame(() => {
        frameId = null
        if (stopped) return

        const detailsPanel =
          document.querySelector('.details-drawer.open .details-panel') ||
          document.querySelector('.details-panel')
        const noteInput = detailsPanel?.querySelector('.note-input')

        if (noteInput?.parentElement) {
          let nextHost = detailsPanel.querySelector('.task-stock-controls-host')

          if (!nextHost) {
            nextHost = document.createElement('div')
            nextHost.className = 'task-stock-controls-host'
            noteInput.parentElement.insertBefore(nextHost, noteInput)
          }

          hostRef.current = nextHost
          setHost((current) => (current === nextHost ? current : nextHost))
        } else {
          hostRef.current = null
          setHost(null)
        }

        const nextTaskId = getActiveTaskId()
        setActiveTaskId((current) => (current === nextTaskId ? current : nextTaskId))

        if (syncTimer) clearTimeout(syncTimer)
        syncTimer = window.setTimeout(() => {
          void syncVisibleTaskStates()
        }, 120)
      })
    }

    const root = document.getElementById('root')
    const observer = new MutationObserver(ensureHostAndSelection)

    if (root) {
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'data-task-id'],
      })
    }

    ensureHostAndSelection()
    void syncVisibleTaskStates()

    return () => {
      stopped = true
      observer.disconnect()
      if (frameId) cancelAnimationFrame(frameId)
      if (syncTimer) clearTimeout(syncTimer)
      if (retryTimer) clearTimeout(retryTimer)

      if (hostRef.current?.isConnected) {
        hostRef.current.remove()
      }

      hostRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!activeTaskId) {
      setTaskState(null)
      setQuantityInput('')
      setUnitInput(DEFAULT_UNIT)
      setError('')
      return
    }

    const cached = cacheRef.current.get(String(activeTaskId))
    if (cached) {
      setTaskState(cached)
      setQuantityInput(
        cached.stock_quantity === null || cached.stock_quantity === undefined
          ? ''
          : String(cached.stock_quantity).replace('.', ',')
      )
      setUnitInput(cached.stock_unit || DEFAULT_UNIT)
    }

    let cancelled = false
    setLoading(true)
    setError('')

    supabase
      .from('tasks')
      .select('id, completed, stock_status, stock_quantity, stock_unit')
      .eq('id', activeTaskId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return

        if (fetchError) {
          console.error('Stock state load failed:', fetchError)
          setError('Δεν φορτώθηκε η κατάσταση αποθέματος.')
          return
        }

        if (data) rememberTaskState(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTaskId])

  useEffect(() => {
    const channel = supabase
      .channel(`task-stock-guard-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = String(payload.old?.id || '')
            if (id) cacheRef.current.delete(id)
            return
          }

          if (payload.new) rememberTaskState(payload.new)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    function blockCompletionWhenNeeded(event) {
      const target = event.target
      if (!(target instanceof Element)) return

      const checkbox = target.closest('.task-select-indicator')
      if (!checkbox) return

      const row = checkbox.closest('[data-task-id]')
      const taskId = String(row?.dataset?.taskId || '')
      if (!/^\d+$/.test(taskId)) return

      const cachedStatus = cacheRef.current.get(taskId)?.stock_status
      const status = normalizeStatus(cachedStatus || row?.dataset?.stockStatus)

      if (!BLOCKING_STATUSES.has(status)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()

      setToast(
        status === 'zero'
          ? 'Δεν μπορεί να ολοκληρωθεί: είναι ενεργό το Μηδενικό Απόθεμα.'
          : 'Δεν μπορεί να ολοκληρωθεί: είναι ενεργό το Περιορισμένο Απόθεμα.'
      )
    }

    document.addEventListener('click', blockCompletionWhenNeeded, true)
    return () => document.removeEventListener('click', blockCompletionWhenNeeded, true)
  }, [])

  useEffect(() => {
    if (!toast) return

    const timer = window.setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  async function persistPatch(patch) {
    if (!activeTaskId || saving) return null

    setSaving(true)
    setError('')

    const nextPatch = { ...patch }
    if (userIdRef.current) nextPatch.updated_by = userIdRef.current

    const { data, error: updateError } = await supabase
      .from('tasks')
      .update(nextPatch)
      .eq('id', activeTaskId)
      .select('id, completed, stock_status, stock_quantity, stock_unit')
      .single()

    setSaving(false)

    if (updateError) {
      console.error('Stock state update failed:', updateError)
      setError('Δεν αποθηκεύτηκε η αλλαγή αποθέματος.')
      return null
    }

    rememberTaskState(data)
    return data
  }

  async function handleToggleStatus(status) {
    if (!taskState || loading || saving) return

    if (taskState.completed) {
      setError('Η εργασία είναι ήδη ολοκληρωμένη. Κάνε πρώτα αναίρεση της ολοκλήρωσης.')
      return
    }

    const currentStatus = normalizeStatus(taskState.stock_status)
    const nextStatus = currentStatus === status ? 'none' : status

    const patch = {
      stock_status: nextStatus,
      stock_quantity: nextStatus === 'limited' ? null : null,
    }

    if (nextStatus === 'limited') {
      patch.stock_unit = String(taskState.stock_unit || unitInput || DEFAULT_UNIT).trim() || DEFAULT_UNIT
    }

    await persistPatch(patch)
  }

  async function saveLimitedDetails() {
    if (!activeTaskId || !taskState || taskState.stock_status !== 'limited' || saving) return

    const quantity = parseQuantity(quantityInput)
    if (quantity === undefined) {
      setError('Βάλε έγκυρη ποσότητα αποθέματος.')
      return
    }

    const unit = String(unitInput || '').trim() || DEFAULT_UNIT

    await persistPatch({
      stock_quantity: quantity,
      stock_unit: unit,
    })
  }

  const panel = host ? (
    <div className="task-stock-panel" aria-label="Κατάσταση αποθέματος">
      <div className="task-stock-title">Απόθεμα</div>

      <button
        type="button"
        className={`stock-toggle stock-zero ${taskState?.stock_status === 'zero' ? 'active' : ''}`}
        onClick={() => void handleToggleStatus('zero')}
        disabled={loading || saving || !taskState}
        aria-pressed={taskState?.stock_status === 'zero'}
      >
        <span className="stock-toggle-check" aria-hidden="true">
          {taskState?.stock_status === 'zero' ? '✓' : ''}
        </span>
        <span>Μηδενικό Απόθεμα</span>
      </button>

      <div className="stock-limited-row">
        <button
          type="button"
          className={`stock-toggle stock-limited ${taskState?.stock_status === 'limited' ? 'active' : ''}`}
          onClick={() => void handleToggleStatus('limited')}
          disabled={loading || saving || !taskState}
          aria-pressed={taskState?.stock_status === 'limited'}
        >
          <span className="stock-toggle-check" aria-hidden="true">
            {taskState?.stock_status === 'limited' ? '✓' : ''}
          </span>
          <span>Περιορισμένο Απόθεμα</span>
        </button>

        <div className="stock-limited-inputs">
          <input
            type="text"
            inputMode="decimal"
            className="stock-quantity-input"
            aria-label="Διαθέσιμη ποσότητα"
            placeholder="Ποσότητα"
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
            onBlur={() => void saveLimitedDetails()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            disabled={loading || saving || taskState?.stock_status !== 'limited'}
          />

          <input
            type="text"
            className="stock-unit-input"
            aria-label="Μονάδα μέτρησης"
            placeholder={DEFAULT_UNIT}
            value={unitInput}
            onChange={(event) => setUnitInput(event.target.value)}
            onBlur={() => void saveLimitedDetails()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            disabled={loading || saving || taskState?.stock_status !== 'limited'}
          />
        </div>
      </div>

      <div className="task-stock-help">
        Όσο είναι ενεργή μία από τις δύο επιλογές, η εργασία δεν μπορεί να ολοκληρωθεί.
      </div>

      {loading && <div className="task-stock-state-message">Φόρτωση...</div>}
      {saving && <div className="task-stock-state-message">Αποθήκευση...</div>}
      {error && <div className="task-stock-error">{error}</div>}
    </div>
  ) : null

  return (
    <>
      {host && panel ? createPortal(panel, host) : null}
      {toast
        ? createPortal(
            <div className="task-stock-toast" role="status">
              {toast}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
