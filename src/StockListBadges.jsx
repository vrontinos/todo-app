import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './stockListBadges.css'

const DEFAULT_UNIT = 'τμχ'

function normalizeStatus(value) {
  return value === 'zero' || value === 'limited' ? value : 'none'
}

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).replace('.', ',')
}

function getTaskRows(taskId) {
  const id = String(taskId || '')
  if (!id) return []

  return Array.from(document.querySelectorAll('[data-task-id]')).filter(
    (element) => String(element.dataset.taskId || '') === id
  )
}

function cleanupCreatedMetaLine(metaLine) {
  if (!metaLine?.classList?.contains('task-stock-meta-line-created')) return
  if (metaLine.children.length === 0) metaLine.remove()
}

function getOrCreateMetaLine(row) {
  const textBlock = row?.querySelector('.task-text-block')
  if (!textBlock) return null

  let metaLine = textBlock.querySelector(':scope > .task-meta-line')
  if (metaLine) return metaLine

  metaLine = document.createElement('div')
  metaLine.className = 'task-meta-line task-stock-meta-line-created'

  const title = textBlock.querySelector(':scope > .task-title')
  if (title) {
    title.insertAdjacentElement('afterend', metaLine)
  } else {
    textBlock.appendChild(metaLine)
  }

  return metaLine
}

function placeBadge(metaLine, badge) {
  if (!metaLine || !badge) return

  const notesBadge = metaLine.querySelector(':scope > .task-notes-count')
  if (notesBadge) {
    notesBadge.insertAdjacentElement('afterend', badge)
    return
  }

  metaLine.insertBefore(badge, metaLine.firstChild)
}

function applyBadgeToRow(row, task) {
  if (!row) return

  const status = normalizeStatus(task?.stock_status)
  const existing = row.querySelector(':scope .task-stock-list-badge')

  if (status === 'none') {
    const oldMetaLine = existing?.parentElement
    existing?.remove()
    cleanupCreatedMetaLine(oldMetaLine)
    return
  }

  const metaLine = getOrCreateMetaLine(row)
  if (!metaLine) return

  const quantity = formatQuantity(task?.stock_quantity)
  const unit = String(task?.stock_unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT
  const signature = `${status}|${quantity}|${unit}`

  if (existing?.dataset?.stockSignature === signature) {
    if (existing.parentElement !== metaLine) placeBadge(metaLine, existing)
    return
  }

  const oldMetaLine = existing?.parentElement
  existing?.remove()
  cleanupCreatedMetaLine(oldMetaLine)

  const badge = document.createElement('span')
  badge.className = `task-stock-list-badge task-stock-list-badge-${status}`
  badge.dataset.stockSignature = signature
  badge.setAttribute('aria-label', status === 'zero' ? 'Μηδενικό απόθεμα' : 'Περιορισμένο απόθεμα')

  const desktopText = document.createElement('span')
  desktopText.className = 'task-stock-badge-desktop'

  const mobileText = document.createElement('span')
  mobileText.className = 'task-stock-badge-mobile'

  if (status === 'zero') {
    desktopText.textContent = 'Χωρίς απόθεμα'
    mobileText.textContent = '0 απόθεμα'
    badge.title = 'Μηδενικό Απόθεμα'
  } else {
    const detail = quantity ? `${quantity} ${unit}` : ''
    desktopText.textContent = detail ? `Περ. απόθεμα · ${detail}` : 'Περιορισμένο απόθεμα'
    mobileText.textContent = detail || 'Περ. απόθεμα'
    badge.title = detail ? `Περιορισμένο Απόθεμα: ${detail}` : 'Περιορισμένο Απόθεμα'
  }

  badge.append(desktopText, mobileText)
  placeBadge(metaLine, badge)
}

export default function StockListBadges() {
  const cacheRef = useRef(new Map())

  useEffect(() => {
    let stopped = false
    let frameId = null
    let syncTimer = null
    const taskRefreshTimers = new Map()

    function remember(row) {
      if (!row?.id) return

      const task = {
        id: String(row.id),
        stock_status: normalizeStatus(row.stock_status),
        stock_quantity: row.stock_quantity ?? null,
        stock_unit: String(row.stock_unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT,
      }

      cacheRef.current.set(task.id, task)
      for (const taskRow of getTaskRows(task.id)) applyBadgeToRow(taskRow, task)
    }

    function decorateCachedRows() {
      for (const [taskId, task] of cacheRef.current.entries()) {
        for (const row of getTaskRows(taskId)) applyBadgeToRow(row, task)
      }
    }

    async function refreshTask(taskId) {
      const id = String(taskId || '')
      if (stopped || !/^\d+$/.test(id)) return

      const { data, error } = await supabase
        .from('tasks')
        .select('id, stock_status, stock_quantity, stock_unit')
        .eq('id', id)
        .maybeSingle()

      if (stopped) return

      if (error) {
        console.error('Stock list badge refresh failed:', error)
        return
      }

      if (data) remember(data)
    }

    function scheduleTaskRefresh(taskId) {
      const id = String(taskId || '')
      if (!/^\d+$/.test(id)) return

      const previous = taskRefreshTimers.get(id)
      if (previous) clearTimeout(previous)

      const timer = window.setTimeout(() => {
        taskRefreshTimers.delete(id)
        cacheRef.current.delete(id)
        void refreshTask(id)
      }, 40)

      taskRefreshTimers.set(id, timer)
    }

    function activeTaskId() {
      const active = document.querySelector('.task-item-active')?.closest?.('[data-task-id]')
      const id = String(active?.dataset?.taskId || '')
      return /^\d+$/.test(id) ? id : null
    }

    async function syncVisibleTasks() {
      if (stopped) return

      const ids = [
        ...new Set(
          Array.from(document.querySelectorAll('[data-task-id]'))
            .map((element) => String(element.dataset.taskId || ''))
            .filter((id) => /^\d+$/.test(id))
        ),
      ]

      if (ids.length === 0) return

      const missing = ids.filter((id) => !cacheRef.current.has(id))

      for (let index = 0; index < missing.length; index += 100) {
        const batch = missing.slice(index, index + 100)
        const { data, error } = await supabase
          .from('tasks')
          .select('id, stock_status, stock_quantity, stock_unit')
          .in('id', batch)

        if (stopped) return

        if (error) {
          console.error('Stock list badge preload failed:', error)
          return
        }

        for (const task of data || []) remember(task)
      }

      decorateCachedRows()
    }

    function scheduleRefresh() {
      if (stopped) return
      if (frameId) cancelAnimationFrame(frameId)

      frameId = requestAnimationFrame(() => {
        frameId = null
        if (stopped) return

        decorateCachedRows()

        if (syncTimer) clearTimeout(syncTimer)
        syncTimer = window.setTimeout(() => {
          void syncVisibleTasks()
        }, 100)
      })
    }

    function handleMutations(mutations) {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-stock-status') {
          const row = mutation.target?.closest?.('[data-task-id]')
          scheduleTaskRefresh(row?.dataset?.taskId)
          continue
        }

        const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement
        if (target?.closest?.('.task-stock-controls-host')) {
          scheduleTaskRefresh(activeTaskId())
        }
      }

      scheduleRefresh()
    }

    const root = document.getElementById('root')
    const observer = new MutationObserver(handleMutations)

    if (root) {
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-task-id', 'data-stock-status', 'class'],
      })
    }

    const channel = supabase
      .channel(`task-stock-list-badges-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = String(payload.old?.id || '')
            cacheRef.current.delete(id)
            for (const row of getTaskRows(id)) {
              const badge = row.querySelector(':scope .task-stock-list-badge')
              const metaLine = badge?.parentElement
              badge?.remove()
              cleanupCreatedMetaLine(metaLine)
            }
            return
          }

          if (payload.new) remember(payload.new)
        }
      )
      .subscribe()

    scheduleRefresh()
    void syncVisibleTasks()

    return () => {
      stopped = true
      observer.disconnect()
      if (frameId) cancelAnimationFrame(frameId)
      if (syncTimer) clearTimeout(syncTimer)
      for (const timer of taskRefreshTimers.values()) clearTimeout(timer)
      taskRefreshTimers.clear()
      void supabase.removeChannel(channel)

      document.querySelectorAll('.task-stock-list-badge').forEach((badge) => {
        const metaLine = badge.parentElement
        badge.remove()
        cleanupCreatedMetaLine(metaLine)
      })
    }
  }, [])

  return null
}
