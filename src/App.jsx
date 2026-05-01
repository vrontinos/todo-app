import taskCompleteSoundFile from './assets/sounds/task-complete.mp3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from './supabaseClient'
import './App.css'

import { isTauri } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { checkForUpdates } from './tauriUpdates'

const LIST_DND_PREFIX = 'list:'
const TASK_DND_PREFIX = 'task:'
const TASK_LIST_DROP_PREFIX = 'tasklist:'
const MOBILE_BREAKPOINT = 1024
const ADMIN_LOGS_EMAIL = 'eshop@vrontinos.gr'

function getIsTouchDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  )
}

function getListDndId(id) {
  return `${LIST_DND_PREFIX}${id}`
}

function getTaskDndId(id) {
  return `${TASK_DND_PREFIX}${id}`
}

function getTaskListDropId(id) {
  return `${TASK_LIST_DROP_PREFIX}${id}`
}

function parseDndId(value) {
  const id = String(value || '')

  if (id.startsWith(LIST_DND_PREFIX)) {
    return { type: 'list', rawId: id.slice(LIST_DND_PREFIX.length) }
  }

  if (id.startsWith(TASK_DND_PREFIX)) {
    return { type: 'task', rawId: id.slice(TASK_DND_PREFIX.length) }
  }

  if (id.startsWith(TASK_LIST_DROP_PREFIX)) {
    return { type: 'task-list-target', rawId: id.slice(TASK_LIST_DROP_PREFIX.length) }
  }

  return { type: null, rawId: id }
}

function normalizeId(rawId) {
  if (/^\d+$/.test(String(rawId))) {
    return Number(rawId)
  }
  return rawId
}

function autoResizeTextarea(element) {
  if (!element) return

  // 🔥 reset τελείως το height
  element.style.height = '0px'

  // 🔥 force reflow (πολύ σημαντικό για mobile)
  element.offsetHeight

  // 🔥 βάλε σωστό ύψος
  element.style.height = `${element.scrollHeight}px`
}

function getTaskTimerSeconds(task) {
  const savedSeconds = Number(task?.timer_elapsed_seconds) || 0

  if (!task?.timer_started_at || task?.completed) {
    return savedSeconds
  }

  const startedAt = new Date(task.timer_started_at).getTime()
  if (!Number.isFinite(startedAt)) return savedSeconds

  return savedSeconds + Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}

function formatTaskTimer(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0)

  const days = Math.floor(safeSeconds / 86400)
  const hours = Math.floor((safeSeconds % 86400) / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)

  const parts = []

  if (days > 0) parts.push(`${days}μ`)
  if (hours > 0 || days > 0) parts.push(`${hours}ω`)
  parts.push(`${minutes}λ`)

  return parts.join(' ')
}

function TaskListDropZone({ listId, disabled, className = '', children, forceActive = false }) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: getTaskListDropId(listId),
    disabled,
  })

  const isTaskOver =
    forceActive || (isOver && String(active?.id || '').startsWith(TASK_DND_PREFIX))

  return (
    <div
      ref={setNodeRef}
      data-task-over={isTaskOver ? 'true' : 'false'}
      className={`${className} ${isTaskOver ? 'task-drop-active' : ''}`.trim()}
    >
      {children}
    </div>
  )
}

function SortableListItem({
  list,
  isActive,
  isDraggingNative,
  incompleteCount,
  completedCount,
  onClick,
  onContextMenu,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: getListDndId(list.id) })

  const style = {
    transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
    transition,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`list-button ${isActive ? 'active' : ''} ${isDragging || isDraggingNative ? 'dragging' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      type="button"
      title="Σύρε λίστα για αλλαγή σειράς ή εργασία για μεταφορά εδώ"
      {...attributes}
      {...listeners}
    >
      <span className="list-button-left">
        <span className="list-grip">≡</span>
        <span className="list-name-text">{list.name}</span>
      </span>

      <div className="list-count-group">
        {incompleteCount > 0 && (
          <span className="list-count-badge incomplete" title="Μη ολοκληρωμένες">
            {incompleteCount}
          </span>
        )}

        {completedCount > 0 && (
          <span className="list-count-badge completed" title="Ολοκληρωμένες">
            {completedCount}
          </span>
        )}
      </div>
    </button>
  )
}



function SortableTaskItem({
  task,
  isActive,
  isSelected,
  isOffline,
  isSearchMode,
  isTouchDevice,
  onClick,
  onContextMenu,
  onToggleCompleted,
  onToggleStore,
  onToggleSkroutz,
  onToggleWeighing,
  onDeleteSwipe,
  onMobileLongPress,
}) {

  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [swipePassedThreshold, setSwipePassedThreshold] = useState(false)

  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)

  const swipeOffsetRef = useRef(0)
  const swipeLockedRef = useRef(false)
  const swipeStartedRef = useRef(false)

  const isTouchInput = isTouchDevice

  const swipeEnabled = isTouchInput && !isSearchMode && !isOffline
  const mobileDragEnabled = isTouchInput && !isOffline && !isSearchMode && isSelected

const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({
    id: getTaskDndId(task.id),
    disabled: isOffline || isSearchMode || isSwiping,
  })

const safeListeners = listeners || {}
const dndOnTouchStart = safeListeners.onTouchStart
const { onTouchStart: _ignoredDndTouchStart, ...restListeners } = safeListeners
const showMobileSelectionDot = isTouchInput && isSelected

  const MAX_SWIPE = 96
  const DELETE_THRESHOLD = 72
  const longPressTimerRef = useRef(null)
  const longPressTriggeredRef = useRef(false)

  function resetSwipeState() {
    swipeOffsetRef.current = 0
    swipeLockedRef.current = false
    swipeStartedRef.current = false
    setSwipeOffset(0)
    setIsSwiping(false)
    setSwipePassedThreshold(false)
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function startLongPressTimer() {
    if (!isTouchInput || isOffline || isSearchMode) return

    clearLongPressTimer()
    longPressTriggeredRef.current = false

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      if (typeof onMobileLongPress === 'function') {
        onMobileLongPress(task)
      }
    }, 330)
  }

  async function commitSwipeDelete() {
    resetSwipeState()
    if (typeof onDeleteSwipe === 'function') {
      await onDeleteSwipe(task.id)
    }
  }

    function handleTouchStart(event) {
    if (event.touches.length !== 1) return

    startLongPressTimer()

    if (!swipeEnabled) return

    const touch = event.touches[0]
    touchStartXRef.current = touch.clientX
    touchStartYRef.current = touch.clientY
    swipeLockedRef.current = false
    swipeStartedRef.current = false
  }

      function handleTouchMove(event) {
    if (event.touches.length !== 1) return

    const touch = event.touches[0]
    const deltaX = touch.clientX - touchStartXRef.current
    const deltaY = touch.clientY - touchStartYRef.current
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX >= 8 || absY >= 8) {
      clearLongPressTimer()
    }

    if (!swipeEnabled) return

    if (!swipeLockedRef.current) {
      if (absX < 8 && absY < 8) return

      if (absX > absY && deltaX < 0) {
        swipeLockedRef.current = true
        swipeStartedRef.current = true
        setIsSwiping(true)
      } else {
        swipeLockedRef.current = true
        swipeStartedRef.current = false
        return
      }
    }

    if (!swipeStartedRef.current) return

    event.preventDefault()

    const nextOffset = Math.max(-MAX_SWIPE, Math.min(0, deltaX))
    swipeOffsetRef.current = nextOffset
    setSwipeOffset(nextOffset)
    setSwipePassedThreshold(Math.abs(nextOffset) >= DELETE_THRESHOLD)
  }

  function handleTouchEnd() {
    clearLongPressTimer()

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      resetSwipeState()
      return
    }

    if (!swipeEnabled) return

    if (!swipeStartedRef.current) {
      resetSwipeState()
      return
    }

    if (Math.abs(swipeOffsetRef.current) >= DELETE_THRESHOLD) {
      void commitSwipeDelete()
      return
    }

    resetSwipeState()
  }

  function handleTouchCancel() {
    clearLongPressTimer()
    longPressTriggeredRef.current = false

    if (!swipeEnabled) return
    resetSwipeState()
  }

   const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }

    const contentStyle = swipeEnabled
    ? {
        transform: `translateX(${swipeOffset}px)`,
        opacity: isDragging ? 0 : 1 - Math.min(Math.abs(swipeOffset) / DELETE_THRESHOLD, 1) * 0.45,
        transition: isSwiping ? 'none' : 'transform 180ms ease, opacity 180ms ease',
      }
    : isDragging
      ? { opacity: 0 }
      : undefined

 return (
  <div
    ref={setNodeRef}
    data-task-id={String(task.id)}
    style={style}
    className={`task-swipe-shell ${swipeEnabled ? 'task-swipe-enabled' : ''} ${swipePassedThreshold ? 'task-swipe-threshold' : ''}`}
  >
      {swipeEnabled && (
        <div className="task-swipe-delete-bg" aria-hidden="true">
          <span className="task-swipe-delete-icon">🗑</span>
        </div>
      )}

            <div
        className={`task-item task-swipe-content ${isSelected ? 'task-item-selected' : ''} ${isActive ? 'task-item-active' : ''} ${isSwiping ? 'task-item-swiping' : ''}`}
        style={contentStyle}
                onClick={(event) => {
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false
            event.preventDefault()
            event.stopPropagation()
            return
          }
          onClick(event)
        }}
        onContextMenu={(event) => {
  if (isTouchInput) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  onContextMenu(event)
}}
        onTouchStart={(event) => {
          handleTouchStart(event)
          dndOnTouchStart?.(event)
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        title={
          isSearchMode
            ? 'Εμφάνιση αποτελέσματος αναζήτησης'
            : 'Κλικ για επιλογή • Δεξί κλικ για μενού • Σύρε για αλλαγή σειράς ή σε λίστα για μεταφορά'
        }
        {...attributes}
        {...restListeners}
      >
<span
          className={`round-checkbox task-select-indicator ${task.completed ? 'is-completed' : ''} ${showMobileSelectionDot ? 'is-selected' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
          }}
 onClick={(e) => {
            e.stopPropagation()

            if (isTouchInput && isSelected) {
              onClick(e)
              return
            }

            onToggleCompleted(task)
          }}
          role="checkbox"
          aria-checked={task.completed}
          tabIndex={-1}
        />

        <div className="task-text-block">
          <span className={`task-title ${task.completed ? 'completed' : ''}`}>
            {task.title}
          </span>
<div className="task-timer-row">
  <span className="task-timer">
    Χρόνος Ολοκλήρωσης: {formatTaskTimer(getTaskTimerSeconds(task))}
  </span>
</div>
          {task.notes_count > 0 && (
            <span
              className="task-notes-count"
              title={task.notes_count === 1 ? '1 σημείωση' : `${task.notes_count} σημειώσεις`}
            >
              <span className="task-notes-icon">📝</span>
              <span>{task.notes_count}</span>
            </span>
          )}

          {isSearchMode && (
            <span className="task-list-label">Λίστα: {task.list_name || '—'}</span>
          )}
                  <div className="task-flag-row">
                <button
          type="button"
          className={`weight-toggle ${task.is_store ? 'on' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => onToggleStore(task, e)}
          title="Παραλαβή από Κατάστημα"
          disabled={isOffline}
        >
          <img src="/store.png" alt="Κατάστημα" className="flag-icon" />
        </button>

        <button
          type="button"
          className={`weight-toggle ${task.is_skroutz ? 'on' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => onToggleSkroutz(task, e)}
          title="Παραγγελία Skroutz"
          disabled={isOffline}
        >
          <img src="/skroutz.png" alt="Skroutz" className="flag-icon" />
        </button>

        <button
          type="button"
          className={`weight-toggle ${task.needs_weighing ? 'on' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => onToggleWeighing(task, e)}
          title="Για Ογκομέτρηση"
          disabled={isOffline}
        >
          <img src="/scale.png" alt="Ογκομέτρηση" className="flag-icon" />
        </button>
        </div>
      </div>
    </div>
</div>
  )
}

function SwipeableNoteItem({
  note,
  isOffline,
  isMobile,
  isTouchDevice,
  isEditing,
  editingValue,
  onStartEdit,
  onContextMenu,
  onToggleCompleted,
  onChangeEditingValue,
  onCommitInlineEdit,
  onCancelInlineEdit,
  onDeleteSwipe,
}) {
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [swipePassedThreshold, setSwipePassedThreshold] = useState(false)

  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const swipeOffsetRef = useRef(0)
  const swipeLockedRef = useRef(false)
  const swipeStartedRef = useRef(false)
  const suppressClickRef = useRef(false)

  const MAX_SWIPE = 96
  const DELETE_THRESHOLD = 72
  const swipeEnabled = isTouchDevice && !isOffline && !isEditing

  function resetSwipeState() {
    swipeOffsetRef.current = 0
    swipeLockedRef.current = false
    swipeStartedRef.current = false
    setSwipeOffset(0)
    setIsSwiping(false)
    setSwipePassedThreshold(false)
  }

  async function commitSwipeDelete() {
    resetSwipeState()
    if (typeof onDeleteSwipe === 'function') {
      await onDeleteSwipe(note.id)
    }
  }

  function handleTouchStart(event) {
    if (!swipeEnabled || event.touches.length !== 1) return

    const touch = event.touches[0]
    touchStartXRef.current = touch.clientX
    touchStartYRef.current = touch.clientY
    swipeLockedRef.current = false
    swipeStartedRef.current = false
  }

  function handleTouchMove(event) {
    if (!swipeEnabled || event.touches.length !== 1) return

    const touch = event.touches[0]
    const deltaX = touch.clientX - touchStartXRef.current
    const deltaY = touch.clientY - touchStartYRef.current
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (!swipeLockedRef.current) {
      if (absX < 8 && absY < 8) return

      if (absX > absY && deltaX < 0) {
        swipeLockedRef.current = true
        swipeStartedRef.current = true
        setIsSwiping(true)
      } else {
        swipeLockedRef.current = true
        swipeStartedRef.current = false
        return
      }
    }

    if (!swipeStartedRef.current) return

    event.preventDefault()

    const nextOffset = Math.max(-MAX_SWIPE, Math.min(0, deltaX))
    swipeOffsetRef.current = nextOffset
    setSwipeOffset(nextOffset)
    setSwipePassedThreshold(Math.abs(nextOffset) >= DELETE_THRESHOLD)
  }

  function handleTouchEnd() {
    if (!swipeEnabled) return

    if (!swipeStartedRef.current) {
      resetSwipeState()
      return
    }

    suppressClickRef.current = true

    if (Math.abs(swipeOffsetRef.current) >= DELETE_THRESHOLD) {
      void commitSwipeDelete()
      return
    }

    resetSwipeState()
  }

  function handleTouchCancel() {
    if (!swipeEnabled) return
    resetSwipeState()
  }

  const contentStyle = swipeEnabled
    ? {
        transform: `translateX(${swipeOffset}px)`,
        opacity: 1 - Math.min(Math.abs(swipeOffset) / DELETE_THRESHOLD, 1) * 0.45,
        transition: isSwiping ? 'none' : 'transform 180ms ease, opacity 180ms ease',
      }
    : undefined

  return (
    <div
      className={`note-swipe-shell ${swipeEnabled ? 'note-swipe-enabled' : ''} ${swipePassedThreshold ? 'note-swipe-threshold' : ''}`}
    >
      {swipeEnabled && (
        <div className="note-swipe-delete-bg" aria-hidden="true">
          <span className="note-swipe-delete-icon">🗑</span>
        </div>
      )}

      <div
        className={`note-item note-swipe-content ${note.completed ? 'note-item-completed' : ''} ${isSwiping ? 'note-item-swiping' : ''}`}
        style={contentStyle}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }

          if (!isSwiping && !isEditing) {
            onStartEdit(note)
          }
        }}
        onContextMenu={(event) => {
          if (isTouchDevice) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          onContextMenu(event, note)
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        title={isMobile ? 'Swipe αριστερά για διαγραφή • Κλικ για επεξεργασία' : 'Κλικ για επεξεργασία • Δεξί κλικ για μενού'}
      >
        <span className="note-dash" aria-hidden="true">🔹</span>

        {isEditing ? (
          <textarea
            className="note-inline-input"
            value={editingValue}
            rows={1}
            onChange={(e) => {
              onChangeEditingValue(e.target.value)
              autoResizeTextarea(e.target)
            }}
            onBlur={() => onCommitInlineEdit(note.id)}
            onFocus={(e) => {
              e.target.select()
              autoResizeTextarea(e.target)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onCommitInlineEdit(note.id)
              }
              if (e.key === 'Escape') {
                onCancelInlineEdit(note.id, '')
              }
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            disabled={isOffline}
            ref={(el) => {
              if (el) autoResizeTextarea(el)
            }}
          />
        ) : (
          <span className={note.completed ? 'completed' : ''}>
            {note.content}
          </span>
        )}
      </div>
    </div>
  )
}

function AdminLogsPanel({
  search,
  setSearch,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  results,
  loading,
  error,
  onClose,
  onDownloadAll,
  onDownloadTask,
  downloading,
}) {
  const trimmedSearch = search.trim()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const panelBg = isDark ? '#0b1220' : '#ffffff'
  const softBg = isDark ? '#0f172a' : '#f8fafc'
  const textColor = isDark ? '#e5e7eb' : '#111827'
  const mutedColor = isDark ? '#94a3b8' : '#64748b'
  const borderColorBase = isDark ? '#1f2937' : '#e5e7eb'
  const inputBg = isDark ? '#020617' : '#ffffff'

  const [openGroups, setOpenGroups] = useState({})

  const toggleGroup = (groupKey) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }

  const getTaskColor = (taskKey) => {
    let hash = 0

    for (let i = 0; i < taskKey.length; i += 1) {
      hash = taskKey.charCodeAt(i) + ((hash << 5) - hash)
    }

    const colors = [
      { bg: '#fee2e2', border: '#dc2626' },
      { bg: '#ffedd5', border: '#ea580c' },
      { bg: '#fef9c3', border: '#ca8a04' },
      { bg: '#dcfce7', border: '#16a34a' },
      { bg: '#ccfbf1', border: '#0d9488' },
      { bg: '#e0f2fe', border: '#0284c7' },
      { bg: '#e0e7ff', border: '#4f46e5' },
      { bg: '#f3e8ff', border: '#9333ea' },
      { bg: '#fce7f3', border: '#db2777' },
      { bg: '#f1f5f9', border: '#475569' },
      { bg: '#ecfccb', border: '#65a30d' },
      { bg: '#ffe4e6', border: '#e11d48' },
    ]

    const index = Math.abs(hash) % colors.length

    return {
      bgColor: isDark ? colors[index].border + '22' : colors[index].bg,
      borderColor: colors[index].border,
    }
  }

const getEventBadgeStyle = (eventType) => {
  const type = String(eventType || '').toLowerCase()

  const map = {
    // TASKS
    task_created: { bg: '#dbeafe', color: '#1d4ed8', label: 'TASK_CREATED' },
    task_updated: { bg: '#e0e7ff', color: '#4338ca', label: 'TASK_UPDATED' },
    task_moved: { bg: '#fef3c7', color: '#92400e', label: 'TASK_MOVED' },
    task_deleted: { bg: '#fee2e2', color: '#991b1b', label: 'TASK_DELETED' },
    task_completed: { bg: '#ccfbf1', color: '#0f766e', label: 'TASK_DONE' },
    task_uncompleted: { bg: '#e5e7eb', color: '#374151', label: 'TASK_UNDONE' },

    // NOTES
    note_created: { bg: '#f3e8ff', color: '#7e22ce', label: 'NOTE_CREATED' },
    note_updated: { bg: '#ede9fe', color: '#5b21b6', label: 'NOTE_UPDATED' },
    note_deleted: { bg: '#fee2e2', color: '#991b1b', label: 'NOTE_DELETED' },

    // LISTS
    list_created: { bg: '#dcfce7', color: '#166534', label: 'LIST_CREATED' },
    list_renamed: { bg: '#fef3c7', color: '#92400e', label: 'LIST_RENAMED' },
    list_deleted: { bg: '#fee2e2', color: '#991b1b', label: 'LIST_DELETED' },
  }

  return (
    map[type] || {
      bg: '#f1f5f9',
      color: '#475569',
      label: (eventType || 'LOG').toUpperCase(),
    }
  )
}
  const groupedResults = results.reduce((groups, log) => {
    const groupKey = String(log.task_id || log.task_title || log.list_name || 'no-task')
    const existingGroup = groups.find((group) => group.key === groupKey)

    if (existingGroup) {
      existingGroup.logs.push(log)
    } else {
      groups.push({
        key: groupKey,
        task_id: log.task_id,
        task_title: log.task_title,
        list_name: log.list_name,
        logs: [log],
      })
    }

    return groups
  }, [])

  const getGroupCreatedInfo = (logs) => {
  const createLog = logs.find((log) => {
    const type = String(log.event_type || '').toLowerCase()
    return type.includes('create') || type.includes('add')
  })

  if (createLog) {
    return createLog.created_at_greece
  }

  return logs[logs.length - 1]?.created_at_greece || '-'
}

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
      <div style={{ width: 'min(980px, 100%)', maxHeight: '92vh', background: panelBg, color: textColor, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${borderColorBase}`, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>

        <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: `1px solid ${borderColorBase}`, background: softBg }}>
  <strong style={{ fontSize: 14 }}>Αναζήτηση Logs</strong>

  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

    <button
  className="theme-toggle"
  type="button"
  onClick={() => onDownloadAll()}
  disabled={downloading}
  style={{
    fontSize: 11,
    padding: '5px 9px',
    opacity: downloading ? 0.7 : 1,
  }}
>
  {downloading ? 'Ετοιμάζω...' : 'PDF'}
</button>

    <button
      className="theme-toggle"
      type="button"
      onClick={onClose}
    >
      Κλείσιμο
    </button>

  </div>
</div>

        <div style={{ padding: 12, borderBottom: `1px solid ${borderColorBase}` }}>
<input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Αναζήτηση..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              fontSize: 13,
              background: inputBg,
              color: textColor,
              border: `1px solid ${borderColorBase}`,
              borderRadius: 10,
              outline: 'none',
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
            <label style={{ fontSize: 11, color: mutedColor }}>
              Από
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 8,
                  marginTop: 4,
                  fontSize: 11,
                  borderRadius: 8,
                  background: inputBg,
                  color: textColor,
                  border: `1px solid ${borderColorBase}`,
                  colorScheme: isDark ? 'dark' : 'light',
                }}
              />
            </label>

            <label style={{ fontSize: 11, color: mutedColor }}>
              Έως
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 8,
                  marginTop: 4,
                  fontSize: 11,
                  borderRadius: 8,
                  background: inputBg,
                  color: textColor,
                  border: `1px solid ${borderColorBase}`,
                  colorScheme: isDark ? 'dark' : 'light',
                }}
              />
            </label>
          </div>
        </div>

        <div style={{ overflow: 'auto', padding: 12 }}>
          {trimmedSearch.length < 2 && <div style={{ fontSize: 12, color: mutedColor }}>Γράψε τουλάχιστον 2 χαρακτήρες.</div>}
          {loading && <div style={{ fontSize: 12, color: mutedColor }}>Ψάχνω...</div>}
          {error && <div style={{ fontSize: 12, color: isDark ? '#fca5a5' : '#dc2626' }}>{error}</div>}
          {trimmedSearch.length >= 2 && !loading && !error && results.length === 0 && <div style={{ fontSize: 12, color: mutedColor }}>Δεν βρέθηκαν logs.</div>}

          <div style={{ display: 'grid', gap: 10 }}>
            {groupedResults.map((group) => {
              const taskKey = String(group.task_id || group.task_title || group.list_name || group.key)
              const { bgColor, borderColor } = getTaskColor(taskKey)
              const isOpen = !!openGroups[group.key]
              const createdInfo = getGroupCreatedInfo(group.logs)

              return (
                <section
                  key={group.key}
                  style={{
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    borderLeft: `6px solid ${borderColor}`,
                    borderRadius: 13,
                    background: bgColor,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      border: 0,
                      borderBottom: isOpen ? `1px solid ${isDark ? '#334155' : 'rgba(15,23,42,.12)'}` : 'none',
                      background: isDark ? 'rgba(2,6,23,.55)' : 'rgba(255,255,255,.55)',
                      color: textColor,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, overflowWrap: 'anywhere' }}>
                        <span style={{ marginRight: 7, color: textColor }}>
                          {isOpen ? '▼' : '▶'}
                        </span>
                        {group.task_title
  ? group.task_id
    ? `#${group.task_id} · ${group.task_title}`
    : `${group.task_title} (Διαγραμμένη)`
  : 'Χωρίς εργασία'}
                      </div>

                      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10, fontWeight: 600, color: isDark ? '#cbd5e1' : '#475569' }}>
                        <span>{createdInfo}</span>
                        {group.list_name && <span>Λίστα: {group.list_name}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

  <span
    style={{
      flexShrink: 0,
      padding: '3px 8px',
      fontSize: 10,
      borderRadius: 999,
      border: `1px solid ${borderColorBase}`,
      background: isDark ? '#020617' : '#ffffff',
      fontWeight: 800,
    }}
  >
    {group.logs.length}
  </span>

  <button
    type="button"
    className="theme-toggle"
    onClick={(e) => {
      e.stopPropagation()
      onDownloadTask(group.logs, group)
    }}
    style={{
      flexShrink: 0,
      fontSize: 9,
      padding: '3px 7px',
    }}
  >
    PDF
  </button>

</div>
                  </button>

                  {isOpen && (
                    <div style={{ display: 'grid', gap: 1 }}>
                      {[...group.logs].reverse().map((log) => {
                        const badge = getEventBadgeStyle(log.event_type)

                        return (
                          <div
                            key={log.id}
                            style={{
                              padding: '9px 12px',
                              background: isDark ? 'rgba(2,6,23,.18)' : 'rgba(255,255,255,.35)',
                              borderTop: `1px solid ${isDark ? 'rgba(148,163,184,.13)' : 'rgba(15,23,42,.08)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 500, color: mutedColor }}>
                                {log.created_at_greece}
                              </div>

<span
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 16,           // 👈 πιο μικρό ύψος
    minWidth: 85,         // 👈 ίδιο πλάτος αλλά πιο compact
    padding: '0 8px',
    borderRadius: '999px',
    fontSize: 8,          // 👈 πιο μικρά γράμματα
    fontWeight: 700,
    letterSpacing: '0.3px',
    background: badge.bg,
    color: badge.color,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    textAlign: 'center',
  }}
>
  {badge.label}
</span>
                            </div>

                            <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.3, fontWeight: 400, color: textColor, overflowWrap: 'anywhere' }}>
                              {log.description || log.event_type}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

function App() {

  const [session, setSession] = useState(null)
useEffect(() => {
  if (isTauri()) {
    checkForUpdates()
  }
}, [])
  const [authLoading, setAuthLoading] = useState(true)

  const [authMode, setAuthMode] = useState('signin')
  const [showCompletedTasks, setShowCompletedTasks] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [resetCooldown, setResetCooldown] = useState(0)
  const [authResetLoading, setAuthResetLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [appVersion, setAppVersion] = useState('')

  const [isTaskActionsMenuOpen, setIsTaskActionsMenuOpen] = useState(false)
const [isMobileSortMenuOpen, setIsMobileSortMenuOpen] = useState(false)
const [isMobileTaskMoveMenuOpen, setIsMobileTaskMoveMenuOpen] = useState(false)
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [isTouchDevice, setIsTouchDevice] = useState(() => getIsTouchDevice())

  const mobileSelectionClearedDuringDragRef = useRef(false)
  const [mobileView, setMobileView] = useState(() => {
  return localStorage.getItem('lastMobileView') || 'lists'
})
const [mobileDirection, setMobileDirection] = useState('forward')

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sidebarWidth'))
    return Number.isFinite(saved) && saved >= 180 ? saved : 220
  })

  const [detailsWidth, setDetailsWidth] = useState(() => {
    const saved = Number(localStorage.getItem('detailsWidth'))
    return Number.isFinite(saved) && saved >= 260 ? saved : 320
  })

  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingDetails, setIsResizingDetails] = useState(false)

  const [lists, setLists] = useState([])
  const [selectedList, setSelectedList] = useState(null)
  const [selectedLists, setSelectedLists] = useState([])
  const [listSelectionAnchorId, setListSelectionAnchorId] = useState(null)
  const [currentListRole, setCurrentListRole] = useState('owner')
  const [tasks, setTasks] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [noteCountsByTask, setNoteCountsByTask] = useState({})

  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)

  const [syncStatus, setSyncStatus] = useState('connecting')
  const [lastSyncAt, setLastSyncAt] = useState(null)

  const [taskSearch, setTaskSearch] = useState('')
  const [listSortSettings, setListSortSettings] = useState(() => {
  try {
    const saved = localStorage.getItem('listSortSettings')
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
})

  const [newListName, setNewListName] = useState('')
  const [editingListName, setEditingListName] = useState(false)
  const [editingListValue, setEditingListValue] = useState('')

  const [newTaskTitle, setNewTaskTitle] = useState('')

  const [selectedTasks, setSelectedTasks] = useState([])
  const [selectionAnchorId, setSelectionAnchorId] = useState(null)

  const [activeTask, setActiveTask] = useState(null)
  const [editingTaskTitle, setEditingTaskTitle] = useState(false)
  const [editingTaskValue, setEditingTaskValue] = useState('')

  const [taskNotes, setTaskNotes] = useState([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingNoteValue, setEditingNoteValue] = useState('')
  const [lastEditorEmail, setLastEditorEmail] = useState('')
  const [isAdminLogsOpen, setIsAdminLogsOpen] = useState(false)
  const [adminLogsSearch, setAdminLogsSearch] = useState('')
  const [adminLogsResults, setAdminLogsResults] = useState([])
  const [adminLogsLoading, setAdminLogsLoading] = useState(false)
  const [adminLogsError, setAdminLogsError] = useState('')
  const [adminLogsDateFrom, setAdminLogsDateFrom] = useState('')
  const [adminLogsDateTo, setAdminLogsDateTo] = useState('')
  const [adminLogsDownloading, setAdminLogsDownloading] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [multiMoveMenuOpen, setMultiMoveMenuOpen] = useState(false)
  const [isMobileListNameModalOpen, setIsMobileListNameModalOpen] = useState(false)

  const [shareModalList, setShareModalList] = useState(null)
  const [pendingInvites, setPendingInvites] = useState([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [inviteActionLoading, setInviteActionLoading] = useState(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareOwnerEmail, setShareOwnerEmail] = useState('')
  const [shareMembers, setShareMembers] = useState([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareSubmitting, setShareSubmitting] = useState(false)
  const [shareError, setShareError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [shareRemovingUserId, setShareRemovingUserId] = useState(null)

  const [draggedListId, setDraggedListId] = useState(null)
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [draggedTaskIds, setDraggedTaskIds] = useState([])
  const [dropIndicator, setDropIndicator] = useState(null)
  const [taskDropListId, setTaskDropListId] = useState(null)
  const [taskReorderIndicator, setTaskReorderIndicator] = useState(null)
  const [activeDragId, setActiveDragId] = useState(null)
  const [activeOverId, setActiveOverId] = useState(null)

const appRef = useRef(null)
const mainRef = useRef(null)
const mobileSearchScrollTopRef = useRef(0)
const openedTaskFromMobileSearchRef = useRef(false)

useEffect(() => {
  if (!isTauri()) return

  getVersion()
    .then((version) => {
      setAppVersion(version)
    })
    .catch((error) => {
      alert(`Version error: ${error?.message || error}`)
    })

  checkForUpdates()
}, [])

const isAdminLogsUser = session?.user?.email?.toLowerCase() === ADMIN_LOGS_EMAIL


useEffect(() => {
  if (!isAdminLogsOpen || !isAdminLogsUser) {
    setAdminLogsLoading(false)
    setAdminLogsError('')
    setAdminLogsResults([])
    return
  }

  const searchTerm = adminLogsSearch.trim()

  if (searchTerm.length < 2) {
    setAdminLogsLoading(false)
    setAdminLogsError('')
    setAdminLogsResults([])
    return
  }

  let cancelled = false
  setAdminLogsLoading(true)
  setAdminLogsError('')

  const timeoutId = window.setTimeout(async () => {
  const { data, error } = await supabase.rpc('admin_search_activity_logs', {
  p_search_term: searchTerm,
  p_limit: 50,
  p_date_from: adminLogsDateFrom || null,
  p_date_to: adminLogsDateTo || null,
})

    if (cancelled) return

    if (error) {
      setAdminLogsError('Δεν μπόρεσα να φορτώσω τα logs.')
      setAdminLogsResults([])
    } else {
      setAdminLogsResults(data || [])
    }

    setAdminLogsLoading(false)
  }, 350)

  return () => {
    cancelled = true
    window.clearTimeout(timeoutId)
  }
}, [adminLogsSearch, adminLogsDateFrom, adminLogsDateTo, isAdminLogsOpen, isAdminLogsUser])

const downloadAdminLogsCsv = async (logsOverride = null, groupOverride = null) => {
  setAdminLogsDownloading(true)

  let logs = logsOverride

  if (!logs) {
    const { data, error } = await supabase.rpc('admin_search_activity_logs', {
      p_search_term: '',
      p_limit: 5000,
      p_date_from: adminLogsDateFrom || null,
      p_date_to: adminLogsDateTo || null,
    })

    if (error) {
      alert('Δεν μπόρεσα να ετοιμάσω το PDF.')
      setAdminLogsDownloading(false)
      return
    }

    logs = data || []
  }

  if (logs.length === 0) {
    alert('Δεν βρέθηκαν logs για export.')
    setAdminLogsDownloading(false)
    return
  }

  const escapeHtml = (value) => {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  const getTaskColor = (taskKey) => {
    let hash = 0

    for (let i = 0; i < taskKey.length; i += 1) {
      hash = taskKey.charCodeAt(i) + ((hash << 5) - hash)
    }

    const colors = [
      { bg: '#fff1f2', border: '#e11d48' },
      { bg: '#f0fdf4', border: '#16a34a' },
      { bg: '#f8fafc', border: '#475569' },
      { bg: '#fefce8', border: '#ca8a04' },
      { bg: '#eff6ff', border: '#2563eb' },
      { bg: '#faf5ff', border: '#9333ea' },
      { bg: '#ecfeff', border: '#0891b2' },
      { bg: '#fff7ed', border: '#ea580c' },
    ]

    return colors[Math.abs(hash) % colors.length]
  }

  const groupedLogs = logs.reduce((groups, log) => {
    const key = String(log.task_id || log.task_title || log.list_name || 'no-task')

    if (!groups[key]) {
      groups[key] = {
        key,
        task_id: log.task_id,
        task_title: log.task_title,
        list_name: log.list_name,
        logs: [],
      }
    }

    groups[key].logs.push(log)
    return groups
  }, {})

  const groupsHtml = Object.values(groupedLogs).map((group) => {
    const color = getTaskColor(group.key)

    const logsHtml = [...group.logs].reverse().map((log) => {
      return `
        <div class="log-row">
          <div class="log-top">
            <strong>${escapeHtml(log.created_at_greece)}</strong>
            <span class="badge">${escapeHtml(String(log.event_type || 'LOG').toUpperCase())}</span>
          </div>
          <div class="log-description">
            ${escapeHtml(log.description || log.event_type)}
          </div>
          <div class="log-meta">
            ${escapeHtml(log.actor_email || '-')}
          </div>
        </div>
      `
    }).join('')

    const createdLog = group.logs.find((log) => {
      const type = String(log.event_type || '').toLowerCase()
      return type.includes('create') || type.includes('add')
    })

    const createdAt = createdLog?.created_at_greece || group.logs[group.logs.length - 1]?.created_at_greece || '-'

    return `
      <section class="task-card" style="background:${color.bg}; border-left-color:${color.border};">
        <div class="task-header">
          <div>
            <div class="task-title">
              #${escapeHtml(group.task_id || '-')} · ${escapeHtml(group.task_title || 'Χωρίς τίτλο')}
            </div>
            <div class="task-subtitle">
              ${escapeHtml(createdAt)}
              ${group.list_name ? ` · Λίστα: ${escapeHtml(group.list_name)}` : ''}
            </div>
          </div>
          <div class="count">${group.logs.length}</div>
        </div>

        <div class="logs">
          ${logsHtml}
        </div>
      </section>
    `
  }).join('')

  const today = new Date().toLocaleDateString('el-GR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
  const activeFilters = [
  adminLogsSearch.trim() ? `Αναζήτηση: ${adminLogsSearch.trim()}` : 'Αναζήτηση: Όλα',
  adminLogsDateFrom ? `Από: ${adminLogsDateFrom}` : 'Από: Όλες',
  adminLogsDateTo ? `Έως: ${adminLogsDateTo}` : 'Έως: Όλες',
].join(' · ')

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>ΒΡΟΝΤΙΝΟΣ To Do Logs</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 24px;
            color: #111827;
            background: #ffffff;
          }

          h1 {
            font-size: 20px;
            margin: 0 0 4px;
          }

.date {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.filters {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 18px;
}

          .task-card {
            border: 1px solid #cbd5e1;
            border-left: 7px solid;
            border-radius: 14px;
            margin-bottom: 14px;
            overflow: hidden;
            break-inside: avoid;
          }

          .task-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 14px;
            border-bottom: 1px solid rgba(15,23,42,.12);
          }

          .task-title {
            font-size: 15px;
            font-weight: 800;
          }

          .task-subtitle {
            margin-top: 4px;
            font-size: 12px;
            font-weight: 700;
            color: #334155;
          }

          .count {
            min-width: 28px;
            height: 28px;
            border-radius: 999px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 800;
          }

          .log-row {
            padding: 10px 14px;
            border-top: 1px solid rgba(15,23,42,.08);
            background: rgba(255,255,255,.55);
          }

          .log-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            font-size: 12px;
          }

          .badge {
            border-radius: 999px;
            padding: 3px 8px;
            background: #111827;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
          }

          .log-description {
            margin-top: 6px;
            font-size: 13px;
            line-height: 1.35;
          }

          .log-meta {
            margin-top: 4px;
            font-size: 11px;
            color: #64748b;
          }

          @media print {
            body {
              margin: 14mm;
            }

            .task-card {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>

 <body>
  <h1>${groupOverride ? `Task #${escapeHtml(groupOverride.task_id || '-')} Logs` : 'Admin Logs'}</h1>
  <div class="date">Export: ${escapeHtml(today)}</div>
  <div class="filters">${escapeHtml(activeFilters)}</div>
  ${groupsHtml}
</body>
</html>
`

const printWindow = window.open('', '_blank')

if (!printWindow) {
  alert('Το popup μπλοκαρίστηκε. Επίτρεψε popups για να γίνει export.')
  setAdminLogsDownloading(false)
  return
}

printWindow.document.open()
printWindow.document.write(html)
printWindow.document.close()

printWindow.onload = () => {
  printWindow.focus()
  printWindow.print()
}

setAdminLogsDownloading(false)
}

function getTaskScrollSnapshot(excludeTaskId = null) {
  if (isMobile) return null

  const root = mainRef.current
  if (!root) return null

  const scrollArea = root.querySelector('.main-scroll-area')
  if (!scrollArea) return null

  const rows = Array.from(root.querySelectorAll('[data-task-id]'))
  const scrollRect = scrollArea.getBoundingClientRect()
  const excluded = excludeTaskId == null ? null : String(excludeTaskId)

  const visibleRows = rows.filter((el) => {
    const id = String(el.dataset.taskId || '')
    if (excluded !== null && id === excluded) return false

    const rect = el.getBoundingClientRect()
    return rect.bottom > scrollRect.top + 8 && rect.top < scrollRect.bottom - 8
  })

  const anchorEl = visibleRows[0] || null

  if (!anchorEl) {
    return {
      scrollTop: scrollArea.scrollTop,
      anchorId: null,
      anchorOffset: 0,
    }
  }

  return {
    scrollTop: scrollArea.scrollTop,
    anchorId: String(anchorEl.dataset.taskId),
    anchorOffset: anchorEl.getBoundingClientRect().top - scrollRect.top,
  }
}

function restoreTaskScrollSnapshot(snapshot) {
  if (!snapshot || isMobile) return

  const root = mainRef.current
  if (!root) return

  const scrollArea = root.querySelector('.main-scroll-area')
  if (!scrollArea) return

  const apply = () => {
    if (snapshot.anchorId) {
      const rows = Array.from(root.querySelectorAll('[data-task-id]'))
      const anchorEl = rows.find(
        (el) => String(el.dataset.taskId) === String(snapshot.anchorId)
      )

      if (anchorEl) {
        const scrollRect = scrollArea.getBoundingClientRect()
        const nextOffset = anchorEl.getBoundingClientRect().top - scrollRect.top
        scrollArea.scrollTop += nextOffset - snapshot.anchorOffset
        return
      }
    }

    scrollArea.scrollTop = snapshot.scrollTop
  }

  requestAnimationFrame(() => {
    apply()

    requestAnimationFrame(() => {
      apply()
    })
  })
}

  const editingNoteIdRef = useRef(null)
  const activeTaskRef = useRef(null)
  const selectedListRef = useRef(null)
  const selectedListsRef = useRef([])
  const contextMenuRef = useRef(null)
  const latestTasksFetchIdRef = useRef(0)
  const tasksRealtimeTimerRef = useRef(null)
  const notesRealtimeTimerRef = useRef(null)
  const listsRealtimeTimerRef = useRef(null)
  const latestListsFetchIdRef = useRef(0)
  const latestAllTasksFetchIdRef = useRef(0)
  const latestTaskNoteCountsFetchIdRef = useRef(0)
  const latestNotesFetchTokenRef = useRef(new Map())
  const activeNotesTaskIdRef = useRef(null)
  const pendingTaskMutationsRef = useRef(new Map())
  const pendingNoteMutationsRef = useRef(new Map())
  const suppressOwnTaskRealtimeUntilRef = useRef(0)
  const currentSortModeRef = useRef('created')
  const currentSortDirectionRef = useRef('asc')
  const skipNextMobileHistoryPushRef = useRef(false)

  const LAST_SELECTED_LIST_KEY = 'lastSelectedListId'
  const LAST_MOBILE_VIEW_KEY = 'lastMobileView'
  const INVITE_BATCH_PREFIX = '[[BATCH:'

  const currentSortMode =
    selectedList && listSortSettings[selectedList.id]?.mode
      ? listSortSettings[selectedList.id].mode
      : 'created'

  const currentSortDirection =
    selectedList && listSortSettings[selectedList.id]?.direction
      ? listSortSettings[selectedList.id].direction
      : 'asc'

  const dndSensors = useSensors(
  useSensor(MouseSensor, {
    activationConstraint: {
      distance: 6,
    },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 390,
      tolerance: 16,
    },
  })
)

  const activeDraggedTask = useMemo(() => {
    const parsed = parseDndId(activeDragId)
    if (parsed.type !== 'task') return null
    const id = normalizeId(parsed.rawId)
    return (allTasks || []).find((task) => String(task.id) === String(id)) || null
  }, [activeDragId, allTasks])

  const activeDraggedList = useMemo(() => {
    const parsed = parseDndId(activeDragId)
    if (parsed.type !== 'list') return null
    const id = normalizeId(parsed.rawId)
    return (lists || []).find((list) => String(list.id) === String(id)) || null
  }, [activeDragId, lists])

  const hoveredTaskListId = useMemo(() => {
    if (!activeDraggedTask || !activeOverId) return null
    const overMeta = parseDndId(activeOverId)
    if (overMeta.type === 'task-list-target' || overMeta.type === 'list') {
      return normalizeId(overMeta.rawId)
    }
    return null
  }, [activeDraggedTask, activeOverId])

function collisionDetectionStrategy(args) {
  const activeMeta = parseDndId(args.active?.id)

  if (activeMeta.type === 'list') {
    const listOnlyContainers = args.droppableContainers.filter((container) => {
      return parseDndId(container.id).type === 'list'
    })

    const filteredArgs = {
      ...args,
      droppableContainers: listOnlyContainers,
    }

    const pointerCollisions = pointerWithin(filteredArgs)
    if (pointerCollisions.length > 0) {
      return pointerCollisions
    }

    return closestCenter(filteredArgs)
  }

  if (activeMeta.type === 'task' && isMobile) {
  const activeTaskId = normalizeId(activeMeta.rawId)
  const activeTask = tasks.find((task) => String(task.id) === String(activeTaskId))

  const taskOnlyContainers = args.droppableContainers.filter((container) => {
    const meta = parseDndId(container.id)
    if (meta.type !== 'task') return false

    const overTaskId = normalizeId(meta.rawId)
    const overTask = tasks.find((task) => String(task.id) === String(overTaskId))

    if (!activeTask || !overTask) return false

    return activeTask.completed === overTask.completed
  })

  if (taskOnlyContainers.length > 0) {
    return closestCenter({
      ...args,
      droppableContainers: taskOnlyContainers,
    })
  }
}

    if (activeMeta.type === 'task' && !isMobile) {
    const activeTaskId = normalizeId(activeMeta.rawId)
    const activeTask = tasks.find((task) => String(task.id) === String(activeTaskId))
    const pointerX = args.pointerCoordinates?.x ?? 0

    if (pointerX <= sidebarWidth + 6) {
      const listTargetContainers = args.droppableContainers.filter((container) => {
        const type = parseDndId(container.id).type
        return type === 'list' || type === 'task-list-target'
      })

      const filteredArgs = {
        ...args,
        droppableContainers: listTargetContainers,
      }

      const pointerCollisions = pointerWithin(filteredArgs)
      if (pointerCollisions.length > 0) {
        return pointerCollisions
      }

      return closestCenter(filteredArgs)
    }

    const taskOnlyContainers = args.droppableContainers.filter((container) => {
      const meta = parseDndId(container.id)
      if (meta.type !== 'task') return false

      const overTaskId = normalizeId(meta.rawId)
      const overTask = tasks.find((task) => String(task.id) === String(overTaskId))

      if (!activeTask || !overTask) return false

      return activeTask.completed === overTask.completed
    })

    if (taskOnlyContainers.length > 0) {
      return closestCenter({
        ...args,
        droppableContainers: taskOnlyContainers,
      })
    }
  }

  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    return pointerCollisions
  }

  return closestCenter(args)
}
  
function navigateMobile(nextView) {
  const order = {
    lists: 0,
    tasks: 1,
    details: 2,
    search: 3,
  }

  const current = order[mobileView] ?? 0
  const next = order[nextView] ?? 0

  setMobileDirection(next > current ? 'forward' : 'back')
  setMobileView(nextView)
}

  function handleGlobalDragStart(event) {
  setActiveDragId(String(event.active?.id || ''))
  setActiveOverId(null)
  mobileSelectionClearedDuringDragRef.current = false

  const activeMeta = parseDndId(event.active?.id)
  if (isMobile && activeMeta.type === 'task') {
    const taskId = normalizeId(activeMeta.rawId)
    setSelectedTasks([taskId])
    setSelectionAnchorId(taskId)
  }

  if (isMobile && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(12)
  }
}

function handleGlobalDragOver(event) {
  const activeId = event.active?.id ? String(event.active.id) : ''
  const overId = event.over?.id ? String(event.over.id) : ''

  setActiveOverId(overId)

  if (!isMobile || !activeId || !overId) return
  if (mobileSelectionClearedDuringDragRef.current) return

  const activeMeta = parseDndId(activeId)
  const overMeta = parseDndId(overId)

  if (activeMeta.type !== 'task' || overMeta.type !== 'task') return

  const activeTaskId = normalizeId(activeMeta.rawId)
  const overTaskId = normalizeId(overMeta.rawId)

  if (overTaskId !== activeTaskId) {
    mobileSelectionClearedDuringDragRef.current = true
    setSelectedTasks([])
    setSelectionAnchorId(null)
  }
}

useEffect(() => {
  function handleResize() {
    setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    setIsTouchDevice(getIsTouchDevice())
  }

  handleResize()
  window.addEventListener('resize', handleResize)

  return () => {
    window.removeEventListener('resize', handleResize)
  }
}, [])



useEffect(() => {
  if (!isMobile) return

  if (mobileView === 'search') return

  if (loadingLists) return

  if (!selectedList && !(mobileView === 'details' && activeTask)) {
    setMobileDirection('back')
    setMobileView('lists')
    return
  }

  if (!activeTask && mobileView === 'details') {
    setMobileDirection('back')
    setMobileView(selectedList ? 'tasks' : 'search')
  }
}, [isMobile, selectedList, activeTask, mobileView, loadingLists])

useEffect(() => {
  if (!isMobile) return

  if (skipNextMobileHistoryPushRef.current) {
    skipNextMobileHistoryPushRef.current = false
    return
  }

  if (mobileView === 'lists') {
    window.history.replaceState({ mobileView: 'lists' }, '')
    return
  }

  window.history.pushState({ mobileView }, '')
}, [isMobile, mobileView])

useEffect(() => {
  if (!isMobile) return

  const onPopState = () => {
    skipNextMobileHistoryPushRef.current = true

    if (mobileView === 'details') {
  setSelectedTasks([])
  setSelectionAnchorId(null)

  if (openedTaskFromMobileSearchRef.current) {
    openedTaskFromMobileSearchRef.current = false
    navigateMobile('search')

    requestAnimationFrame(() => {
      const searchScrollArea = document.querySelector('.mobile-search-results')
      if (searchScrollArea) {
        searchScrollArea.scrollTop = mobileSearchScrollTopRef.current
      }
    })

    return
  }

  navigateMobile('tasks')
  return
}

    if (mobileView === 'search') {
      setSelectedList(null)
      setSelectedLists([])
      setListSelectionAnchorId(null)
      navigateMobile('lists')
      return
    }

    if (mobileView === 'tasks') {
      setSelectedList(null)
      setSelectedLists([])
      setListSelectionAnchorId(null)
      navigateMobile('lists')
    }
  }

  window.addEventListener('popstate', onPopState)

  return () => {
    window.removeEventListener('popstate', onPopState)
  }
}, [isMobile, mobileView])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('detailsWidth', String(detailsWidth))
  }, [detailsWidth])

  useEffect(() => {
    editingNoteIdRef.current = editingNoteId
  }, [editingNoteId])

  useEffect(() => {
    activeTaskRef.current = activeTask
  }, [activeTask])

  useEffect(() => {
    selectedListRef.current = selectedList
  }, [selectedList])

  useEffect(() => {
    selectedListsRef.current = selectedLists
  }, [selectedLists])

  useEffect(() => {
  currentSortModeRef.current = currentSortMode
  }, [currentSortMode])

  useEffect(() => {
  currentSortDirectionRef.current = currentSortDirection
  }, [currentSortDirection])

  useEffect(() => {
  if (!session?.user?.id) return
  if (!selectedList?.id) {
    setTasks([])
    return
  }

  fetchTasks(selectedList.id, false, true)
}, [selectedList?.id, session?.user?.id])

  useEffect(() => {
    if (selectedList?.id) {
      localStorage.setItem(LAST_SELECTED_LIST_KEY, selectedList.id)
    }
  }, [selectedList])

useEffect(() => {
  if (!isMobile) return
  localStorage.setItem(LAST_MOBILE_VIEW_KEY, mobileView)
}, [isMobile, mobileView])

  useEffect(() => {
    localStorage.setItem('listSortSettings', JSON.stringify(listSortSettings))
  }, [listSortSettings])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) {
        console.error('Σφάλμα ανάκτησης session:', error)
        setAuthError('Δεν ήταν δυνατός ο έλεγχος σύνδεσης.')
        setSession(null)
      } else {
        setSession(data.session ?? null)
      }

      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
  if (event === 'PASSWORD_RECOVERY') {
    setAuthMode('update-password')
    setAuthPassword('')
    setAuthMessage('Βάλε νέο κωδικό για τον λογαριασμό σου.')
  }
  const nextUserId = nextSession?.user?.id ?? null

  setSession((prevSession) => {
    const prevUserId = prevSession?.user?.id ?? null

    if (event === 'TOKEN_REFRESHED' && prevUserId === nextUserId) {
      return prevSession
    }

    if (prevUserId && prevUserId === nextUserId) {
      return prevSession
    }

    return nextSession ?? null
  })

setAuthError('')

if (event !== 'PASSWORD_RECOVERY') {
  setAuthMessage('')
}

setAuthLoading(false)
})

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchLastEditorEmail() {
      if (!activeTask?.updated_by) {
        setLastEditorEmail('')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', activeTask.updated_by)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.error('Σφάλμα φόρτωσης τελευταίου χρήστη αλλαγής:', error)
        setLastEditorEmail('')
        return
      }

      setLastEditorEmail(data?.email || '')
    }

    fetchLastEditorEmail()

    return () => {
      cancelled = true
    }
  }, [activeTask?.id, activeTask?.updated_by])

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
      if (session?.user?.id) {
        setSyncStatus('syncing')
        fetchLists(false)
        fetchAllTasks(false)
        fetchTaskNoteCounts(false)

        const currentSelectedList = selectedListRef.current
        const currentActiveTask = activeTaskRef.current

        if (currentSelectedList?.id) {
          fetchTasks(currentSelectedList.id, false, false)
        }

        if (currentActiveTask?.id && editingNoteIdRef.current === null) {
          fetchNotes(currentActiveTask.id, false)
        }
      }
    }

function handleOffline() {
  setIsOffline(true)
  if (session?.user?.id) {
    setSyncStatus('offline')
  }
}

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [session])

  useEffect(() => {
    if (!session?.user?.id) {
      setLists([])
      setSelectedList(null)
      setSelectedLists([])
      setListSelectionAnchorId(null)
      setTasks([])
      setAllTasks([])
      setNoteCountsByTask({})
      setActiveTask(null)
      setTaskNotes([])
      setSelectedTasks([])
      setSelectionAnchorId(null)
      setNewListName('')
      setNewTaskTitle('')
      setNewNoteText('')
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
      setLastEditorEmail('')
      setPendingInvites([])
      setSyncStatus('connecting')
      setLastSyncAt(null)
      return
    }

    fetchLists()
    fetchAllTasks()
    fetchTaskNoteCounts()
    fetchPendingInvites()
 }, [session?.user?.id])

  useEffect(() => {
  setTasks((prev) => sortTasks(prev, currentSortMode, currentSortDirection))
}, [selectedList?.id, currentSortMode, currentSortDirection])

  useEffect(() => {
  if (!session?.user?.id) return

  const channel = supabase
    .channel(`live-sync-all-${session.user.id}`)
    .on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'tasks' },
  async (payload) => {
  const currentSelectedList = selectedListRef.current
  const currentActiveTask = activeTaskRef.current
  const isEditingNote = editingNoteIdRef.current !== null

  const changedByCurrentUser =
    payload?.new?.updated_by === session.user.id ||
    payload?.old?.updated_by === session.user.id

  const shouldIgnoreOwnReorderBurst =
    changedByCurrentUser &&
    Date.now() < suppressOwnTaskRealtimeUntilRef.current

  if (shouldIgnoreOwnReorderBurst) {
    return
  }

  const incomingTask = payload?.new || payload?.old

  if (
    incomingTask &&
    isOwnRecentTaskMutation(incomingTask.id, incomingTask.updated_at)
  ) {
    clearTaskMutation(incomingTask.id)
    return
  }

  if (payload?.eventType === 'DELETE') {
    scheduleRealtimeRefresh('tasks', async () => {
      await fetchAllTasks(false)

      if (currentSelectedList?.id) {
        await fetchTasks(currentSelectedList.id, false, false)
      }

      if (
        currentActiveTask?.id &&
        !isEditingNote &&
        String(payload?.old?.id || payload?.new?.id || '') === String(currentActiveTask.id)
      ) {
        setActiveTask(null)
        setTaskNotes([])
        setEditingTaskTitle(false)
        setEditingNoteId(null)
        setEditingNoteValue('')
      }
    }, 0)

    return
  }

  applyTaskRealtimePayload(payload)

  if (
    currentActiveTask?.id &&
    !isEditingNote &&
    (
      String(payload?.new?.id || '') === String(currentActiveTask.id) ||
      String(payload?.old?.id || '') === String(currentActiveTask.id)
    )
  ) {
    await fetchNotes(currentActiveTask.id, false)
  }
}
)
.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'task_notes' },
  async (payload) => {
    const currentActiveTask = activeTaskRef.current
    const isEditingNote = editingNoteIdRef.current !== null

    const incomingNote = payload.new || payload.old

    if (
      incomingNote &&
      isOwnRecentNoteMutation(incomingNote.id, incomingNote.updated_at)
    ) {
      clearNoteMutation(incomingNote.id)
      return
    }

    const eventType = payload.eventType
    const note = payload.new || payload.old
    const changedTaskId = payload.new?.task_id || payload.old?.task_id

    if (eventType === 'INSERT' && changedTaskId) {
      setNoteCountsByTask((prev) => ({
        ...prev,
        [changedTaskId]: (prev[changedTaskId] || 0) + 1,
      }))
    }

    if (eventType === 'DELETE') {
      await fetchTaskNoteCounts(false)
    }

    if (currentActiveTask?.id === changedTaskId && !isEditingNote) {
      applyNoteRealtimePayload(payload)
    }

    if (eventType === 'DELETE' && currentActiveTask?.id && !isEditingNote) {
      await fetchNotes(currentActiveTask.id, false)
    }
  }
)

    .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'lists' },
    async () => {
      scheduleRealtimeRefresh('lists', async () => {
        setSyncStatus('syncing')
        await fetchLists(false)
        setSyncStatus('synced')
      })
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'list_invites' },
    async () => {
      await fetchPendingInvites()
    }
  )
  .subscribe((status) => {
      if (status === 'SUBSCRIBED') setSyncStatus('synced')
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSyncStatus('error')
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}, [session])

useEffect(() => {
  if (!isMobile) return
  if (!editingTaskTitle) return

  const el = document.querySelector('.mobile-task-title-editor')
  if (!el) return

  const resize = () => {
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }

  // 🔥 το κρίσιμο timing
  setTimeout(resize, 0)
  setTimeout(resize, 50)
}, [editingTaskTitle])

useEffect(() => {
function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && session?.user?.id) {
        setSyncStatus('syncing')

        const currentSelectedList = selectedListRef.current
        const currentActiveTask = activeTaskRef.current
        const isEditingNote = editingNoteIdRef.current !== null

        Promise.all([
  fetchLists(false),
  fetchAllTasks(false),
  fetchTaskNoteCounts(false),
  currentSelectedList?.id
    ? fetchTasks(currentSelectedList.id, false, false)
    : Promise.resolve(),
  currentActiveTask?.id && !isEditingNote
    ? fetchNotes(currentActiveTask.id, false)
    : Promise.resolve(),
]).then(() => {
  markSynced()
})
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session])

  function markSaving() {
    setSyncStatus('saving')
  }

  function markSynced() {
    setSyncStatus('synced')
    setLastSyncAt(new Date())
  }

function markTaskMutation(taskId) {
  pendingTaskMutationsRef.current.set(String(taskId), Date.now())
}

function clearTaskMutation(taskId) {
  pendingTaskMutationsRef.current.delete(String(taskId))
}

function markNoteMutation(noteId) {
  pendingNoteMutationsRef.current.set(String(noteId), Date.now())
}

function clearNoteMutation(noteId) {
  pendingNoteMutationsRef.current.delete(String(noteId))
}

function isOwnRecentNoteMutation(noteId, updatedAt) {
  const key = String(noteId)
  const ts = pendingNoteMutationsRef.current.get(key)
  if (!ts) return false

  const age = Date.now() - ts

  if (age > 4000) {
    pendingNoteMutationsRef.current.delete(key)
    return false
  }

  if (!updatedAt) return true

  const incomingTime = new Date(updatedAt).getTime()
  if (Number.isNaN(incomingTime)) return true

  return Math.abs(incomingTime - ts) < 5000
}

function isOwnRecentTaskMutation(taskId, updatedAt) {
  const key = String(taskId)
  const ts = pendingTaskMutationsRef.current.get(key)
  if (!ts) return false

  const age = Date.now() - ts
  if (age > 4000) {
    pendingTaskMutationsRef.current.delete(key)
    return false
  }

  if (!updatedAt) return true

  const incomingTime = new Date(updatedAt).getTime()
  if (Number.isNaN(incomingTime)) return true

  return Math.abs(incomingTime - ts) < 5000
}

  function updateCurrentListSort(nextPartial) {
  if (!selectedList) return

  setListSortSettings((prev) => {
    const previous = prev[selectedList.id] || {
      mode: 'created',
      direction: 'asc',
    }

    const nextMode = nextPartial.mode || previous.mode

    let nextDirection = previous.direction || 'asc'

    if (isMobile && nextMode === 'manual') {
      nextDirection = 'asc'
    } else if (nextPartial.direction) {
      nextDirection = nextPartial.direction
    }

    return {
      ...prev,
      [selectedList.id]: {
        ...previous,
        ...nextPartial,
        mode: nextMode,
        direction: nextDirection,
      },
    }
  })
}

  function closeContextMenu() {
    setContextMenu(null)
    setMoveMenuOpen(false)
    setMultiMoveMenuOpen(false)
  }

  async function handleLeaveList(list) {
    if (!list?.id || !session?.user?.id || isOffline) return

    const confirmed = window.confirm('Να αποχωρήσεις από αυτή τη λίστα;')
    if (!confirmed) return

    const { error } = await supabase
      .from('list_members')
      .delete()
      .eq('list_id', list.id)
      .eq('user_id', session.user.id)

    if (error) {
      console.error('Σφάλμα αποχώρησης από λίστα:', error)
      return
    }

    closeContextMenu()

    setLists((prev) => prev.filter((item) => item.id !== list.id))
    setSelectedLists((prev) => prev.filter((id) => id !== list.id))

    if (selectedListRef.current?.id === list.id) {
      localStorage.removeItem(LAST_SELECTED_LIST_KEY)
      setSelectedList(null)
      setSelectedLists([])
      setListSelectionAnchorId(null)
      setTasks([])
      setActiveTask(null)
      setTaskNotes([])
      setSelectedTasks([])
      setSelectionAnchorId(null)
    }

    fetchLists(false)
    fetchAllTasks(false)
    fetchTaskNoteCounts(false)
  }

  function clearEditingNoteIfStillSame(noteId, nextValue = '') {
    if (editingNoteIdRef.current === noteId) {
      setEditingNoteId(null)
      setEditingNoteValue(nextValue)
    }
  }

  function closeShareModal() {
    setShareModalList(null)
    setShareEmail('')
    setShareOwnerEmail('')
    setShareMembers([])
    setShareLoading(false)
    setShareSubmitting(false)
    setShareError('')
    setShareMessage('')
    setShareRemovingUserId(null)
  }
  function createInviteSnapshot(batchId, listName) {
    return `${INVITE_BATCH_PREFIX}${batchId}]]${listName}`
  }

  function parseInviteSnapshot(snapshot) {
    const value = String(snapshot || '')

    if (!value.startsWith(INVITE_BATCH_PREFIX)) {
      return { batchId: null, listName: value }
    }

    const closeIndex = value.indexOf(']]')
    if (closeIndex === -1) {
      return { batchId: null, listName: value }
    }

    return {
      batchId: value.slice(INVITE_BATCH_PREFIX.length, closeIndex),
      listName: value.slice(closeIndex + 2),
    }
  }

  const groupedPendingInvites = useMemo(() => {
    const grouped = new Map()

    for (const invite of pendingInvites) {
      const parsed = parseInviteSnapshot(invite.list_name_snapshot)
      const key = parsed.batchId || `single-${invite.id}`
      const existing = grouped.get(key)

      if (existing) {
        existing.invites.push(invite)
        existing.listNames.push(parsed.listName || `#${invite.list_id}`)
      } else {
        grouped.set(key, {
          key,
          invites: [invite],
          listNames: [parsed.listName || `#${invite.list_id}`],
        })
      }
    }

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      listNames: [...new Set(group.listNames)],
    }))
  }, [pendingInvites])

  function getContextMenuPosition() {
    const menuWidth = 270
    const menuHeight = 220
    const padding = 8

    const x = Math.min(
      Math.max(contextMenu?.x || 0, padding),
      window.innerWidth - menuWidth - padding
    )

    const y = Math.min(
      Math.max(contextMenu?.y || 0, padding),
      window.innerHeight - menuHeight - padding
    )

    return {
      left: `${x}px`,
      top: `${y}px`,
    }
  }

  function getFullscreenSubmenuPosition() {
  const submenuWidth = Math.min(420, Math.floor(window.innerWidth * 0.55))
  const padding = 8
  const gap = -7

  const menuRect = contextMenuRef.current?.getBoundingClientRect()

  if (!menuRect) {
    return {
      left: `${padding}px`,
      top: `${padding}px`,
    }
  }

  const openRightLeft = menuRect.right + gap
  const openLeftLeft = menuRect.left - submenuWidth - gap

  const fitsRight = openRightLeft + submenuWidth <= window.innerWidth - padding

  return {
    left: `${fitsRight ? openRightLeft : Math.max(padding, openLeftLeft)}px`,
    top: `${padding}px`,
  }
}
 function sortTasks(taskArray, mode = currentSortMode, direction = currentSortDirection) {
  const factor = direction === 'desc' ? -1 : 1

  return [...taskArray].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1
    }

    if (mode === 'alpha') {
      return (
        (a.title || '').localeCompare(b.title || '', 'el', {
          sensitivity: 'base',
        }) * factor
      )
    }

    if (!a.completed && !b.completed) {
      const aStore = Boolean(a.is_store)
      const bStore = Boolean(b.is_store)
      const aSkroutz = Boolean(a.is_skroutz)
      const bSkroutz = Boolean(b.is_skroutz)
      const aWeighing = Boolean(a.needs_weighing)
      const bWeighing = Boolean(b.needs_weighing)

      if (aStore !== bStore) {
        return aStore ? -1 : 1
      }

      if (aSkroutz !== bSkroutz) {
        return aSkroutz ? -1 : 1
      }

      if (aWeighing !== bWeighing) {
        return aWeighing ? 1 : -1
      }
    }

    if (mode === 'created') {
      const aTime = new Date(a.created_at || 0).getTime()
      const bTime = new Date(b.created_at || 0).getTime()
      return (aTime - bTime) * factor
    }

    return (Number(a.position) || 0) - (Number(b.position) || 0)
  })
}

  function sortNotes(noteArray) {
  return [...noteArray].sort((a, b) => {
    return new Date(a.created_at) - new Date(b.created_at)
  })
}

  function formatDateTime(value) {
    if (!value) return '—'
    const d = new Date(value)
    return d.toLocaleString('el-GR')
  }

const syncText = useMemo(() => {
  if (isOffline || syncStatus === 'offline') return 'Δεν υπάρχει σύνδεση στο internet'
  if (syncStatus === 'saving') return 'Συγχρονίζεται...'
  if (syncStatus === 'syncing') return 'Ενημέρωση...'
  if (syncStatus === 'error') return 'Πρόβλημα συγχρονισμού'
  if (lastSyncAt) return `Συγχρονισμένο ${formatDateTime(lastSyncAt)}`
  return 'Σύνδεση...'
}, [syncStatus, lastSyncAt, isOffline])

  const incompleteCountByList = useMemo(() => {
    const counts = {}
    for (const task of allTasks) {
      if (!task.completed) {
        counts[task.list_id] = (counts[task.list_id] || 0) + 1
      }
    }
    return counts
  }, [allTasks])

  const completedCountByList = useMemo(() => {
    const counts = {}
    for (const task of allTasks) {
      if (task.completed) {
        counts[task.list_id] = (counts[task.list_id] || 0) + 1
      }
    }
    return counts
  }, [allTasks])

  const visibleTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()

    if (!q) {
      return tasks.map((task) => ({
        ...task,
        list_name: selectedList?.name || '',
        notes_count: noteCountsByTask[task.id] || 0,
      }))
    }

    const listMap = new Map(lists.map((list) => [list.id, list.name]))

    return sortTasks(allTasks, 'alpha', 'asc')
      .filter((task) => (task.title || '').toLowerCase().includes(q))
      .map((task) => ({
        ...task,
        list_name: listMap.get(task.list_id) || '',
        notes_count: noteCountsByTask[task.id] || 0,
      }))
  }, [
    tasks,
    allTasks,
    taskSearch,
    lists,
    selectedList,
    currentSortMode,
    currentSortDirection,
    noteCountsByTask,
  ])

  useEffect(() => {
    function handleWindowClick(event) {
  const rawTarget = event.target
  const target =
    rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentElement : rawTarget

  const clickedContext = target?.closest?.('.context-menu')
  if (!clickedContext) {
    closeContextMenu()
  }

  const clickedTaskActionsMenu = target?.closest?.('.task-actions-menu-wrap')
  if (!clickedTaskActionsMenu) {
    setIsTaskActionsMenuOpen(false)
  }

  const clickedTask = target?.closest?.('.task-item')
  const clickedList = target?.closest?.('.list-button')
  const clickedMain = target?.closest?.('.main')
  const clickedDetails = target?.closest?.('.details-panel')
  const clickedMainHeader = target?.closest?.('.main-header')
  const clickedAddTaskForm = target?.closest?.('.add-task-form')
  const clickedInput = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(
    target?.tagName
  )

  if (!clickedTask && !clickedContext && !clickedList && !clickedInput && !clickedDetails) {
    setSelectedTasks([])
    setSelectionAnchorId(null)
    setSelectedLists([])
    setListSelectionAnchorId(null)
  }

  const clickedEmptyMainArea =
    clickedMain &&
    !clickedTask &&
    !clickedMainHeader &&
    !clickedAddTaskForm &&
    !clickedInput

  if (clickedEmptyMainArea) {
    setActiveTask(null)
    setTaskNotes([])
    setEditingTaskTitle(false)
    setEditingNoteId(null)
    setEditingNoteValue('')
  }
}

    function handleWindowKeyDown(event) {
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isTyping =
        tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

      const pressedSelectAll =
        (event.ctrlKey || event.metaKey) && event.code === 'KeyA'

      const mainHasFocus = document.activeElement === mainRef.current

      if (event.key === 'Escape') {
        if (shareModalList) {
          closeShareModal()
          return
        }

        setSelectedTasks([])
        setSelectionAnchorId(null)
        setSelectedLists([])
        setListSelectionAnchorId(null)
        closeContextMenu()
        setEditingTaskTitle(false)
        setEditingNoteId(null)
        setEditingNoteValue('')
      }

      if (!isTyping && mainHasFocus && pressedSelectAll && visibleTasks.length > 0) {
        event.preventDefault()

        const incompleteIds = visibleTasks
          .filter((task) => !task.completed)
          .map((task) => task.id)

        const allIds = visibleTasks.map((task) => task.id)

        const alreadyOnlyIncompleteSelected =
          incompleteIds.length > 0 &&
          selectedTasks.length === incompleteIds.length &&
          incompleteIds.every((id) => selectedTasks.includes(id))

        if (alreadyOnlyIncompleteSelected) {
          setSelectedTasks(allIds)
          setSelectionAnchorId(allIds[0] || null)

          const firstTask = visibleTasks[0]
          if (firstTask) {
            setActiveTask(firstTask)
            setEditingTaskValue(firstTask.title)
            fetchNotes(firstTask.id, false)
          }

          return
        }

        setSelectedTasks(incompleteIds)
        setSelectionAnchorId(incompleteIds[0] || null)

        const firstIncompleteTask = visibleTasks.find((task) => !task.completed)
        if (firstIncompleteTask) {
          setActiveTask(firstIncompleteTask)
          setEditingTaskValue(firstIncompleteTask.title)
          fetchNotes(firstIncompleteTask.id, false)
        }

        return
      }

      if (!isTyping && event.key === 'Delete' && selectedTasks.length > 0) {
        event.preventDefault()
        handleDeleteSelected()
        return
      }

      if (
        !isTyping &&
        event.shiftKey &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        visibleTasks.length > 0 &&
        activeTask
      ) {
        event.preventDefault()

        const currentIndex = visibleTasks.findIndex((t) => t.id === activeTask.id)
        if (currentIndex === -1) return

        const nextIndex =
          event.key === 'ArrowDown'
            ? Math.min(currentIndex + 1, visibleTasks.length - 1)
            : Math.max(currentIndex - 1, 0)

        if (nextIndex === currentIndex) return

        const nextTask = visibleTasks[nextIndex]
        const anchorId = selectionAnchorId ?? activeTask.id

        setActiveTask(nextTask)
        setEditingTaskValue(nextTask.title)
        fetchNotes(nextTask.id, false)

        const anchorIndex = visibleTasks.findIndex((t) => t.id === anchorId)
        if (anchorIndex === -1) return

        const start = Math.min(anchorIndex, nextIndex)
        const end = Math.max(anchorIndex, nextIndex)
        const rangeIds = visibleTasks.slice(start, end + 1).map((t) => t.id)

        setSelectedTasks(rangeIds)
        setSelectionAnchorId(anchorId)
      }
    }

    function handleMouseMove(event) {
      if (!appRef.current) return

      const rect = appRef.current.getBoundingClientRect()

      if (isResizingSidebar) {
        const next = Math.max(180, Math.min(420, event.clientX - rect.left))
        setSidebarWidth(next)
      }

      if (isResizingDetails) {
        const next = Math.max(260, Math.min(520, rect.right - event.clientX))
        setDetailsWidth(next)
      }
    }

    function handleMouseUp() {
      setIsResizingSidebar(false)
      setIsResizingDetails(false)
      setTaskDropListId(null)
    }

    window.addEventListener('click', handleWindowClick)
    window.addEventListener('keydown', handleWindowKeyDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleWindowKeyDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [
    activeTask,
    selectedTasks,
    selectionAnchorId,
    isResizingSidebar,
    isResizingDetails,
    visibleTasks,
    shareModalList,
  ])

  async function fetchLists(updateStatus = true) {
  if (!session?.user?.id) return

  const fetchId = ++latestListsFetchIdRef.current
  if (updateStatus) setLoadingLists(true)

  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('position', { ascending: true })

  if (fetchId !== latestListsFetchIdRef.current) {
    if (updateStatus) setLoadingLists(false)
    return
  }

  if (error) {
    console.error('Σφάλμα φόρτωσης λιστών:', error)
    setSyncStatus('error')
    if (updateStatus) setLoadingLists(false)
    return
  }

  const loadedLists = data || []
  setLists(loadedLists)

  setListSortSettings((prev) => {
    const next = { ...prev }
    for (const list of loadedLists) {
      if (!next[list.id]) {
        next[list.id] = { mode: 'created', direction: 'asc' }
      }
    }
    return next
  })

  if (loadedLists.length === 0) {
    localStorage.removeItem(LAST_SELECTED_LIST_KEY)
    setSelectedList(null)
    setSelectedLists([])
    setListSelectionAnchorId(null)
    setTasks([])
    setActiveTask(null)
    setTaskNotes([])
    if (updateStatus) setLoadingLists(false)
    if (updateStatus) markSynced()
    return
  }

  const savedListId = localStorage.getItem(LAST_SELECTED_LIST_KEY)

  const stillExists = selectedListRef.current
    ? loadedLists.find((l) => String(l.id) === String(selectedListRef.current.id))
    : null

  if (stillExists) {
  setCurrentListRole(
    stillExists.owner_user_id === session?.user?.id ? 'owner' : 'editor'
  )

  if (updateStatus) {
    setSelectedList(stillExists)
  }
} else {
    const savedList = savedListId
      ? loadedLists.find((l) => String(l.id) === String(savedListId))
      : null

    const nextSelected = savedList || loadedLists[0]

    setCurrentListRole(
      nextSelected.owner_user_id === session?.user?.id ? 'owner' : 'editor'
    )
    setSelectedList(nextSelected)
    setSelectedLists([nextSelected.id])
    setListSelectionAnchorId(nextSelected.id)
  }

  if (updateStatus) {
    setLoadingLists(false)
    markSynced()
  } else {
    setLoadingLists(false)
  }
}

async function fetchTasksPage(buildQuery) {
  const PAGE_SIZE = 500
  let from = 0
  const rows = []
  const seenIds = new Set()

  while (true) {
    const { data, error } = await buildQuery()
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      return { data: rows, error }
    }

    const page = data || []

    for (const row of page) {
      const key = String(row.id)
      if (!seenIds.has(key)) {
        seenIds.add(key)
        rows.push(row)
      }
    }

    if (page.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return { data: rows, error: null }
}

  async function fetchAllTasks(updateStatus = true) {
  if (!session?.user?.id) return

  const fetchId = ++latestAllTasksFetchIdRef.current

  const { data, error } = await fetchTasksPage(() =>
  supabase
    .from('tasks')
    .select('*')
    .order('list_id', { ascending: true })
    .order('position', { ascending: true })
    .order('id', { ascending: true })
)

  if (fetchId !== latestAllTasksFetchIdRef.current) {
    return
  }

  if (error) {
    console.error('Σφάλμα φόρτωσης όλων των εργασιών:', error)
    setSyncStatus('error')
    return
  }

  setAllTasks(data || [])
  if (updateStatus) markSynced()
}

  async function fetchTaskNoteCounts(updateStatus = true) {
  if (!session?.user?.id) return

  const fetchId = ++latestTaskNoteCountsFetchIdRef.current

  const { data, error } = await supabase.from('task_notes').select('task_id')

  if (fetchId !== latestTaskNoteCountsFetchIdRef.current) {
    return
  }

  if (error) {
    console.error('Σφάλμα φόρτωσης μετρητών σημειώσεων:', error)
    setSyncStatus('error')
    return
  }

  const counts = {}
  for (const note of data || []) {
    counts[note.task_id] = (counts[note.task_id] || 0) + 1
  }

  setNoteCountsByTask(counts)
  if (updateStatus) markSynced()
}

  async function fetchTasks(listId, updateStatus = true, showLoading = updateStatus) {
  if (!session?.user?.id) return
  if (!listId) return

  const fetchId = ++latestTasksFetchIdRef.current

  if (showLoading) setLoadingTasks(true)

const { data, error } = await fetchTasksPage(() =>
  supabase
    .from('tasks')
    .select('*')
    .eq('list_id', listId)
    .order('position', { ascending: true })
    .order('id', { ascending: true })
)

  if (fetchId !== latestTasksFetchIdRef.current) {
    return
  }

  if (error) {
    console.error('Σφάλμα φόρτωσης εργασιών:', error)
    setTasks([])
    setSyncStatus('error')
    setLoadingTasks(false)
    return
  }

  const loadedTasks = sortTasks(
  data || [],
  currentSortModeRef.current,
  currentSortDirectionRef.current
  )
  setTasks(loadedTasks)

  const currentActiveTask = activeTaskRef.current

  if (currentActiveTask) {
    const refreshedActiveTask = loadedTasks.find((t) => t.id === currentActiveTask.id)
    if (refreshedActiveTask) {
      setActiveTask(refreshedActiveTask)
      if (!editingTaskTitle) {
        setEditingTaskValue(refreshedActiveTask.title)
      }
    } else {
      const globalActive = (allTasks || []).find((t) => t.id === currentActiveTask.id)
      if (!globalActive || globalActive.list_id !== listId) {
        setActiveTask(null)
        setTaskNotes([])
        setEditingTaskTitle(false)
        setEditingNoteId(null)
        setEditingNoteValue('')
      }
    }
  }

setLoadingTasks(false)

if (updateStatus) {
  markSynced()
}

}

async function fetchNotes(taskId, updateStatus = true, showLoading = false) {
  if (!session?.user?.id) return
  if (!taskId) return

  const taskKey = String(taskId)
  activeNotesTaskIdRef.current = taskKey
  if (showLoading) {
  setTaskNotes([])
  setNotesLoading(true)
}

  const token = `${taskId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  latestNotesFetchTokenRef.current.set(taskId, token)

  const { data, error } = await supabase
    .from('task_notes')
    .select('*')
    .eq('task_id', taskId)

  if (activeNotesTaskIdRef.current !== taskKey) {
    return
  }

  if (latestNotesFetchTokenRef.current.get(taskId) !== token) {
    return
  }

  if (error) {
  console.error('Σφάλμα φόρτωσης σημειώσεων:', error)
  setTaskNotes([])
  if (showLoading) {
  setNotesLoading(false)
}
  setSyncStatus('error')
  return
}

  const sorted = sortNotes(data || [])

  if (editingNoteIdRef.current === null) {
    setTaskNotes(sorted)
  } else {
    setTaskNotes((prev) => {
      const editingId = editingNoteIdRef.current
      const existingEditingNote = prev.find((note) => note.id === editingId)

      return sorted.map((note) => {
        if (note.id === editingId && existingEditingNote) {
          return existingEditingNote
        }
        return note
      })
    })
  }
  if (showLoading) {
  setNotesLoading(false)
}
  if (updateStatus) markSynced()
}
  
  async function fetchPendingInvites() {
    if (!session?.user?.id || !session?.user?.email) {
      setPendingInvites([])
      return
    }

    setInvitesLoading(true)

    const email = String(session.user.email).trim().toLowerCase()

    const { data, error } = await supabase
      .from('list_invites')
      .select(`
        id,
        list_id,
        invited_email,
        status,
        created_at,
        list_name_snapshot
      `)
      .eq('invited_email', email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Σφάλμα φόρτωσης invitations:', error)
      setPendingInvites([])
      setInvitesLoading(false)
      return
    }

    setPendingInvites(data || [])
    setInvitesLoading(false)
  }

function invalidateTaskViews() {
  latestTasksFetchIdRef.current += 1
  latestAllTasksFetchIdRef.current += 1
}

function invalidateNoteViews(taskId = null) {
  latestTaskNoteCountsFetchIdRef.current += 1

  if (taskId) {
    latestNotesFetchTokenRef.current.set(
      taskId,
      `invalidated:${Date.now()}`
    )
  }
}

function replaceTaskEverywhere(taskId, nextTask) {
  setTasks((prev) =>
    sortTasks(
      prev.map((task) => (task.id === taskId ? nextTask : task)),
      currentSortModeRef.current,
      currentSortDirectionRef.current
    )
  )

  setAllTasks((prev) =>
    prev.map((task) => (task.id === taskId ? nextTask : task))
  )

  setActiveTask((prev) => (prev?.id === taskId ? nextTask : prev))
}

function snapshotTaskEverywhere(taskId) {
  const fromTasks = tasks.find((t) => t.id === taskId)
  const fromAllTasks = allTasks.find((t) => t.id === taskId)
  const fromActive = activeTask?.id === taskId ? activeTask : null
  return fromTasks || fromAllTasks || fromActive || null
}

  async function handleAcceptInvite(inviteIdsOrId) {
    const inviteIds = Array.isArray(inviteIdsOrId) ? inviteIdsOrId : [inviteIdsOrId]
    const validInviteIds = inviteIds.filter(Boolean)

    if (validInviteIds.length === 0 || isOffline) return

    const loadingKey = validInviteIds.join(',')
    setInviteActionLoading(loadingKey)

    const results = await Promise.all(
      validInviteIds.map((inviteId) =>
        supabase.rpc('accept_list_invite', {
          invite_id: inviteId,
        })
      )
    )

    const failed = results.find((result) => result.error)

    if (failed?.error) {
      console.error('Σφάλμα αποδοχής invitation:', failed.error)
      alert('Δεν ήταν δυνατή η αποδοχή της πρόσκλησης.')
      setInviteActionLoading(null)
      return
    }

    await fetchPendingInvites()
    await fetchLists(false)
    setInviteActionLoading(null)
  }

  async function handleRejectInvite(inviteIdsOrId) {
    const inviteIds = Array.isArray(inviteIdsOrId) ? inviteIdsOrId : [inviteIdsOrId]
    const validInviteIds = inviteIds.filter(Boolean)

    if (validInviteIds.length === 0 || isOffline) return

    const confirmed = window.confirm('Θέλεις να απορρίψεις αυτή την πρόσκληση;')
    if (!confirmed) return

    const loadingKey = validInviteIds.join(',')
    setInviteActionLoading(loadingKey)

    const results = await Promise.all(
      validInviteIds.map((inviteId) =>
        supabase.rpc('reject_list_invite', {
          invite_id: inviteId,
        })
      )
    )

    const failed = results.find((result) => result.error)

    if (failed?.error) {
      console.error('Σφάλμα απόρριψης invitation:', failed.error)
      alert('Δεν ήταν δυνατή η απόρριψη της πρόσκλησης.')
      setInviteActionLoading(null)
      return
    }

    await fetchPendingInvites()
    setInviteActionLoading(null)
  }

async function fetchShareDetails(list) {
    if (!list?.id) return

    setShareLoading(true)
    setShareError('')
    setShareMessage('')

    const ownerPromise = supabase
      .from('profiles')
      .select('email')
      .eq('id', list.owner_user_id)
      .maybeSingle()

    const membersPromise = supabase
      .from('list_members')
      .select('user_id, role, created_at')
      .eq('list_id', list.id)
      .order('created_at', { ascending: true })

    const [{ data: ownerProfile, error: ownerError }, { data: memberRows, error: membersError }] =
      await Promise.all([ownerPromise, membersPromise])

    if (ownerError) {
      console.error('Σφάλμα φόρτωσης owner profile:', ownerError)
    }

    if (membersError) {
      console.error('Σφάλμα φόρτωσης μελών λίστας:', membersError)
      setShareError('Δεν ήταν δυνατή η φόρτωση των κοινόχρηστων χρηστών.')
      setShareLoading(false)
      return
    }

    const uniqueUserIds = [...new Set((memberRows || []).map((row) => row.user_id))]

    let profilesMap = new Map()
    if (uniqueUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', uniqueUserIds)

      if (profilesError) {
        console.error('Σφάλμα φόρτωσης profiles μελών:', profilesError)
      } else {
        profilesMap = new Map((profilesData || []).map((profile) => [profile.id, profile.email]))
      }
    }

    const mappedMembers = (memberRows || [])
      .filter((row) => row.user_id !== list.owner_user_id)
      .map((row) => ({
        user_id: row.user_id,
        role: row.role,
        email: profilesMap.get(row.user_id) || 'Άγνωστο email',
      }))

    setShareOwnerEmail(ownerProfile?.email || 'Άγνωστο email')
    setShareMembers(mappedMembers)
    setShareLoading(false)
  }

  async function openShareModal(list) {
    if (!list?.id) return

    closeContextMenu()
    setShareModalList({ ...list, isMulti: false, ids: [list.id], displayNames: [list.name] })
    setShareEmail('')
    setShareOwnerEmail('')
    setShareMembers([])
    setShareLoading(false)
    setShareSubmitting(false)
    setShareError('')
    setShareMessage('')
    setShareRemovingUserId(null)
    await fetchShareDetails(list)
  }

  async function openMultiShareModal(targetLists) {
    const safeLists = (targetLists || []).filter(Boolean)
    if (safeLists.length === 0) return

    closeContextMenu()
    setShareModalList({
      id: `multi-${safeLists.map((list) => list.id).join('-')}`,
      isMulti: true,
      ids: safeLists.map((list) => list.id),
      displayNames: safeLists.map((list) => list.name),
      owner_user_id: session?.user?.id || null,
      name: safeLists.map((list) => list.name).join(', '),
    })
    setShareEmail('')
    setShareOwnerEmail(String(session?.user?.email || '').trim().toLowerCase())
    setShareMembers([])
    setShareLoading(false)
    setShareSubmitting(false)
    setShareError('')
    setShareMessage('')
    setShareRemovingUserId(null)
  }

  async function handleInviteToList(e) {
    e.preventDefault()

    if (!shareModalList || !session?.user?.id || isOffline) return

    const email = shareEmail.trim().toLowerCase()
    if (!email) {
      setShareError('Συμπλήρωσε email.')
      return
    }

    if (email === String(shareOwnerEmail || '').trim().toLowerCase()) {
      setShareError('Αυτό το email είναι ήδη ο ιδιοκτήτης της λίστας.')
      return
    }

    const alreadyShared = shareMembers.some(
      (member) => String(member.email || '').trim().toLowerCase() === email
    )

    if (alreadyShared) {
      setShareError('Ο χρήστης έχει ήδη πρόσβαση σε αυτή τη λίστα.')
      return
    }

    setShareSubmitting(true)
    setShareError('')
    setShareMessage('')

    const targetListIds = shareModalList.isMulti ? shareModalList.ids || [] : [shareModalList.id]
    const targetListNames = shareModalList.isMulti
      ? shareModalList.displayNames || []
      : [shareModalList.name]

    const batchId = shareModalList.isMulti
      ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : null

    const inviteRows = targetListIds.map((listId, index) => ({
      list_id: listId,
      invited_email: email,
      invited_by_user_id: session.user.id,
      status: 'pending',
      list_name_snapshot: shareModalList.isMulti
        ? createInviteSnapshot(batchId, targetListNames[index] || `#${listId}`)
        : targetListNames[index] || shareModalList.name,
    }))

    const { error: insertError } = await supabase
      .from('list_invites')
      .insert(inviteRows)

    if (insertError) {
      console.error('Σφάλμα δημιουργίας πρόσκλησης:', insertError)

      if (String(insertError.message || '').toLowerCase().includes('duplicate')) {
        setShareError('Υπάρχει ήδη εκκρεμές invite για μία ή περισσότερες από τις επιλεγμένες λίστες.')
      } else {
        setShareError('Δεν ήταν δυνατή η αποστολή της πρόσκλησης.')
      }

      setShareSubmitting(false)
      return
    }

    try {
      const { error: emailError } = await supabase.functions.invoke('send-list-invite-email', {
        body: {
          invitedEmail: email,
          inviterEmail: String(session.user.email || shareOwnerEmail || '').trim().toLowerCase(),
          ownerEmail: String(shareOwnerEmail || '').trim().toLowerCase(),
          listNames: targetListNames,
          appUrl: window.location.origin,
        },
      })

      if (emailError) {
        console.error('Σφάλμα αποστολής email invitation:', emailError)
        setShareEmail('')
        setShareMessage('Η πρόσκληση αποθηκεύτηκε, αλλά το email δεν στάλθηκε.')
        setShareSubmitting(false)
        return
      }
    } catch (emailError) {
      console.error('Σφάλμα κλήσης function για email invitation:', emailError)
      setShareEmail('')
      setShareMessage('Η πρόσκληση αποθηκεύτηκε, αλλά το email δεν στάλθηκε.')
      setShareSubmitting(false)
      return
    }

    setShareEmail('')
    setShareMessage('Η πρόσκληση στάλθηκε επιτυχώς και το email εστάλη.')
    setShareSubmitting(false)
  }

  async function handleRemoveSharedUser(member) {
    if (!shareModalList?.id || !member?.user_id || isOffline) return

    if (!window.confirm(`Να αφαιρεθεί ο χρήστης "${member.email}" από τη λίστα;`)) {
      return
    }

    setShareRemovingUserId(member.user_id)
    setShareError('')
    setShareMessage('')

    const { error } = await supabase
      .from('list_members')
      .delete()
      .eq('list_id', shareModalList.id)
      .eq('user_id', member.user_id)

    if (error) {
      console.error('Σφάλμα αφαίρεσης χρήστη από λίστα:', error)
      setShareError('Δεν ήταν δυνατή η αφαίρεση του χρήστη.')
      setShareRemovingUserId(null)
      return
    }

    setShareMembers((prev) => prev.filter((item) => item.user_id !== member.user_id))
    setShareMessage('Ο χρήστης αφαιρέθηκε από τη λίστα.')
    setShareRemovingUserId(null)
  }
function applyNoteRealtimePayload(payload) {
  const { eventType, new: newRow, old: oldRow } = payload

  const note = newRow || oldRow
  if (!note) return

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    setTaskNotes((prev) => {
      let exists = false

      const next = prev.map((n) => {
        if (n.id === note.id) {
          exists = true

          const incomingTs = new Date(note.updated_at || 0).getTime()
          const currentTs = new Date(n.updated_at || 0).getTime()

          if (incomingTs >= currentTs) {
            return note
          }

          return n
        }

        return n
      })

      if (!exists) {
        next.push(note)
      }

      return sortNotes(next)
    })
  }

  if (eventType === 'DELETE') {
    setTaskNotes((prev) => prev.filter((n) => n.id !== note.id))
  }
}

  function updateTaskEverywhere(taskId, patch) {
    setTasks((prev) =>
      sortTasks(
        prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
        currentSortMode,
        currentSortDirection
      )
    )

    setAllTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    )

    setActiveTask((prev) => (prev?.id === taskId ? { ...prev, ...patch } : prev))
  }

function applyTaskRealtimePayload(payload) {
  const { eventType, new: newRow, old: oldRow } = payload
  const task = newRow || oldRow
  if (!task) return

  const changedTaskId = task.id
  const changedListId = newRow?.list_id ?? oldRow?.list_id
  const currentSelectedListId = selectedListRef.current?.id ?? null
  const activeEditingNoteId = editingNoteIdRef.current

  if (eventType === 'DELETE') {
    setTasks((prev) => sortTasks(
      prev.filter((t) => t.id !== changedTaskId),
      currentSortModeRef.current,
      currentSortDirectionRef.current
    ))

    setAllTasks((prev) => prev.filter((t) => t.id !== changedTaskId))
    setActiveTask((prev) => (prev?.id === changedTaskId ? null : prev))

    if (activeTaskRef.current?.id === changedTaskId && !activeEditingNoteId) {
      setTaskNotes([])
    }

    return
  }

  setAllTasks((prev) => {
    const exists = prev.some((t) => t.id === changedTaskId)
    if (exists) {
      return prev.map((t) => {
        if (t.id !== changedTaskId) return t
        if (new Date(task.updated_at) >= new Date(t.updated_at || 0)) {
          return { ...t, ...task }
        }
        return t
      })
    }
    return [...prev, task]
  })

  if (String(currentSelectedListId) === String(changedListId)) {
    setTasks((prev) => {
      let found = false

      const next = prev.map((t) => {
        if (t.id !== changedTaskId) return t
        found = true

        if (new Date(task.updated_at) >= new Date(t.updated_at || 0)) {
          return { ...t, ...task }
        }
        return t
      })

      if (!found) {
        next.push(task)
      }

      return sortTasks(
        next,
        currentSortModeRef.current,
        currentSortDirectionRef.current
      )
    })
  } else {
    setTasks((prev) =>
      sortTasks(
        prev.filter((t) => t.id !== changedTaskId),
        currentSortModeRef.current,
        currentSortDirectionRef.current
      )
    )
  }

  setActiveTask((prev) => {
    if (!prev || prev.id !== changedTaskId) return prev
    if (new Date(task.updated_at) >= new Date(prev.updated_at || 0)) {
      return { ...prev, ...task }
    }
    return prev
  })
}

  function handleSelectList(list) {
    setCurrentListRole(list.owner_user_id === session?.user?.id ? 'owner' : 'editor')
    setSelectedList(list)
    setSelectedLists([list.id])
    setListSelectionAnchorId(list.id)
    setActiveTask(null)
    setTaskNotes([])
    setSelectedTasks([])
    setSelectionAnchorId(null)
    setTaskSearch('')
    setEditingTaskTitle(false)
    setEditingNoteId(null)
    setEditingNoteValue('')
    fetchTasks(list.id, false)
    closeContextMenu()
  }

  function handleListClick(list, event) {
    if (!list) return

    const isToggle = event.ctrlKey || event.metaKey
    const isRange = event.shiftKey

    if (isRange && lists.length > 0) {
      const anchorId = listSelectionAnchorId ?? selectedListRef.current?.id ?? list.id
      const anchorIndex = lists.findIndex((item) => item.id === anchorId)
      const clickedIndex = lists.findIndex((item) => item.id === list.id)

      if (anchorIndex !== -1 && clickedIndex !== -1) {
        const start = Math.min(anchorIndex, clickedIndex)
const end = Math.max(anchorIndex, clickedIndex)
const rangeIds = lists.slice(start, end + 1).map((item) => item.id)
const mergedIds = Array.from(
  new Set([...selectedListsRef.current, ...rangeIds])
)

setCurrentListRole(list.owner_user_id === session?.user?.id ? 'owner' : 'editor')
setSelectedList(list)
setSelectedLists(mergedIds)
setListSelectionAnchorId(anchorId)
        setActiveTask(null)
        setTaskNotes([])
        setSelectedTasks([])
        setSelectionAnchorId(null)
        setTaskSearch('')
        setEditingTaskTitle(false)
        setEditingNoteId(null)
        setEditingNoteValue('')
        fetchTasks(list.id, false)
        closeContextMenu()
        return
      }
    }

    if (isToggle) {
      const alreadySelected = selectedListsRef.current.includes(list.id)
      const nextIds = alreadySelected
        ? selectedListsRef.current.filter((id) => id !== list.id)
        : [...selectedListsRef.current, list.id]

      const finalIds = nextIds.length > 0 ? nextIds : [list.id]

      setCurrentListRole(list.owner_user_id === session?.user?.id ? 'owner' : 'editor')
      setSelectedList(list)
      setSelectedLists(finalIds)
      setListSelectionAnchorId(list.id)
      setActiveTask(null)
      setTaskNotes([])
      setSelectedTasks([])
      setSelectionAnchorId(null)
      setTaskSearch('')
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
      fetchTasks(list.id, false)
      closeContextMenu()
      return
    }

  handleSelectList(list)
if (isMobile) {
  navigateMobile('tasks')
}
  }


  async function handleSignIn(e) {
    e.preventDefault()
    setAuthError('')
    setAuthMessage('')

    const email = authEmail.trim()
    const password = authPassword

    if (!email || !password) {
      setAuthError('Συμπλήρωσε email και κωδικό.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    setAuthEmail('')
    setAuthPassword('')
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setAuthError('')
    setAuthMessage('')

    const email = authEmail.trim().toLowerCase()
    const password = authPassword

    if (!email || !password) {
      setAuthError('Συμπλήρωσε email και κωδικό.')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    if (data?.user?.id) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([{ id: data.user.id, email }], { onConflict: 'id' })

      if (profileError) {
        console.error('Σφάλμα δημιουργίας profile:', profileError)
      }
    }

    if (data?.user && !data.session) {
      setAuthMessage(
        'Ο λογαριασμός δημιουργήθηκε. Αν ζητείται επιβεβαίωση email, έλεγξε το inbox σου.'
      )
    } else {
      setAuthMessage('Ο λογαριασμός δημιουργήθηκε επιτυχώς.')
    }

    setAuthPassword('')
  }

async function handleForgotPassword(e) {
  e.preventDefault()
  setAuthError('')
  setAuthMessage('')

  const email = authEmail.trim().toLowerCase()

  if (!email) {
    setAuthError('Συμπλήρωσε το email σου.')
    return
  }

  setAuthResetLoading(true)

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })

  setAuthResetLoading(false)

  if (error) {
    setAuthError(error.message)
    return
  }

  setAuthMessage('Σου στείλαμε email για αλλαγή κωδικού.')
setResetCooldown(60)

const interval = setInterval(() => {
  setResetCooldown((prev) => {
    if (prev <= 1) {
      clearInterval(interval)
      return 0
    }
    return prev - 1
  })
}, 1000)
}

async function handleUpdatePassword(e) {
  e.preventDefault()
  setAuthError('')
  setAuthMessage('')

  const password = authPassword

  if (!password) {
    setAuthError('Συμπλήρωσε νέο κωδικό.')
    return
  }

  if (password.length < 6) {
    setAuthError('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.')
    return
  }

  const { error } = await supabase.auth.updateUser({
    password,
  })

  if (error) {
    setAuthError(error.message)
    return
  }

  setAuthPassword('')
  setAuthMode('signin')
  setAuthMessage('Ο κωδικός άλλαξε επιτυχώς. Μπορείς να συνδεθείς.')
  await supabase.auth.signOut()
}

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSession(null)
    setAuthEmail('')
    setAuthPassword('')
    setAuthError('')
    setAuthMessage('')
    closeShareModal()
  }
  async function handleAddList(e) {
    e.preventDefault()

    const name = newListName.trim()
    if (!name || !session?.user?.id || isOffline) return

    markSaving()

    const nextPosition =
      lists.length > 0 ? Math.max(...lists.map((l) => l.position || 0)) + 1 : 1

    const { data, error } = await supabase
      .from('lists')
      .insert([
        {
          name,
          position: nextPosition,
          owner_user_id: session.user.id,
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('Σφάλμα δημιουργίας λίστας:', error)
      setSyncStatus('error')
      return
    }

    const updatedLists = [...lists, data].sort(
      (a, b) => (a.position || 0) - (b.position || 0)
    )

    setLists(updatedLists)
    setListSortSettings((prev) => ({
      ...prev,
      [data.id]: { mode: 'created', direction: 'asc' },
    }))
    setNewListName('')
    setSelectedList(data)
    setTasks([])
    setActiveTask(null)
    setTaskNotes([])
    setEditingNoteId(null)
    setEditingNoteValue('')
    markSynced()
  }

  async function handleRenameList(list, nextName) {
    if (list?.owner_user_id !== session?.user?.id) return

    const name = nextName.trim()
    if (!name || !list || isOffline) return

    markSaving()

    const { error } = await supabase
      .from('lists')
      .update({ name })
      .eq('id', list.id)

    if (error) {
      console.error('Σφάλμα μετονομασίας λίστας:', error)
      setSyncStatus('error')
      return
    }

    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, name } : l)))

    if (selectedList?.id === list.id) {
      setSelectedList((prev) => ({ ...prev, name }))
      setEditingListValue(name)
    }

    if (shareModalList?.id === list.id) {
      setShareModalList((prev) => (prev ? { ...prev, name } : prev))
    }

    markSynced()
  }

  async function handleRenameTask(task, nextTitle) {
  const title = nextTitle.trim()
  if (!title || !task || isOffline) return

  const now = new Date().toISOString()
  const oldTaskSnapshot = snapshotTaskEverywhere(task.id)
  if (!oldTaskSnapshot) return

  invalidateTaskViews()
  markTaskMutation(task.id)

  const optimisticTask = {
    ...oldTaskSnapshot,
    title,
    updated_at: now,
    updated_by: session?.user?.id || null,
  }

  replaceTaskEverywhere(task.id, optimisticTask)
  markSaving()

  const { error } = await supabase
    .from('tasks')
    .update({
      title,
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    .eq('id', task.id)

  if (error) {
    console.error('Σφάλμα μετονομασίας εργασίας:', error)
    clearTaskMutation(task.id)
    replaceTaskEverywhere(task.id, oldTaskSnapshot)
    setSyncStatus('error')
    return
  }

  setEditingTaskValue(title)
  setEditingTaskTitle(false)
  closeContextMenu()
  markSynced()
}

function scheduleRealtimeRefresh(kind, runner, delay = 120) {
  let timerRef

  if (kind === 'tasks') {
    timerRef = tasksRealtimeTimerRef
  } else if (kind === 'notes') {
    timerRef = notesRealtimeTimerRef
  } else if (kind === 'lists') {
    timerRef = listsRealtimeTimerRef
  } else {
    timerRef = tasksRealtimeTimerRef
  }

  if (timerRef.current) {
    clearTimeout(timerRef.current)
  }

  timerRef.current = setTimeout(async () => {
    timerRef.current = null
    await runner()
  }, delay)
}
  async function handleRenameNote(note, nextContent) {
  const content = nextContent.trim()
  const originalContent = String(note?.content || '').trim()

  if (!content || !note || isOffline) return
  if (content === originalContent) {
    closeContextMenu()
    return
  }

  const oldNotes = [...taskNotes]
  const now = new Date().toISOString()

  setTaskNotes((prev) =>
    sortNotes(prev.map((n) => (n.id === note.id ? { ...n, content } : n)))
  )

  if (activeTask?.id) {
    updateTaskEverywhere(activeTask.id, {
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
  }

  markNoteMutation(note.id)
  markSaving()

  const { error } = await supabase
    .from('task_notes')
    .update({ content, updated_by: session?.user?.id || null })
    .eq('id', note.id)

  if (error) {
    console.error('Σφάλμα μετονομασίας σημείωσης:', error)
    clearNoteMutation(note.id)
    setTaskNotes(oldNotes)
    setSyncStatus('error')
    return
  }

  if (activeTask?.id) {
    await supabase
      .from('tasks')
      .update({ updated_at: now, updated_by: session?.user?.id || null })
      .eq('id', activeTask.id)
  }

  closeContextMenu()
  markSynced()
}

  async function handleInlineRenameNote(noteId) {
  const originalNote = taskNotes.find((n) => n.id === noteId)
  if (!originalNote) {
    clearEditingNoteIfStillSame(noteId, '')
    return
  }

  const content = editingNoteValue.trim()
  const originalContent = String(originalNote.content || '').trim()

  if (!content) {
    const shouldDelete = window.confirm('Να διαγραφεί η σημείωση;')

    if (shouldDelete) {
      await handleDeleteNote(noteId, true)
    } else {
      clearEditingNoteIfStillSame(noteId, originalNote.content || '')
    }
    return
  }

  if (content === originalContent) {
    clearEditingNoteIfStillSame(noteId, '')
    return
  }

  const oldNotes = [...taskNotes]
  const now = new Date().toISOString()

  setTaskNotes((prev) =>
    sortNotes(prev.map((n) => (n.id === noteId ? { ...n, content } : n)))
  )

  if (activeTask?.id) {
    updateTaskEverywhere(activeTask.id, {
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
  }

  markNoteMutation(noteId)
  markSaving()

  const { error } = await supabase
    .from('task_notes')
    .update({ content, updated_by: session?.user?.id || null })
    .eq('id', noteId)

  if (error) {
    console.error('Σφάλμα επεξεργασίας σημείωσης:', error)
    clearNoteMutation(noteId)
    setTaskNotes(oldNotes)
    setSyncStatus('error')
    return
  }

  if (activeTask?.id) {
    await supabase
      .from('tasks')
      .update({ updated_at: now, updated_by: session?.user?.id || null })
      .eq('id', activeTask.id)
  }

  clearEditingNoteIfStillSame(noteId, '')
  markSynced()
}

  async function handleDeleteList(list) {
    if (list?.owner_user_id !== session?.user?.id) return
    if (!list || isOffline) return
    if (!window.confirm(`Να διαγραφεί η λίστα "${list.name}";`)) return

markSaving()

const { error: tasksDeleteError } = await supabase
  .from('tasks')
  .delete()
  .eq('list_id', list.id)

if (tasksDeleteError) {
  console.error('Σφάλμα διαγραφής εργασιών λίστας:', tasksDeleteError)
  setSyncStatus('error')
  return
}

const { data, error } = await supabase
  .from('lists')
  .delete()
  .eq('id', list.id)
  .eq('owner_user_id', session.user.id)
  .select('id, name')

if (error) {
  console.error('Σφάλμα διαγραφής λίστας:', error)
  setSyncStatus('error')
  return
}

closeContextMenu()

const updatedLists = lists.filter((l) => l.id !== list.id)
setLists(updatedLists)
setSelectedLists((prev) => prev.filter((id) => id !== list.id))


    if (selectedList?.id === list.id) {
      localStorage.removeItem(LAST_SELECTED_LIST_KEY)

      if (updatedLists.length > 0) {
        const nextList = updatedLists[0]
        setSelectedList(nextList)
        setSelectedLists([nextList.id])
        setListSelectionAnchorId(nextList.id)
        setActiveTask(null)
        setTaskNotes([])
        setEditingNoteId(null)
        setEditingNoteValue('')
        fetchTasks(nextList.id, false)
      } else {
        setSelectedList(null)
        setSelectedLists([])
        setListSelectionAnchorId(null)
        setTasks([])
        setActiveTask(null)
        setTaskNotes([])
        setEditingNoteId(null)
        setEditingNoteValue('')
      }
    }

    if (shareModalList?.id === list.id) {
      closeShareModal()
    }

    markSynced()
  }

  async function handleLeaveSelectedLists(targetLists) {
    const safeLists = (targetLists || []).filter(Boolean)
    if (safeLists.length === 0 || !session?.user?.id || isOffline) return

    if (!window.confirm(`Να αποχωρήσεις από ${safeLists.length} επιλεγμένες λίστες;`)) return

    const idsToLeave = safeLists.map((list) => list.id)

    const { error } = await supabase
      .from('list_members')
      .delete()
      .eq('user_id', session.user.id)
      .in('list_id', idsToLeave)

    if (error) {
      console.error('Σφάλμα μαζικής αποχώρησης από λίστες:', error)
      return
    }

    closeContextMenu()

    const updatedLists = lists.filter((list) => !idsToLeave.includes(list.id))
    setLists(updatedLists)
    setSelectedLists([])
    setListSelectionAnchorId(null)

    if (selectedList?.id && idsToLeave.includes(selectedList.id)) {
      localStorage.removeItem(LAST_SELECTED_LIST_KEY)

      if (updatedLists.length > 0) {
        const nextList = updatedLists[0]
        setSelectedList(nextList)
        setSelectedLists([nextList.id])
        setListSelectionAnchorId(nextList.id)
        fetchTasks(nextList.id, false)
      } else {
        setSelectedList(null)
        setSelectedLists([])
        setListSelectionAnchorId(null)
        setTasks([])
        setActiveTask(null)
        setTaskNotes([])
        setEditingTaskTitle(false)
        setEditingNoteId(null)
        setEditingNoteValue('')
      }
    }

    fetchLists(false)
    fetchAllTasks(false)
    fetchTaskNoteCounts(false)
  }

  async function handleDeleteSelectedLists(targetLists) {
    const safeLists = (targetLists || []).filter(Boolean)
    if (safeLists.length === 0 || isOffline) return

    if (!window.confirm(`Να διαγραφούν ${safeLists.length} επιλεγμένες λίστες;`)) return

    const idsToDelete = safeLists.map((list) => list.id)

    markSaving()

    const { error } = await supabase.from('lists').delete().in('id', idsToDelete)

    if (error) {
      console.error('Σφάλμα μαζικής διαγραφής λιστών:', error)
      setSyncStatus('error')
      return
    }

    closeContextMenu()

    const updatedLists = lists.filter((list) => !idsToDelete.includes(list.id))
    setLists(updatedLists)
    setSelectedLists([])
    setListSelectionAnchorId(null)

    if (selectedList?.id && idsToDelete.includes(selectedList.id)) {
      localStorage.removeItem(LAST_SELECTED_LIST_KEY)

      if (updatedLists.length > 0) {
        const nextList = updatedLists[0]
        setSelectedList(nextList)
        setSelectedLists([nextList.id])
        setListSelectionAnchorId(nextList.id)
        fetchTasks(nextList.id, false)
      } else {
        setSelectedList(null)
        setSelectedLists([])
        setListSelectionAnchorId(null)
        setTasks([])
      }

      setActiveTask(null)
      setTaskNotes([])
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    if (shareModalList?.isMulti) {
      closeShareModal()
    }

    markSynced()
  }

  async function saveListPositions(updatedLists) {
    if (isOffline) return
    markSaving()

    const results = await Promise.all(
      updatedLists.map((list, index) =>
        supabase.from('lists').update({ position: index + 1 }).eq('id', list.id)
      )
    )

    const hasError = results.some((result) => result.error)
    if (hasError) {
      console.error('Σφάλμα αποθήκευσης σειράς λιστών:', results)
      setSyncStatus('error')
      fetchLists()
      return
    }

    markSynced()
  }

 async function saveTaskPositions(updatedTasks) {
  if (isOffline) return

  suppressOwnTaskRealtimeUntilRef.current = Date.now() + 1500
  markSaving()

  const now = new Date().toISOString()

  const results = await Promise.all(
    updatedTasks.map((task, index) =>
      supabase
        .from('tasks')
        .update({
          position: index + 1,
          updated_at: now,
          updated_by: session?.user?.id || null,
        })
        .eq('id', task.id)
    )
  )

  const hasError = results.some((result) => result.error)
  if (hasError) {
    suppressOwnTaskRealtimeUntilRef.current = 0
    console.error('Σφάλμα αποθήκευσης σειράς εργασιών:', results)
    setSyncStatus('error')
    fetchTasks(selectedList?.id, false)
    return
  }

  markSynced()
}

  function handleListDragStart(event, listId) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `list:${listId}`)
    setDraggedListId(listId)
    setDraggedTaskId(null)
    setDraggedTaskIds([])
  }

  function handleTaskDragStart(event, taskId) {
  if (taskSearch.trim() || isOffline) return

  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', `task:${taskId}`)

  const dragIds =
    selectedTasks.includes(taskId) && selectedTasks.length > 1
      ? [...selectedTasks]
      : [taskId]

  setDraggedTaskIds(dragIds)
  setDraggedTaskId(taskId)
  setDraggedListId(null)

  if (isMobile) {
    setSelectedTasks([taskId])
    setSelectionAnchorId(taskId)
  }
}

  function handleListDragOver(event, targetListId) {
    event.preventDefault()

    if (draggedTaskIds.length > 0) {
      const draggedItems = allTasks.filter((task) => draggedTaskIds.includes(task.id))
      const canDropHere = draggedItems.some((task) => task.list_id !== targetListId)

      setTaskDropListId(canDropHere ? targetListId : null)
      setDropIndicator(null)
      return
    }

    if (!draggedListId || draggedListId === targetListId) {
      setDropIndicator(null)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    const position = offsetY < rect.height / 2 ? 'top' : 'bottom'

    setDropIndicator({ targetListId, position })
  }
  
function handleTaskDragOver(event, targetTaskId) {
    if (currentSortMode !== 'manual') return
    if (!draggedTaskId || draggedTaskId === targetTaskId) return
    if (draggedTaskIds.length > 1) return

    event.preventDefault()

    const rect = event.currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    const position = offsetY < rect.height / 2 ? 'top' : 'bottom'

    setTaskReorderIndicator({ targetTaskId, position })
  }

  async function handleTaskDrop(targetTaskId) {
    if (currentSortMode !== 'manual') {
      setTaskReorderIndicator(null)
      return
    }

    if (!draggedTaskId || draggedTaskId === targetTaskId || !taskReorderIndicator) {
      setTaskReorderIndicator(null)
      return
    }

    const currentTasks = [...tasks]
    const draggedIndex = currentTasks.findIndex((t) => t.id === draggedTaskId)
    const targetIndex = currentTasks.findIndex((t) => t.id === targetTaskId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setTaskReorderIndicator(null)
      return
    }

    const [draggedItem] = currentTasks.splice(draggedIndex, 1)

    let insertIndex = targetIndex
    if (taskReorderIndicator.position === 'bottom') {
      insertIndex = targetIndex + 1
    }

    if (draggedIndex < insertIndex) {
      insertIndex -= 1
    }

    currentTasks.splice(insertIndex, 0, draggedItem)

    const reorderedTasks = currentTasks.map((task, index) => ({
      ...task,
      position: index + 1,
    }))

    setTasks(sortTasks(reorderedTasks, 'manual', currentSortDirection))
    setAllTasks((prev) =>
      prev.map((task) => {
        const updated = reorderedTasks.find((t) => t.id === task.id)
        return updated ? { ...task, position: updated.position } : task
      })
    )

        setDraggedTaskId(null)
    setDraggedTaskIds([])
    setTaskReorderIndicator(null)

    await saveTaskPositions(reorderedTasks)

    if (isMobile) {
      setSelectedTasks([])
      setSelectionAnchorId(null)
    }
  }

  async function handleListDrop(targetListId) {
    if (draggedTaskIds.length > 0) {
      await handleMoveDraggedTasksToList(draggedTaskIds, targetListId)
      setDraggedTaskId(null)
      setDraggedTaskIds([])
      setTaskDropListId(null)
      return
    }

    if (!draggedListId || draggedListId === targetListId || !dropIndicator) {
      setDraggedListId(null)
      setDropIndicator(null)
      return
    }

    const currentLists = [...lists]
    const draggedIndex = currentLists.findIndex((l) => l.id === draggedListId)
    const targetIndex = currentLists.findIndex((l) => l.id === targetListId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedListId(null)
      setDropIndicator(null)
      return
    }

    const [draggedItem] = currentLists.splice(draggedIndex, 1)

    let insertIndex = targetIndex
    if (dropIndicator.position === 'bottom') {
      insertIndex = targetIndex + 1
    }

    if (draggedIndex < insertIndex) {
      insertIndex -= 1
    }

    currentLists.splice(insertIndex, 0, draggedItem)

    const reorderedLists = currentLists.map((list, index) => ({
      ...list,
      position: index + 1,
    }))

    setLists(reorderedLists)
    setDraggedListId(null)
    setDropIndicator(null)

    await saveListPositions(reorderedLists)
  }

  async function handleGlobalDragEnd(event) {
    mobileSelectionClearedDuringDragRef.current = false
    const { active, over } = event

    setActiveDragId(null)
    handleAnyDragEnd()

    if (!over || active.id === over.id) {
      return
    }

    const activeMeta = parseDndId(active.id)
    const overMeta = parseDndId(over.id)
    const activeId = normalizeId(activeMeta.rawId)
    const overId = normalizeId(overMeta.rawId)

    if (activeMeta.type === 'list' && overMeta.type === 'list') {
      const oldIndex = lists.findIndex((list) => String(list.id) === String(activeId))
      const newIndex = lists.findIndex((list) => String(list.id) === String(overId))

      if (oldIndex === -1 || newIndex === -1) return

      const reorderedLists = arrayMove(lists, oldIndex, newIndex).map((list, index) => ({
        ...list,
        position: index + 1,
      }))

      setLists(reorderedLists)
      await saveListPositions(reorderedLists)
      return
    }

    if (activeMeta.type !== 'task') {
      return
    }

    const dragTaskIds =
      selectedTasks.includes(activeId) && selectedTasks.length > 1 ? [...selectedTasks] : [activeId]

    if (overMeta.type === 'list' || overMeta.type === 'task-list-target') {
      await handleMoveDraggedTasksToList(dragTaskIds, overId)
      return
    }

    if (overMeta.type !== 'task') {
      return
    }

    if (taskSearch.trim() || currentSortMode !== 'manual' || dragTaskIds.length > 1) {
      return
    }

    const oldIndex = tasks.findIndex((task) => String(task.id) === String(activeId))
const newIndex = tasks.findIndex((task) => String(task.id) === String(overId))

if (oldIndex === -1 || newIndex === -1) return

const activeTaskItem = tasks[oldIndex]
const overTaskItem = tasks[newIndex]

if (isMobile && activeTaskItem?.completed !== overTaskItem?.completed) {
  return
}

const reorderedTasks = arrayMove(tasks, oldIndex, newIndex).map((task, index) => ({
  ...task,
  position: index + 1,
}))

setTasks(sortTasks(reorderedTasks, 'manual', currentSortDirection))
setAllTasks((prev) =>
  prev.map((task) => {
    const updated = reorderedTasks.find((t) => String(t.id) === String(task.id))
    return updated ? { ...task, position: updated.position } : task
  })
)

await saveTaskPositions(reorderedTasks)
  }

  async function handleMoveTaskByDrag(taskId, targetListId) {
    if (isOffline) return

    const task = allTasks.find((t) => t.id === taskId)
    if (!task) return
    if (task.list_id === targetListId) return

    const now = new Date().toISOString()
    const oldTasks = [...tasks]
    const remainingTasks = tasks.filter((t) => t.id !== task.id)

    setTasks(sortTasks(remainingTasks, currentSortMode, currentSortDirection))
    setAllTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              list_id: targetListId,
              updated_at: now,
              updated_by: session?.user?.id || null,
            }
          : t
      )
    )
    setSelectedTasks((prev) => prev.filter((id) => id !== task.id))

    if (activeTask?.id === task.id) {
      setActiveTask(null)
      setTaskNotes([])
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    markSaving()

    const { error } = await supabase
      .from('tasks')
      .update({
        list_id: targetListId,
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
      .eq('id', task.id)

    if (error) {
      console.error('Σφάλμα μετακίνησης εργασίας με drag and drop:', error)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

  if (isMobile) {
    setSelectedTasks([])
    setSelectionAnchorId(null)
  }
    markSynced()
  }

  async function handleMoveDraggedTasksToList(taskIds, targetListId) {
    if (isOffline) return
    if (!taskIds.length) return

    const draggedItems = allTasks.filter((task) => taskIds.includes(task.id))
    const canDropHere = draggedItems.some((task) => task.list_id !== targetListId)

    if (!canDropHere) return

    if (taskIds.length === 1) {
      await handleMoveTaskByDrag(taskIds[0], targetListId)
      return
    }

    const now = new Date().toISOString()
    const oldTasks = [...tasks]

    setTasks((prev) =>
      sortTasks(
        prev.filter((task) => !taskIds.includes(task.id)),
        currentSortMode,
        currentSortDirection
      )
    )

    setAllTasks((prev) =>
      prev.map((task) =>
        taskIds.includes(task.id)
          ? {
              ...task,
              list_id: targetListId,
              updated_at: now,
              updated_by: session?.user?.id || null,
            }
          : task
      )
    )

    if (activeTask?.id && taskIds.includes(activeTask.id)) {
      setActiveTask(null)
      setTaskNotes([])
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    setSelectedTasks([])
    setSelectionAnchorId(null)

    markSaving()

    const results = await Promise.all(
      taskIds.map((id) =>
        supabase
          .from('tasks')
          .update({
            list_id: targetListId,
            updated_at: now,
            updated_by: session?.user?.id || null,
          })
          .eq('id', id)
      )
    )

      const hasError = results.some((result) => result.error)
  if (hasError) {
    suppressOwnTaskRealtimeUntilRef.current = 0
    console.error('Σφάλμα αποθήκευσης σειράς εργασιών:', results)
    setSyncStatus('error')
    fetchTasks(selectedList?.id, false)
    return
  }

  if (isMobile) {
    setSelectedTasks([])
    setSelectionAnchorId(null)
  }

  markSynced()
}

  function handleAnyDragEnd() {
    mobileSelectionClearedDuringDragRef.current = false
    setActiveDragId(null)
    setActiveOverId(null)
    setDraggedListId(null)
    setDraggedTaskId(null)
    setDraggedTaskIds([])
    setDropIndicator(null)
    setTaskDropListId(null)
    setTaskReorderIndicator(null)
  }

  async function handleAddTask(e) {
    e.preventDefault()

    const title = newTaskTitle.trim()
    if (!title || !selectedList || isOffline) return

    markSaving()

    const nextPosition =
      tasks.length > 0 ? Math.max(...tasks.map((t) => t.position || 0)) + 1 : 1

    const tempTask = {
      id: `temp-${Date.now()}`,
      list_id: selectedList.id,
      title,
      completed: false,
      needs_weighing: false,
      is_store: false,
      is_skroutz: false,
      position: nextPosition,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      created_by: session?.user?.id || null,
      updated_by: session?.user?.id || null,
      timer_started_at: new Date().toISOString(),
      timer_elapsed_seconds: 0,
    }

    setTasks((prev) => sortTasks([...prev, tempTask], currentSortMode, currentSortDirection))
    setNewTaskTitle('')

    const { data, error } = await supabase
      .from('tasks')
      .insert([
  {
    list_id: selectedList.id,
    title,
    completed: false,
    needs_weighing: false,
    is_store: false,
    is_skroutz: false,
    position: nextPosition,
    updated_at: new Date().toISOString(),
    created_by: session?.user?.id || null,
    updated_by: session?.user?.id || null,

    timer_started_at: new Date().toISOString(),
    timer_elapsed_seconds: 0,
  },
])
      .select()
      .single()

    if (error) {
      console.error('Σφάλμα προσθήκης εργασίας:', error)
      setTasks((prev) => prev.filter((task) => task.id !== tempTask.id))
      setSyncStatus('error')
      return
    }

    setTasks((prev) =>
      sortTasks(
        prev.map((task) => (task.id === tempTask.id ? data : task)),
        currentSortMode,
        currentSortDirection
      )
    )
    setAllTasks((prev) => [...prev, data])

    markSynced()
  }

  async function handleTaskPaste(event) {
    if (!selectedList || isOffline) return

    const pastedText = event.clipboardData.getData('text')
    const lines = pastedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')

    if (lines.length <= 1) return

    event.preventDefault()
    markSaving()

    const maxPosition =
      tasks.length > 0 ? Math.max(...tasks.map((t) => t.position || 0)) : 0

    const now = new Date().toISOString()

    const tempTasks = lines.map((title, index) => ({
      id: `temp-${Date.now()}-${index}`,
      list_id: selectedList.id,
      title,
      completed: false,
      needs_weighing: false,
      is_store: false,
      is_skroutz: false,
      position: maxPosition + index + 1,
      updated_at: now,
      created_at: now,
      created_by: session?.user?.id || null,
      updated_by: session?.user?.id || null,
    }))

    setTasks((prev) =>
      sortTasks([...prev, ...tempTasks], currentSortMode, currentSortDirection)
    )
    setNewTaskTitle('')

    const insertTasks = lines.map((title, index) => ({
      list_id: selectedList.id,
      title,
      completed: false,
      needs_weighing: false,
      is_store: false,
      is_skroutz: false,
      position: maxPosition + index + 1,
      updated_at: now,
      created_by: session?.user?.id || null,
      updated_by: session?.user?.id || null,
    }))

    const { data, error } = await supabase
  .from('tasks')
  .insert(insertTasks)
  .select()

if (error) {
  console.error('Σφάλμα μαζικής επικόλλησης εργασιών:', error)

  setTasks((prev) =>
    prev.filter((task) => !tempTasks.some((temp) => temp.id === task.id))
  )

  setSyncStatus('error')
  return
}

const insertedTasks = data || []

setTasks((prev) => {
  const withoutTemps = prev.filter(
    (task) => !tempTasks.some((temp) => temp.id === task.id)
  )

  return sortTasks(
    [...withoutTemps, ...insertedTasks],
    currentSortMode,
    currentSortDirection
  )
})

setAllTasks(insertedTasks)

markSynced()
  }

  function handleTaskLongPress(task) {
  if (!isMobile) return

  setActiveTask(task)
  setEditingTaskValue(task.title)
  setEditingNoteId(null)
  setEditingNoteValue('')
  setTaskNotes([])
  fetchNotes(task.id, false, true)

  setSelectedTasks((prev) =>
    prev.includes(task.id) ? prev : [...prev, task.id]
  )
  setSelectionAnchorId(task.id)
}

    function handleTaskClick(task, event) {
    setActiveTask(task)
    setEditingTaskValue(task.title)
    setEditingNoteId(null)
    setEditingNoteValue('')
    setTaskNotes([])
    fetchNotes(task.id, false, true)

    const taskId = task.id

const isSearchClick = Boolean(taskSearch.trim())

if (isSearchClick) {
  setSelectedTasks([taskId])
  setSelectionAnchorId(taskId)

  if (isMobile) {
    openedTaskFromMobileSearchRef.current = true

    const searchScrollArea = document.querySelector('.mobile-search-results')
    mobileSearchScrollTopRef.current = searchScrollArea?.scrollTop || 0

    navigateMobile('details')
  }

  return
}

    if (event.shiftKey && selectionAnchorId !== null) {
      const currentIndex = visibleTasks.findIndex((t) => t.id === taskId)
      const anchorIndex = visibleTasks.findIndex((t) => t.id === selectionAnchorId)

      if (currentIndex !== -1 && anchorIndex !== -1) {
        const start = Math.min(currentIndex, anchorIndex)
        const end = Math.max(currentIndex, anchorIndex)
        const rangeIds = visibleTasks.slice(start, end + 1).map((t) => t.id)
        const mergedIds = Array.from(new Set([...selectedTasks, ...rangeIds]))
        setSelectedTasks(mergedIds)
        return
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedTasks((prev) =>
        prev.includes(taskId)
          ? prev.filter((id) => id !== taskId)
          : [...prev, taskId]
      )
      setSelectionAnchorId(taskId)
      return
    }

        if (isMobile && selectedTasks.length > 0) {
      setSelectedTasks((prev) => {
        if (prev.includes(taskId)) {
          const nextSelected = prev.filter((id) => id !== taskId)

          if (activeTask?.id === taskId) {
            if (nextSelected.length > 0) {
              const nextActiveTask =
                visibleTasks.find((t) => t.id === nextSelected[nextSelected.length - 1]) || null
              setActiveTask(nextActiveTask)
              if (nextActiveTask) {
                setEditingTaskValue(nextActiveTask.title)
                fetchNotes(nextActiveTask.id, false)
              }
            } else {
              setActiveTask(null)
              setTaskNotes([])
              setEditingTaskValue('')
              setEditingTaskTitle(false)
              setEditingNoteId(null)
              setEditingNoteValue('')
            }
          }

          return nextSelected
        }

        return [...prev, taskId]
      })

      setSelectionAnchorId(taskId)
      return
    }

    setSelectedTasks([taskId])
    setSelectionAnchorId(taskId)

    if (isMobile) {
      navigateMobile('details')
    }
  }

function playTaskCompleteSound() {
  try {
    const audio = new Audio(taskCompleteSoundFile)
    audio.volume = 0.6
    audio.currentTime = 0
    void audio.play()
  } catch (error) {
    console.warn('Δεν μπόρεσε να παίξει ο ήχος ολοκλήρωσης:', error)
  }
}

async function handleToggleCompleted(task) {
  if (isOffline || !task) return

  const oldTaskSnapshot = snapshotTaskEverywhere(task.id)
  if (!oldTaskSnapshot) return

  const scrollSnapshot = getTaskScrollSnapshot(task.id)
  const newCompleted = !oldTaskSnapshot.completed

  if (newCompleted) {
    playTaskCompleteSound?.()
    if (navigator.vibrate) navigator.vibrate(10)
  }

  const now = new Date().toISOString()
  const currentElapsedSeconds = getTaskTimerSeconds(oldTaskSnapshot)
  const nextTimerStartedAt = newCompleted ? null : now

  invalidateTaskViews()
  markTaskMutation(task.id)

  const optimisticTask = {
    ...oldTaskSnapshot,
    completed: newCompleted,
    timer_elapsed_seconds: currentElapsedSeconds,
    timer_started_at: nextTimerStartedAt,
    updated_at: now,
    updated_by: session?.user?.id || null,
  }

  replaceTaskEverywhere(task.id, optimisticTask)
  restoreTaskScrollSnapshot(scrollSnapshot)
  markSaving()

  const { error } = await supabase
    .from('tasks')
    .update({
      completed: newCompleted,
      timer_elapsed_seconds: currentElapsedSeconds,
      timer_started_at: nextTimerStartedAt,
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    .eq('id', task.id)

  if (error) {
    console.error('Σφάλμα αλλαγής ολοκλήρωσης:', error)
    clearTaskMutation(task.id)
    replaceTaskEverywhere(task.id, oldTaskSnapshot)
    restoreTaskScrollSnapshot(scrollSnapshot)
    setSyncStatus('error')
    return
  }

  markSynced()
}

async function handleToggleStore(task, event) {
  event.preventDefault()
  event.stopPropagation()
  if (isOffline || !task) return

  const oldTaskSnapshot = snapshotTaskEverywhere(task.id)
  if (!oldTaskSnapshot) return

  const now = new Date().toISOString()
  const newValue = !oldTaskSnapshot.is_store

  invalidateTaskViews()
  markTaskMutation(task.id)

  const optimisticTask = {
    ...oldTaskSnapshot,
    is_store: newValue,
    updated_at: now,
    updated_by: session?.user?.id || null,
  }

  replaceTaskEverywhere(task.id, optimisticTask)
  markSaving()

  const { error } = await supabase
    .from('tasks')
    .update({
      is_store: newValue,
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    .eq('id', task.id)

  if (error) {
    console.error('Σφάλμα αλλαγής καταστήματος:', error)
    clearTaskMutation(task.id)
    replaceTaskEverywhere(task.id, oldTaskSnapshot)
    setSyncStatus('error')
    return
  }

  markSynced()
}

async function handleToggleSkroutz(task, event) {
  event.preventDefault()
  event.stopPropagation()
  if (isOffline || !task) return

  const oldTaskSnapshot = snapshotTaskEverywhere(task.id)
  if (!oldTaskSnapshot) return

  const now = new Date().toISOString()
  const newValue = !oldTaskSnapshot.is_skroutz

  invalidateTaskViews()
  markTaskMutation(task.id)

  const optimisticTask = {
    ...oldTaskSnapshot,
    is_skroutz: newValue,
    updated_at: now,
    updated_by: session?.user?.id || null,
  }

  replaceTaskEverywhere(task.id, optimisticTask)
  markSaving()

  const { error } = await supabase
    .from('tasks')
    .update({
      is_skroutz: newValue,
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    .eq('id', task.id)

  if (error) {
    console.error('Σφάλμα αλλαγής Skroutz:', error)
    clearTaskMutation(task.id)
    replaceTaskEverywhere(task.id, oldTaskSnapshot)
    setSyncStatus('error')
    return
  }

  markSynced()
}

async function handleToggleWeighing(task, event) {
  event.preventDefault()
  event.stopPropagation()
  if (isOffline || !task) return

  const oldTaskSnapshot = snapshotTaskEverywhere(task.id)
  if (!oldTaskSnapshot) return

  const now = new Date().toISOString()
  const newValue = !oldTaskSnapshot.needs_weighing

  invalidateTaskViews()
  markTaskMutation(task.id)

  const optimisticTask = {
    ...oldTaskSnapshot,
    needs_weighing: newValue,
    updated_at: now,
    updated_by: session?.user?.id || null,
  }

  replaceTaskEverywhere(task.id, optimisticTask)
  markSaving()

  const { error } = await supabase
    .from('tasks')
    .update({
      needs_weighing: newValue,
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    .eq('id', task.id)

  if (error) {
    console.error('Σφάλμα αλλαγής ογκομέτρησης:', error)
    clearTaskMutation(task.id)
    replaceTaskEverywhere(task.id, oldTaskSnapshot)
    setSyncStatus('error')
    return
  }

  markSynced()
}

  async function handleDeleteSelected() {
    if (isOffline) return
    if (selectedTasks.length === 0) return

    const label =
      selectedTasks.length === 1
        ? 'Να διαγραφεί η επιλεγμένη εργασία;'
        : `Να διαγραφούν ${selectedTasks.length} επιλεγμένες εργασίες;`

    if (!window.confirm(label)) return

const oldTasks = [...tasks]
const idsToDelete = [...selectedTasks]

idsToDelete.forEach((taskId) => {
  markTaskMutation(taskId)
})

invalidateTaskViews()

setTasks((prev) => prev.filter((task) => !idsToDelete.includes(task.id)))
setAllTasks((prev) => prev.filter((task) => !idsToDelete.includes(task.id)))
    setSelectedTasks([])
    setSelectionAnchorId(null)

    if (activeTask && idsToDelete.includes(activeTask.id)) {
      setActiveTask(null)
      setTaskNotes([])
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    markSaving()

    const { error } = await supabase
      .from('tasks')
      .delete()
      .in('id', idsToDelete)

    if (error) {
  console.error('Σφάλμα διαγραφής:', error)

  idsToDelete.forEach((taskId) => {
    clearTaskMutation(taskId)
  })

  setTasks(oldTasks)
  setSyncStatus('error')
  return
}

    closeContextMenu()
    markSynced()
  }

const selectedTasksData = allTasks.filter((t) =>
  selectedTasks.includes(t.id)
)

const hasIncompleteSelected = selectedTasksData.some((t) => !t.completed)
const hasCompletedSelected = selectedTasksData.some((t) => t.completed)

const canBulkComplete =
  selectedTasks.length > 1 &&
  hasIncompleteSelected &&
  !hasCompletedSelected
const canBulkUncomplete =
  selectedTasks.length > 1 &&
  hasCompletedSelected &&
  !hasIncompleteSelected

async function handleCompleteSelectedTasks() {
  if (isOffline) return
  if (selectedTasks.length === 0) return

  const idsToComplete = [...selectedTasks]

  const selectedTaskObjects = tasks.filter((task) =>
    idsToComplete.includes(task.id)
  )

  const incompleteSelectedTasks = selectedTaskObjects.filter(
    (task) => !task.completed
  )

  if (incompleteSelectedTasks.length === 0) {
    window.alert('Οι επιλεγμένες εργασίες είναι ήδη ολοκληρωμένες.')
    return
  }

  const label =
    incompleteSelectedTasks.length === 1
      ? 'Να ολοκληρωθεί η επιλεγμένη εργασία;'
      : `Να ολοκληρωθούν ${incompleteSelectedTasks.length} επιλεγμένες εργασίες;`

  if (!window.confirm(label)) return

  const now = new Date().toISOString()
  const oldTasks = [...tasks]
  const oldAllTasks = [...allTasks]

  const completedMap = new Map(
    incompleteSelectedTasks.map((task) => [
      task.id,
      {
        completed: true,
        timer_elapsed_seconds: getTaskTimerSeconds(task),
        timer_started_at: null,
        updated_at: now,
        updated_by: session?.user?.id || null,
      },
    ])
  )

  incompleteSelectedTasks.forEach((task) => {
    markTaskMutation(task.id)
  })

  invalidateTaskViews()

  setTasks((prev) =>
    prev.map((task) => {
      const patch = completedMap.get(task.id)
      return patch ? { ...task, ...patch } : task
    })
  )

  setAllTasks((prev) =>
    prev.map((task) => {
      const patch = completedMap.get(task.id)
      return patch ? { ...task, ...patch } : task
    })
  )

  if (activeTask && completedMap.has(activeTask.id)) {
    setActiveTask((prev) => {
      if (!prev) return prev
      const patch = completedMap.get(prev.id)
      return patch ? { ...prev, ...patch } : prev
    })
  }

  markSaving()

const idsToUpdate = incompleteSelectedTasks.map((task) => task.id)

const { error: firstError } = await supabase
  .from('tasks')
  .update({
    completed: true,
    timer_started_at: null,
    updated_at: now,
    updated_by: session?.user?.id || null,
  })
  .in('id', idsToUpdate)

  if (firstError) {
    console.error('Σφάλμα ολοκλήρωσης επιλεγμένων εργασιών:', firstError)

    incompleteSelectedTasks.forEach((task) => {
      clearTaskMutation(task.id)
    })

    setTasks(oldTasks)
    setAllTasks(oldAllTasks)
    setSyncStatus('error')
    return
  }

  setSelectedTasks([])
  setSelectionAnchorId(null)
  closeContextMenu()
  setIsTaskActionsMenuOpen(false)
  setIsMobileTaskMoveMenuOpen(false)
  markSynced()
}

async function handleUncompleteSelectedTasks() {
  if (isOffline) return
  if (selectedTasks.length === 0) return

  const idsToUncomplete = [...selectedTasks]

  const selectedTaskObjects = tasks.filter((task) =>
    idsToUncomplete.includes(task.id)
  )

  const completedSelectedTasks = selectedTaskObjects.filter(
    (task) => task.completed
  )

  if (completedSelectedTasks.length === 0) {
    window.alert('Οι επιλεγμένες εργασίες δεν είναι ολοκληρωμένες.')
    return
  }

  const label =
    completedSelectedTasks.length === 1
      ? 'Να γίνει άρση ολοκλήρωσης της επιλεγμένης εργασίας;'
      : `Να γίνει άρση ολοκλήρωσης ${completedSelectedTasks.length} επιλεγμένων εργασιών;`

  if (!window.confirm(label)) return

  const now = new Date().toISOString()
  const oldTasks = [...tasks]
  const oldAllTasks = [...allTasks]

  const uncompletedMap = new Map(
    completedSelectedTasks.map((task) => [
      task.id,
      {
        completed: false,
        timer_started_at: now,
        updated_at: now,
        updated_by: session?.user?.id || null,
      },
    ])
  )

  completedSelectedTasks.forEach((task) => {
    markTaskMutation(task.id)
  })

  invalidateTaskViews()

  setTasks((prev) =>
    prev.map((task) => {
      const patch = uncompletedMap.get(task.id)
      return patch ? { ...task, ...patch } : task
    })
  )

  setAllTasks((prev) =>
    prev.map((task) => {
      const patch = uncompletedMap.get(task.id)
      return patch ? { ...task, ...patch } : task
    })
  )

  if (activeTask && uncompletedMap.has(activeTask.id)) {
    setActiveTask((prev) => {
      if (!prev) return prev
      const patch = uncompletedMap.get(prev.id)
      return patch ? { ...prev, ...patch } : prev
    })
  }

  markSaving()

 const idsToUpdate = completedSelectedTasks.map((task) => task.id)

const { error: firstError } = await supabase
  .from('tasks')
  .update({
    completed: false,
    timer_started_at: now,
    updated_at: now,
    updated_by: session?.user?.id || null,
  })
  .in('id', idsToUpdate)

  if (firstError) {
    console.error('Σφάλμα άρσης ολοκλήρωσης επιλεγμένων εργασιών:', firstError)

    completedSelectedTasks.forEach((task) => {
      clearTaskMutation(task.id)
    })

    setTasks(oldTasks)
    setAllTasks(oldAllTasks)
    setSyncStatus('error')
    return
  }

  setSelectedTasks([])
  setSelectionAnchorId(null)
  closeContextMenu()
  setIsTaskActionsMenuOpen(false)
  setIsMobileTaskMoveMenuOpen(false)
  markSynced()
}

    async function handleDeleteOneTask(taskId, options = {}) {
  if (isOffline) return

  const { skipConfirm = false } = options
  const task = allTasks.find((t) => t.id === taskId)

  if (!skipConfirm) {
    if (!window.confirm(`Να διαγραφεί η εργασία "${task?.title || ''}";`)) return
  }

  const oldTasks = [...tasks]
  const oldAllTasks = [...allTasks]
  const oldSelectedTasks = [...selectedTasks]

  setTasks((prev) => prev.filter((taskItem) => taskItem.id !== taskId))
  setAllTasks((prev) => prev.filter((taskItem) => taskItem.id !== taskId))
  setSelectedTasks((prev) => prev.filter((id) => id !== taskId))

  if (activeTask?.id === taskId) {
    setActiveTask(null)
    setTaskNotes([])
    setEditingTaskTitle(false)
    setEditingNoteId(null)
    setEditingNoteValue('')
  }

  markSaving()

  const { error } = await supabase.from('tasks').delete().eq('id', taskId)

  if (error) {
    console.error('Σφάλμα διαγραφής εργασίας:', error)
    setTasks(oldTasks)
    setAllTasks(oldAllTasks)
    setSelectedTasks(oldSelectedTasks)
    setSyncStatus('error')
    return
  }

  closeContextMenu()
  markSynced()
}

  async function handleMoveTaskToList(task, targetList) {
    if (!task || !targetList || isOffline) return
    if (task.list_id === targetList.id) {
      closeContextMenu()
      return
    }

    const oldTasks = [...tasks]
    const remainingTasks = tasks.filter((t) => t.id !== task.id)
    const now = new Date().toISOString()

    setTasks(sortTasks(remainingTasks, currentSortMode, currentSortDirection))
    setAllTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              list_id: targetList.id,
              updated_at: now,
              updated_by: session?.user?.id || null,
            }
          : t
      )
    )
    setSelectedTasks((prev) => prev.filter((id) => id !== task.id))

    if (activeTask?.id === task.id) {
      setActiveTask(null)
      setTaskNotes([])
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    markSaving()

    const { error } = await supabase
      .from('tasks')
      .update({
        list_id: targetList.id,
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
      .eq('id', task.id)

    if (error) {
      console.error('Σφάλμα μετακίνησης εργασίας:', error)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

    closeContextMenu()
    markSynced()
  }

  async function handleMoveSelectedTasksToList(targetList) {
    if (!targetList || selectedTasks.length === 0 || isOffline) return

    const idsToMove = [...selectedTasks]
    const now = new Date().toISOString()
    const oldTasks = [...tasks]

    const movingTasks = allTasks.filter((task) => idsToMove.includes(task.id))
    const hasAnyDifferentList = movingTasks.some((task) => task.list_id !== targetList.id)

    if (!hasAnyDifferentList) {
      closeContextMenu()
      return
    }

    setTasks((prev) =>
      sortTasks(
        prev.filter((task) => !idsToMove.includes(task.id)),
        currentSortMode,
        currentSortDirection
      )
    )

    setAllTasks((prev) =>
      prev.map((task) =>
        idsToMove.includes(task.id)
          ? {
              ...task,
              list_id: targetList.id,
              updated_at: now,
              updated_by: session?.user?.id || null,
            }
          : task
      )
    )

    if (activeTask?.id && idsToMove.includes(activeTask.id)) {
      setActiveTask(null)
      setTaskNotes([])
      setEditingTaskTitle(false)
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    setSelectedTasks([])
    setSelectionAnchorId(null)

    markSaving()

    const results = await Promise.all(
      idsToMove.map((id) =>
        supabase
          .from('tasks')
          .update({
            list_id: targetList.id,
            updated_at: now,
            updated_by: session?.user?.id || null,
          })
          .eq('id', id)
      )
    )

    const hasError = results.some((result) => result.error)

    if (hasError) {
      console.error('Σφάλμα μετακίνησης πολλαπλών εργασιών:', results)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

    closeContextMenu()
    markSynced()
  }

  async function handlePrintTasks() {
  const browserTitle = 'To Do ΒΡΟΝΤΙΝΟΣ ΜΙΚΕ'
  const pageHeading = taskSearch.trim()
    ? `Αναζήτηση: ${taskSearch.trim()}`
    : `Λίστα: ${selectedList?.name || 'Εργασίες'}`

  const printableTasks = visibleTasks.filter((task) => !task.completed)

  const rows = printableTasks
    .map((task) => {
      const listLine = taskSearch.trim()
        ? `<div style="font-size:11px;color:#666;margin-top:3px;">Λίστα: ${escapeHtml(task.list_name || '—')}</div>`
        : ''
      const measuring = task.needs_weighing
        ? `<div style="font-size:11px;color:#666;margin-top:3px;">Ογκομέτρηση</div>`
        : ''

      return `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #ddd;">
          <div style="width:14px;height:14px;border:1.5px solid #444;border-radius:999px;box-sizing:border-box;margin-top:1px;flex-shrink:0;"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${escapeHtml(task.title || '')}</div>
            ${listLine}
            ${measuring}
          </div>
        </div>
      `
    })
    .join('')

  const html = `
    <html>
      <head>
        <title>${escapeHtml(browserTitle)}</title>
      </head>
      <body style="font-family:Arial,sans-serif;padding:20px;">
        <h1 style="margin-top:0;font-size:18px;">${escapeHtml(pageHeading)}</h1>
        ${rows || '<p style="font-size:13px;">Δεν υπάρχουν μη ολοκληρωμένες εργασίες.</p>'}
      </body>
    </html>
  `

  const printFrame = document.createElement('iframe')
  printFrame.style.position = 'fixed'
  printFrame.style.right = '0'
  printFrame.style.bottom = '0'
  printFrame.style.width = '0'
  printFrame.style.height = '0'
  printFrame.style.border = '0'
  printFrame.setAttribute('aria-hidden', 'true')

  document.body.appendChild(printFrame)

  const frameWindow = printFrame.contentWindow
  const frameDocument = printFrame.contentDocument || frameWindow?.document

  if (!frameWindow || !frameDocument) {
    document.body.removeChild(printFrame)
    return
  }

  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()

  const cleanup = () => {
    window.setTimeout(() => {
      if (document.body.contains(printFrame)) {
        document.body.removeChild(printFrame)
      }
    }, 500)
  }

  frameWindow.onafterprint = cleanup

  window.setTimeout(() => {
    frameWindow.focus()
    frameWindow.print()
    cleanup()
  }, 250)
}

  async function handleAddNoteFromEnter() {
  const content = newNoteText.trim()
  if (!content || !activeTask || isOffline) return

  markSaving()

  const { data, error } = await supabase
    .from('task_notes')
    .insert([
      {
        task_id: activeTask.id,
        content,
        completed: false,
        created_by: session?.user?.id || null,
        updated_by: session?.user?.id || null,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error('Σφάλμα προσθήκης σημείωσης:', error)
    setSyncStatus('error')
    return
  }

  markNoteMutation(data.id)

  const now = new Date().toISOString()
  setTaskNotes((prev) => sortNotes([...prev, data]))
  setNoteCountsByTask((prev) => ({
    ...prev,
    [data.task_id]: (prev[data.task_id] || 0) + 1,
  }))
  setNewNoteText('')

  updateTaskEverywhere(activeTask.id, {
    updated_at: now,
    updated_by: session?.user?.id || null,
  })

  await supabase
    .from('tasks')
    .update({ updated_at: now, updated_by: session?.user?.id || null })
    .eq('id', activeTask.id)

  markSynced()
}

  async function handleToggleNoteCompleted(note) {
    if (isOffline) return

    const oldNotes = [...taskNotes]
    const newValue = !note.completed
    const now = new Date().toISOString()

    setTaskNotes(
      sortNotes(taskNotes.map((n) => (n.id === note.id ? { ...n, completed: newValue } : n)))
    )

    if (activeTask?.id) {
      updateTaskEverywhere(activeTask.id, {
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
    }

    markSaving()

    const noteResult = await supabase
      .from('task_notes')
      .update({ completed: newValue, updated_by: session?.user?.id || null })
      .eq('id', note.id)

    if (noteResult.error) {
      console.error('Σφάλμα αλλαγής ολοκλήρωσης σημείωσης:', noteResult.error)
      setTaskNotes(oldNotes)
      setSyncStatus('error')
      return
    }

    if (activeTask?.id) {
      const taskResult = await supabase
        .from('tasks')
        .update({ updated_at: now, updated_by: session?.user?.id || null })
        .eq('id', activeTask.id)

      if (taskResult.error) {
        console.error('Σφάλμα ενημέρωσης task μετά από αλλαγή σημείωσης:', taskResult.error)
      }
    }

    markSynced()
  }

async function handleDeleteNote(noteId, skipConfirm = false) {
  if (isOffline) return
  if (!skipConfirm && !window.confirm('Να διαγραφεί η σημείωση;')) return

  const oldNotes = [...taskNotes]
  const oldNoteCounts = { ...noteCountsByTask }
  const noteToDelete = taskNotes.find((n) => n.id === noteId)
  const now = new Date().toISOString()

  setTaskNotes((prev) => prev.filter((note) => note.id !== noteId))

  if (noteToDelete?.task_id) {
    setNoteCountsByTask((prev) => ({
      ...prev,
      [noteToDelete.task_id]: Math.max(0, (prev[noteToDelete.task_id] || 0) - 1),
    }))
  }

  if (activeTask?.id) {
    updateTaskEverywhere(activeTask.id, {
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
  }

  if (editingNoteIdRef.current === noteId) {
    setEditingNoteId(null)
    setEditingNoteValue('')
  }

  markNoteMutation(noteId)
  markSaving()

  const noteResult = await supabase.from('task_notes').delete().eq('id', noteId)

  if (noteResult.error) {
    console.error('Σφάλμα διαγραφής σημείωσης:', noteResult.error)
    clearNoteMutation(noteId)
    setTaskNotes(oldNotes)
    setNoteCountsByTask(oldNoteCounts)
    setSyncStatus('error')
    return
  }

  if (activeTask?.id) {
    const taskResult = await supabase
      .from('tasks')
      .update({ updated_at: now, updated_by: session?.user?.id || null })
      .eq('id', activeTask.id)

    if (taskResult.error) {
      console.error('Σφάλμα ενημέρωσης task μετά από διαγραφή σημείωσης:', taskResult.error)
    }
  }

  closeContextMenu()
  markSynced()
}

    function handleTaskRightClick(event, task) {
  if (isTouchDevice) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (selectedTasks.length > 1 && selectedTasks.includes(task.id)) {
    setContextMenu({
      type: 'task_multi',
      x: event.clientX,
      y: event.clientY,
    })
    setMoveMenuOpen(false)
    setMultiMoveMenuOpen(false)
    return
  }

  setContextMenu({
    type: 'task',
    x: event.clientX,
    y: event.clientY,
    task,
  })
  setMoveMenuOpen(false)
  setMultiMoveMenuOpen(false)
}

 function handleListRightClick(event, list) {
  event.preventDefault()
  event.stopPropagation()

  if (isMobile && event.pointerType === 'touch') {
    return
  }

  const currentIds = selectedListsRef.current
  const included = currentIds.includes(list.id)
  const effectiveIds = included ? currentIds : [list.id]
  const effectiveLists = lists.filter((item) => effectiveIds.includes(item.id))

  if (!included) {
    setSelectedList(list)
    setSelectedLists([list.id])
    setListSelectionAnchorId(list.id)
  }

  const canBulkManage =
    effectiveLists.length > 0 &&
    effectiveLists.every((item) => item.owner_user_id === session?.user?.id)

  const canBulkLeave =
    effectiveLists.length > 0 &&
    effectiveLists.every((item) => item.owner_user_id !== session?.user?.id)

  setContextMenu({
    type: effectiveLists.length > 1 ? 'list_multi' : 'list',
    x: event.clientX,
    y: event.clientY,
    list,
    lists: effectiveLists,
    canBulkManage,
    canBulkLeave,
  })
  setMoveMenuOpen(false)
  setMultiMoveMenuOpen(false)
}

  function handleNoteRightClick(event, note) {
    event.preventDefault()
    event.stopPropagation()

    setContextMenu({
      type: 'note',
      x: event.clientX,
      y: event.clientY,
      note,
    })
    setMoveMenuOpen(false)
    setMultiMoveMenuOpen(false)
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text)',
          padding: '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '360px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: 'var(--shadow)',
            textAlign: 'center',
          }}
        >
          Φόρτωση...
        </div>
      </div>
    )
  }

  if (!session || authMode === 'update-password') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text)',
          padding: '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '380px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>
            {authMode === 'signin'
  ? 'Σύνδεση'
  : authMode === 'signup'
    ? 'Εγγραφή'
    : authMode === 'reset'
      ? 'Επαναφορά κωδικού'
      : 'Νέος κωδικός'}
          </h2>

<form
            onSubmit={
  authMode === 'signin'
    ? handleSignIn
    : authMode === 'signup'
      ? handleSignUp
      : authMode === 'reset'
        ? handleForgotPassword
        : handleUpdatePassword
}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="task-input"
              autoComplete="email"
            />

            {authMode !== 'reset' && (
  <input
    type="password"
    placeholder={authMode === 'update-password' ? 'Νέος κωδικός' : 'Κωδικός'}
    value={authPassword}
    onChange={(e) => setAuthPassword(e.target.value)}
    className="task-input"
    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
  />
)}

            {authError && (
              <div style={{ color: 'var(--red)', fontSize: '12px', lineHeight: 1.4 }}>
                {authError}
              </div>
            )}

            {authMessage && (
              <div style={{ color: 'var(--green)', fontSize: '12px', lineHeight: 1.4 }}>
                {authMessage}
              </div>
            )}

<button
  type="submit"
  className="add-button"
  disabled={authResetLoading || resetCooldown > 0}
>
  {authMode === 'signin'
    ? 'Σύνδεση'
    : authMode === 'signup'
      ? 'Εγγραφή'
      : authMode === 'reset'
        ? authResetLoading
          ? 'Αποστολή...'
          : resetCooldown > 0
            ? `Ξαναδοκίμασε σε ${resetCooldown}s`
            : 'Στείλε email επαναφοράς'
        : 'Αλλαγή κωδικού'}
</button>
          </form>
{authMode === 'signin' && (
  <button
    type="button"
    className="theme-toggle"
    style={{ marginTop: '8px', width: '100%' }}
    onClick={() => {
      setAuthError('')
      setAuthMessage('')
      setAuthPassword('')
      setAuthMode('reset')
    }}
  >
    Ξέχασες τον κωδικό;
  </button>
)}

{(authMode === 'reset' || authMode === 'update-password') && (
  <button
    type="button"
    className="theme-toggle"
    style={{ marginTop: '8px', width: '100%' }}
    onClick={() => {
      setAuthError('')
      setAuthMessage('')
      setAuthPassword('')
      setAuthMode('signin')
    }}
  >
    Πίσω στη σύνδεση
  </button>
)}

         <button
  type="button"
  className="theme-toggle"
  style={{ marginTop: '12px', width: '100%' }}
  onClick={() => {
    setAuthError('')
    setAuthMessage('')
    setAuthPassword('')
    setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))
  }}
>
  {authMode === 'signin'
    ? 'Δεν έχεις λογαριασμό; Εγγραφή'
    : 'Έχεις ήδη λογαριασμό; Σύνδεση'}
</button>


        </div>
      </div>
    )
  }

  return (
  <>
    {isAdminLogsOpen && isAdminLogsUser && (
      <AdminLogsPanel
  onDownloadTask={downloadAdminLogsCsv}
  search={adminLogsSearch}
  setSearch={setAdminLogsSearch}
  dateFrom={adminLogsDateFrom}
  setDateFrom={setAdminLogsDateFrom}
  dateTo={adminLogsDateTo}
  setDateTo={setAdminLogsDateTo}
  results={adminLogsResults}
  loading={adminLogsLoading}
  error={adminLogsError}
  onClose={() => setIsAdminLogsOpen(false)}
  onDownloadAll={downloadAdminLogsCsv}
  downloading={adminLogsDownloading}
/>
    )}

    <DndContext
        sensors={dndSensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleGlobalDragStart}
        onDragOver={handleGlobalDragOver}
        onDragEnd={handleGlobalDragEnd}
        onDragCancel={handleAnyDragEnd}
      >
      <div
        className={`app ${isResizingSidebar || isResizingDetails ? 'is-resizing' : ''}`}
        ref={appRef}
      >

{isMobile && mobileView !== 'lists' && (
  <button
    type="button"
    className="mobile-floating-back"
    onClick={() => {
      if (mobileView === 'tasks' && selectedTasks.length > 0) {
        setSelectedTasks([])
        setSelectionAnchorId(null)
        return
      }

      if (mobileView === 'details') {
  setSelectedTasks([])
  setSelectionAnchorId(null)

  if (openedTaskFromMobileSearchRef.current) {
    openedTaskFromMobileSearchRef.current = false
    navigateMobile('search')

    requestAnimationFrame(() => {
      const searchScrollArea = document.querySelector('.mobile-search-results')
      if (searchScrollArea) {
        searchScrollArea.scrollTop = mobileSearchScrollTopRef.current
      }
    })

    return
  }

  navigateMobile('tasks')
  return
}

      if (mobileView === 'search') {
        setSelectedList(null)
        setSelectedLists([])
        setListSelectionAnchorId(null)
        navigateMobile('lists')
        return
      }

      setSelectedList(null)
      setSelectedLists([])
      setListSelectionAnchorId(null)
      navigateMobile('lists')
    }}
    aria-label={
      mobileView === 'tasks' && selectedTasks.length > 0
        ? 'Αποεπιλογή εργασιών'
        : 'Back'
    }
    title={
      mobileView === 'tasks' && selectedTasks.length > 0
        ? 'Αποεπιλογή εργασιών'
        : 'Back'
    }
  >
    {mobileView === 'tasks' && selectedTasks.length > 0 ? '×' : '‹'}
  </button>
)}<div
  className={`sidebar ${
  isMobile
    ? `mobile-screen ${
        mobileDirection === 'forward' ? 'mobile-slide-forward' : 'mobile-slide-back'
      }`
    : ''
}`}
  style={
    isMobile
      ? {
          display: mobileView === 'lists' ? 'flex' : 'none',
          width: '100%',
          minWidth: '100%',
        }
      : { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }
  }
>
  <div className="sidebar-fixed-header">
    <div className="sidebar-top">
      <h2>Λίστες</h2>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
  <div style={{ display: 'flex', gap: '6px' }}>
    <button
  className="theme-toggle"
  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
>
  {theme === 'light' ? 'Dark' : 'Light'}
</button>

{isAdminLogsUser && (
  <button
    className="theme-toggle"
    type="button"
   onClick={() => {
  setAdminLogsSearch('')
  setAdminLogsResults([])
  setAdminLogsError('')
  setAdminLogsDateFrom('')
  setAdminLogsDateTo('')
  setIsAdminLogsOpen(true)
}}
  >
    Logs
  </button>
)}

<button className="theme-toggle" onClick={handleSignOut}>
  Έξοδος
</button>
  </div>

</div>

</div>

<div className="sidebar-user-row">
  <div className="sidebar-user-email">
    {session.user.email}
  </div>

  {isMobile && (
    <button
      type="button"
      className="mobile-search-trigger"
      onClick={() => navigateMobile('search')}
    >
      ⌕
    </button>
  )}
</div>  

</div>

  <div className="sidebar-scroll-area">
    <div className={`sync-indicator ${syncStatus}`}>
      <span className="sync-dot" />
      <span>{syncText}</span>
    </div>

    {isOffline && (
      <div
        style={{
          marginBottom: '8px',
          padding: '8px',
          border: '1px solid var(--red)',
          borderRadius: '8px',
          background: 'var(--danger-bg)',
          color: 'var(--text)',
          fontSize: '11px',
          lineHeight: 1.4,
        }}
      >
        Δεν υπάρχει σύνδεση στο internet. Οι αλλαγές δεν αποθηκεύονται μέχρι να επανέλθει η σύνδεση.
      </div>
    )}

    
           {!isMobile && (
  <div className="task-search-box">
    <div className="task-search-wrapper">
      <input
        type="text"
        className="task-search-input"
        placeholder="Αναζήτηση εργασίας σε όλες τις λίστες..."
        value={taskSearch}
        onChange={(e) => setTaskSearch(e.target.value)}
      />
      {taskSearch.trim() !== '' && (
        <button
          className="task-search-clear"
          type="button"
          onClick={() => setTaskSearch('')}
          title="Καθαρισμός αναζήτησης"
        >
          ✕
        </button>
      )}
    </div>
  </div>
)}

            {loadingLists ? (
              <p>Φόρτωση...</p>
            ) : lists.length === 0 ? (
              <p>Δεν βρέθηκαν λίστες.</p>
            ) : (
              <SortableContext
                items={lists.map((list) => getListDndId(list.id))}
                strategy={verticalListSortingStrategy}
              >
                  <div className="list-container">
                    {lists.map((list) => {
                      const showTopLine =
                        dropIndicator &&
                        dropIndicator.targetListId === list.id &&
                        dropIndicator.position === 'top'

                      const showBottomLine =
                        dropIndicator &&
                        dropIndicator.targetListId === list.id &&
                        dropIndicator.position === 'bottom'

                      const isSameList =
  String(activeDraggedTask?.list_id) === String(list.id)

const taskDropActive =
  !isSameList &&
  (
    taskDropListId === list.id ||
    String(hoveredTaskListId) === String(list.id)
  )
                      const incompleteCount = incompleteCountByList[list.id] || 0
                      const completedCount = completedCountByList[list.id] || 0

                      return (
                        <TaskListDropZone
                          key={list.id}
                          listId={list.id}
                          disabled={isOffline}
                          className={`list-drop-wrapper ${showTopLine ? 'drop-top' : ''} ${showBottomLine ? 'drop-bottom' : ''}`}
                          forceActive={taskDropActive}
                        >
                          <div
                            onDragOver={(event) => handleListDragOver(event, list.id)}
                            onDrop={(event) => {
                              event.preventDefault()
                              handleListDrop(list.id)
                            }}
                          >
                            <SortableListItem
                              list={list}
                              isActive={selectedLists.includes(list.id)}
                              isDraggingNative={draggedListId === list.id}
                              incompleteCount={incompleteCount}
                              completedCount={completedCount}
                              onClick={(event) => handleListClick(list, event)}
                              onContextMenu={(event) => handleListRightClick(event, list)}
                            />
                          </div>
                        </TaskListDropZone>
                      )
                    })}
                  </div>
              </SortableContext>
            )}
          </div>

          <form className="add-list-form add-list-form-bottom" onSubmit={handleAddList}>
            <input
              type="text"
              placeholder="Νέα λίστα..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="list-input"
              disabled={isOffline}
            />
            <button type="submit" className="add-list-button" disabled={isOffline}>
              +
            </button>
          </form>
        </div>

        

        <div
          className="column-resizer left"
          style={isMobile ? { display: 'none' } : undefined}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsResizingSidebar(true)
          }}
          title="Αλλαγή πλάτους αριστερής στήλης"
        />

        <div
  ref={mainRef}
  className={`main ${activeTask ? 'with-details' : ''} ${
  isMobile
    ? `mobile-screen ${
        mobileDirection === 'forward' ? 'mobile-slide-forward' : 'mobile-slide-back'
      }`
    : ''
}`}
style={
  isMobile
    ? {
        display: mobileView === 'tasks' || mobileView === 'search' ? 'flex' : 'none',
        width: '100%',
      }
    : undefined
}
          tabIndex={0}
          onMouseDown={(e) => {
            const tagName = e.target?.tagName
            const isInputLike =
              tagName === 'INPUT' ||
              tagName === 'TEXTAREA' ||
              tagName === 'SELECT' ||
              tagName === 'BUTTON'

            if (!isInputLike) {
              mainRef.current?.focus()
            }
          }}
        >
          {loadingLists ? (
  <div style={{ padding: 16 }}>
    <div className="skeleton" style={{ height: 24, marginBottom: 12 }} />
    <div className="skeleton" style={{ height: 20, marginBottom: 10 }} />
    <div className="skeleton" style={{ height: 20, marginBottom: 10 }} />
    <div className="skeleton" style={{ height: 20, marginBottom: 10 }} />
  </div>
) : invitesLoading ? (
  null
) : groupedPendingInvites.length > 0 ? (
            <div className="invites-banner">
              <h3>Προσκλήσεις σε λίστες</h3>
              {groupedPendingInvites.map((group) => {
                const inviteIds = group.invites.map((invite) => invite.id)
                const loadingKey = inviteIds.join(',')
                const isLoading = inviteActionLoading === loadingKey

                return (
                  <div key={group.key} className="invite-item">
                    <span>
                      {group.listNames.length === 1 ? (
                        <>
                          Έχεις εκκρεμή πρόσκληση για λίστα{' '}
                          <strong>{group.listNames[0]}</strong>
                        </>
                      ) : (
                        <>
                          Έχεις εκκρεμή πρόσκληση για λίστες{' '}
                          <strong>{group.listNames.join(', ')}</strong>
                        </>
                      )}
                    </span>
                    <div className="invite-actions">
                      <button
                        type="button"
                        onClick={() => handleAcceptInvite(inviteIds)}
                        disabled={isLoading || isOffline}
                      >
                        {isLoading ? 'Αποδοχή...' : 'Αποδοχή'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleRejectInvite(inviteIds)}
                        disabled={isLoading || isOffline}
                      >
                        Απόρριψη
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}


{isMobile && mobileView === 'search' ? (
  <>
    <div className="main-fixed-header mobile-search-fixed-header">
      <div className="mobile-search-screen">
        <div className="task-search-box mobile-search-box">
          <div className="task-search-wrapper">
            <input
              type="text"
              className="task-search-input mobile-search-input"
              placeholder="Αναζήτηση"
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              autoFocus
            />
            {taskSearch.trim() !== '' && (
              <button
                className="task-search-clear"
                type="button"
                onClick={() => setTaskSearch('')}
                title="Καθαρισμός αναζήτησης"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="mobile-search-header-text">
          Πληκτρολογήστε για αναζήτηση στις Εργασίες.
        </div>
      </div>
    </div>

    <div className="main-scroll-area mobile-search-results">
  {taskSearch.trim() === '' ? null : visibleTasks.length === 0 ? (
    <div className="mobile-search-empty-state">
      Δεν βρέθηκαν εργασίες.
    </div>
  ) : (
    <div className="task-container">
      {visibleTasks.map((task) => (
 <SortableTaskItem
  key={`search-task-${task.id}`}
  task={task}
  isActive={activeTask?.id === task.id}
  isSelected={selectedTasks.includes(task.id)}
  isOffline={isOffline}
  isSearchMode={true}
  isTouchDevice={isTouchDevice}
  onClick={(event) => handleTaskClick(task, event)}
  onContextMenu={(event) => handleTaskRightClick(event, task)}
  onToggleCompleted={handleToggleCompleted}
  onToggleStore={handleToggleStore}
  onToggleSkroutz={handleToggleSkroutz}
  onToggleWeighing={handleToggleWeighing}
  onDeleteSwipe={handleDeleteOneTask}
  onMobileLongPress={handleTaskLongPress}
/>
      ))}
    </div>
  )}
</div>
  </>
) : selectedList ? (
  <>

    <div className="main-fixed-header">
  <div
    className="main-header"
    style={{ paddingLeft: isMobile && mobileView !== 'lists' ? '56px' : '0px' }}
  >
        {editingListName ? (
          <input
            className="list-title-input"
            value={editingListValue}
            onChange={(e) => setEditingListValue(e.target.value)}
            onBlur={async () => {
              await handleRenameList(selectedList, editingListValue)
              setEditingListName(false)
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                await handleRenameList(selectedList, editingListValue)
                setEditingListName(false)
              }
              if (e.key === 'Escape') {
                setEditingListName(false)
                setEditingListValue(selectedList.name)
              }
            }}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
                ) : (
          <div className="main-title-row">
  <div className="main-title-text-block">
  <h1
  className="editable-title"
  onClick={() => {
    if (selectedList.owner_user_id !== session?.user?.id) return

    setEditingListValue(selectedList.name)

    if (isMobile) {
      setIsMobileListNameModalOpen(true)
      return
    }

    setEditingListName(true)
  }}
  title={
    selectedList.owner_user_id === session?.user?.id
      ? 'Κλικ για μετονομασία'
      : 'Κοινόχρηστη λίστα'
  }
>
  {selectedList.name}
</h1>

  {currentSortMode !== 'manual' && (
    <button
      type="button"
      className="list-sort-summary"
      onClick={() =>
        updateCurrentListSort({
          direction: currentSortDirection === 'asc' ? 'desc' : 'asc',
        })
      }
    >
      {currentSortMode === 'created' &&
        `Ταξινόμηση με σειρά καταχώρησης ${currentSortDirection === 'asc' ? '↑' : '↓'}`}

      {currentSortMode === 'alpha' &&
        `Ταξινόμηση αλφαβητικά ${currentSortDirection === 'asc' ? '↑' : '↓'}`}
    </button>
  )}

</div>

{isMobile && (
  <div className="task-actions-menu-wrap">
    <button
      type="button"
      className="task-actions-trigger"
      onClick={() => {
        setIsTaskActionsMenuOpen((prev) => {
          const next = !prev
          if (!next) {
            setIsMobileTaskMoveMenuOpen(false)
          }
          return next
        })
      }}
      aria-label="Ενέργειες εργασιών"
      aria-expanded={isTaskActionsMenuOpen}
    >
      ⋮
    </button>

    {isTaskActionsMenuOpen && (
  <div className="task-actions-dropdown">
    {isMobileTaskMoveMenuOpen ? (
      <div className="task-actions-section">
        <button
          type="button"
          className="task-actions-menu-button"
          onClick={() => {
            setIsMobileTaskMoveMenuOpen(false)
          }}
        >
          ← Πίσω
        </button>

        <div className="task-actions-submenu">
          {lists
            .filter((list) => String(list.id) !== String(selectedList?.id))
            .map((list) => (
              <button
                key={list.id}
                type="button"
                className="task-actions-menu-button"
                onClick={async () => {
                  await handleMoveSelectedTasksToList(list)
                  setIsMobileTaskMoveMenuOpen(false)
                  setIsTaskActionsMenuOpen(false)
                }}
              >
                {list.name}
              </button>
            ))}
        </div>
      </div>
    ) : (
      <>
        {selectedTasks.length > 0 && (
          <div className="task-actions-section">
            <button
              type="button"
              className="task-actions-menu-button"
              onClick={() => {
                setIsMobileTaskMoveMenuOpen(true)
              }}
            >
              Μετακίνηση σε Λίστα
            </button>
          </div>
        )}

{canBulkComplete && (
  <div className="task-actions-section">
    <button
      type="button"
      className="task-actions-menu-button"
      onClick={async () => {
        await handleCompleteSelectedTasks()
      }}
    >
      Ολοκλήρωση {selectedTasks.length} εργασιών
    </button>
  </div>
)}

{canBulkUncomplete && (
  <div className="task-actions-section">
    <button
      type="button"
      className="task-actions-menu-button"
      onClick={async () => {
        await handleUncompleteSelectedTasks()
      }}
    >
      Άρση Ολοκλήρωσης {selectedTasks.length} εργασιών
    </button>
  </div>
)}
        <div className="task-actions-section">
          <button
            type="button"
            className="task-actions-menu-button"
            onClick={() => {
              setIsTaskActionsMenuOpen(false)
              setIsMobileSortMenuOpen(true)
            }}
          >
            Ταξινόμηση
          </button>
        </div>

        <div className="task-actions-section">
          <button
            type="button"
            className="task-actions-menu-button"
            onClick={() => {
              setIsTaskActionsMenuOpen(false)
              handlePrintTasks()
            }}
          >
            Εκτύπωση
          </button>
        </div>

        {selectedTasks.length > 0 && (
          <div className="task-actions-section">
            <button
              type="button"
              className="task-actions-menu-button danger"
              onClick={async () => {
                await handleDeleteSelected()
                setIsMobileTaskMoveMenuOpen(false)
                setIsTaskActionsMenuOpen(false)
              }}
            >
              {selectedTasks.length === 1 ? 'Διαγραφή εργασίας' : 'Διαγραφή εργασιών'}
            </button>
          </div>
        )}
      </>
    )}
  </div>
)}
  </div>
)}

{isMobileSortMenuOpen && (
  <div
    className="mobile-sort-popup-backdrop"
    onClick={() => setIsMobileSortMenuOpen(false)}
  >
    <div
      className="mobile-sort-popup"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mobile-sort-popup-title">Ταξινόμηση</div>

      <button
        type="button"
        className="task-actions-menu-button mobile-sort-option"
        onClick={() => {
          updateCurrentListSort({ mode: 'created' })
          setIsMobileSortMenuOpen(false)
        }}
      >
        <span>Σειρά καταχώρησης</span>
        <span className="mobile-sort-check">
          {currentSortMode === 'created' ? '✓' : ''}
        </span>
      </button>

      <button
        type="button"
        className="task-actions-menu-button mobile-sort-option"
        onClick={() => {
          updateCurrentListSort({ mode: 'alpha' })
          setIsMobileSortMenuOpen(false)
        }}
      >
        <span>Αλφαβητική</span>
        <span className="mobile-sort-check">
          {currentSortMode === 'alpha' ? '✓' : ''}
        </span>
      </button>

      <button
        type="button"
        className="task-actions-menu-button mobile-sort-option"
        onClick={() => {
          updateCurrentListSort({ mode: 'manual' })
          setIsMobileSortMenuOpen(false)
        }}
      >
        <span>Χειροκίνητη</span>
        <span className="mobile-sort-check">
          {currentSortMode === 'manual' ? '✓' : ''}
        </span>
      </button>
    </div>
  </div>
)}        
</div>
      )}

        <div className="main-actions">
  {!isMobile && (
    <div className="task-sort-box">
      <label htmlFor="sortMode">Ταξινόμηση</label>

      <select
        id="sortMode"
        value={currentSortMode}
        onChange={(e) => updateCurrentListSort({ mode: e.target.value })}
      >
        <option value="created">Σειρά καταχώρησης</option>
        <option value="alpha">Αλφαβητική</option>
        <option value="manual">Χειροκίνητη</option>
      </select>
    </div>
  )}



{!isMobile && (
  <button className="print-button" onClick={handlePrintTasks}>
    Εκτύπωση
  </button>
)}
</div>
      </div>
    </div>

    <div className="main-scroll-area">
      {loadingTasks ? (
  <div className="task-container">
    {[1, 2].map((item) => (
      <div className="skeleton-card" key={item}>
        <div className="skeleton-circle"></div>
        <div className="skeleton-text-group">
        <div className="skeleton-line full"></div>
</div>
      </div>
    ))}
  </div>
) : visibleTasks.length === 0 ? (
        <p>
          {taskSearch.trim()
            ? 'Δεν βρέθηκε αυτό που ψάχνεις'
            : 'Δεν υπάρχουν εργασίες σε αυτή τη λίστα.'}
        </p>
      ) : (
        <SortableContext
          items={visibleTasks.map((task) => getTaskDndId(task.id))}
          strategy={verticalListSortingStrategy}
        >
          <div className="task-container">
            {visibleTasks.map((task, index) => {
  const previousTask = visibleTasks[index - 1]
  const shouldShowCompletedDivider =
    task.completed &&
    (index === 0 || !previousTask?.completed)

  return (
  <div key={`task-row-${task.id}`}>
      {shouldShowCompletedDivider && (
        <button
          type="button"
          className="completed-divider completed-divider-button"
          onClick={() => setShowCompletedTasks((prev) => !prev)}
        >
          <>
  <span className={`arrow ${showCompletedTasks ? 'open' : ''}`}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
  Ολοκληρωμένες
</>
        </button>
      )}

      {(!task.completed || showCompletedTasks) && (
        <SortableTaskItem
  task={task}
  isActive={activeTask?.id === task.id}
  isSelected={selectedTasks.includes(task.id)}
  isOffline={isOffline}
  isSearchMode={Boolean(taskSearch.trim())}
  isTouchDevice={isTouchDevice}
  onClick={(event) => handleTaskClick(task, event)}
  onContextMenu={(event) => handleTaskRightClick(event, task)}
  onToggleCompleted={handleToggleCompleted}
  onToggleStore={handleToggleStore}
  onToggleSkroutz={handleToggleSkroutz}
  onToggleWeighing={handleToggleWeighing}
  onDeleteSwipe={handleDeleteOneTask}
  onMobileLongPress={handleTaskLongPress}
/>
      )}
    </div>
  )
})}
          </div>
        </SortableContext>
      )}
    </div>

    <div className="add-task-form-bottom">
      <form className="add-task-form" onSubmit={handleAddTask}>
        <input
          type="text"
          placeholder="Γράψε νέα εργασία..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onPaste={handleTaskPaste}
          className="task-input"
          disabled={isOffline}
        />
        <button type="submit" className="add-button" disabled={isOffline}>
           +
        </button>
      </form>
    </div>
  </>
) : loadingLists ? (
  <div style={{ padding: 16 }}>
    <div className="skeleton" style={{ height: 20, marginBottom: 10 }} />
    <div className="skeleton" style={{ height: 20, marginBottom: 10 }} />
    <div className="skeleton" style={{ height: 20, marginBottom: 10 }} />
  </div>
) : (
  <p>Διάλεξε ή δημιούργησε μια λίστα.</p>
)}

        </div>

        {activeTask && !isMobile && (
          <div
            className="column-resizer right"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsResizingDetails(true)
            }}
            title="Αλλαγή πλάτους δεξιάς στήλης"
          />
        )}

        <div
  className={`details-drawer ${activeTask ? 'open' : ''} ${
  isMobile
    ? `mobile-screen ${
        mobileDirection === 'forward' ? 'mobile-slide-forward' : 'mobile-slide-back'
      }`
    : ''
}`}

style={
  activeTask
    ? isMobile
      ? {
          display: mobileView === 'details' ? 'flex' : 'none',
          width: '100%',
          minWidth: '100%',
        }
      : { width: `${detailsWidth}px`, minWidth: `${detailsWidth}px` }
    : isMobile
      ? { display: 'none' }
      : undefined
}
        >

{activeTask && (
  <>
    <div className="details-panel">
  <div
    className="details-panel-header"
    style={{ paddingLeft: isMobile && mobileView !== 'lists' ? '56px' : '0px' }}
  >
{!editingTaskTitle ? (
  isMobile ? (
    <div
      className="mobile-task-title-readonly"
      onMouseDown={(e) => {
        e.stopPropagation()
      }}
      onTouchStart={(e) => {
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
        setEditingTaskTitle(true)
        setEditingTaskValue(activeTask.title)
      }}
      title="Κλικ για μετονομασία"
    >
      {activeTask.title}
    </div>
  ) : (
    <div
      className="details-task-title-readonly-web"
      onMouseDown={(e) => {
        e.stopPropagation()
        setEditingTaskTitle(true)
        setEditingTaskValue(activeTask.title)
      }}
      onClick={(e) => e.stopPropagation()}
      title="Κλικ για μετονομασία"
    >
      {activeTask.title}
    </div>
  )
) : isMobile ? (
  <div
    className="mobile-task-title-editor"
    contentEditable
    suppressContentEditableWarning
    onMouseDown={(e) => {
      e.stopPropagation()
    }}
    onClick={(e) => e.stopPropagation()}
    onInput={(e) => {
      setEditingTaskValue(e.currentTarget.textContent || '')
    }}
    onBlur={async (e) => {
      const nextValue = e.currentTarget.textContent || ''
      setEditingTaskValue(nextValue)
      await handleRenameTask(activeTask, nextValue)
    }}
    onKeyDown={async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const nextValue = e.currentTarget.textContent || ''
        setEditingTaskValue(nextValue)
        await handleRenameTask(activeTask, nextValue)
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        setEditingTaskTitle(false)
        setEditingTaskValue(activeTask.title)
      }
    }}
    ref={(el) => {
      if (!el) return
      if (el.textContent !== editingTaskValue) {
        el.textContent = editingTaskValue
      }

      requestAnimationFrame(() => {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      })
    }}
    title="Κλικ για μετονομασία"
  />
) : (
  <textarea
    className="details-task-title-input"
    value={editingTaskValue}
    readOnly={false}
    rows={1}
    onMouseDown={(e) => {
      e.stopPropagation()
    }}
    onClick={(e) => e.stopPropagation()}
    onFocus={(e) => {
      autoResizeTextarea(e.target)
    }}
    onInput={(e) => {
      setEditingTaskValue(e.target.value)
      autoResizeTextarea(e.target)
    }}
    onBlur={async (e) => {
      autoResizeTextarea(e.target)
      await handleRenameTask(activeTask, editingTaskValue)
    }}
    onKeyDown={async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        await handleRenameTask(activeTask, editingTaskValue)
      }
      if (e.key === 'Escape') {
        setEditingTaskTitle(false)
        setEditingTaskValue(activeTask.title)
      }
    }}
    ref={(el) => {
      if (el) autoResizeTextarea(el)
    }}
    title="Κλικ για μετονομασία"
  />
)}
        <div className="details-controls">
          <button
            className="details-close"
            onClick={() => {
              setActiveTask(null)
              setTaskNotes([])
              setEditingTaskTitle(false)
              setEditingNoteId(null)
              setEditingNoteValue('')
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <textarea
        className="note-input"
        placeholder="Γράψε σημείωση και πάτα Enter..."
        value={newNoteText}
        rows={1}
        onChange={(e) => {
          setNewNoteText(e.target.value)
          autoResizeTextarea(e.target)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleAddNoteFromEnter()
          }
        }}
        onFocus={(e) => autoResizeTextarea(e.target)}
        ref={(el) => {
          if (el) autoResizeTextarea(el)
        }}
        disabled={isOffline}
      />

<div className="notes-list">
  {notesLoading ? (
  <div className="skeleton-block">
    <div className="skeleton-note">
      <div className="skeleton-line full"></div>
    </div>
    <div className="skeleton-note">
      <div className="skeleton-line medium"></div>
    </div>
    <div className="skeleton-note">
      <div className="skeleton-line short"></div>
    </div>
  </div>
) : taskNotes.length === 0 ? (

    <p className="notes-empty">Δεν υπάρχουν σημειώσεις ακόμη.</p>
  ) : (
    taskNotes.map((note) => (
      <SwipeableNoteItem
        note={note}
        isOffline={isOffline}
        isMobile={isMobile}
        isTouchDevice={isTouchDevice}
        isEditing={editingNoteId === note.id}
        editingValue={editingNoteValue}
        onStartEdit={(selectedNote) => {
          if (editingNoteId !== selectedNote.id) {
            setEditingNoteId(selectedNote.id)
            setEditingNoteValue(selectedNote.content)
          }
        }}
        onContextMenu={handleNoteRightClick}
        onToggleCompleted={handleToggleNoteCompleted}
        onChangeEditingValue={setEditingNoteValue}
        onCommitInlineEdit={handleInlineRenameNote}
        onCancelInlineEdit={clearEditingNoteIfStillSame}
        onDeleteSwipe={handleDeleteNote}
      />
    ))
  )}
</div>
    </div>

    <div className="details-bottom-area">
      <div className="task-updated-box">
        <span className="task-updated-label">Τελευταία αλλαγή</span>
        <span className="task-updated-value">
          {formatDateTime(activeTask.updated_at)}
          {lastEditorEmail ? ` • από ${lastEditorEmail}` : ''}
        </span>
      </div>
    </div>
  </>
)}
        </div>

        {contextMenu && contextMenu.type === 'task' && (
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={getContextMenuPosition()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="has-submenu submenu-host"
              onMouseEnter={() => setMoveMenuOpen(true)}
              onMouseLeave={() => setMoveMenuOpen(false)}
            >
              <button className="context-menu-item">
                <span>Μετακίνηση σε λίστα</span>
                <span className="submenu-arrow">▶</span>
              </button>

              {moveMenuOpen && (
                <div
                  className="submenu submenu-fullscreen submenu-large"
                  style={getFullscreenSubmenuPosition()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {lists
                    .filter((list) => list.id !== contextMenu.task.list_id)
                    .map((list) => (
                      <button
                        key={list.id}
                        className="context-menu-item submenu-list-item"
                        onClick={() => handleMoveTaskToList(contextMenu.task, list)}
                      >
                        <span>{list.name}</span>
                        {(incompleteCountByList[list.id] || 0) > 0 && (
                          <span className="submenu-list-count">
                            {incompleteCountByList[list.id] || 0}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <button
              className="context-menu-item"
              onClick={async () => {
                closeContextMenu()
                const nextTitle = window.prompt('Νέο όνομα εργασίας', contextMenu.task.title)
                if (nextTitle !== null) {
                  await handleRenameTask(contextMenu.task, nextTitle)
                }
              }}
            >
              Μετονομασία εργασίας
            </button>

            <button
              className="context-menu-item danger"
              onClick={() => handleDeleteOneTask(contextMenu.task.id)}
            >
              Διαγραφή εργασίας
            </button>
          </div>
        )}

        {contextMenu && contextMenu.type === 'task_multi' && (
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={getContextMenuPosition()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="has-submenu submenu-host"
              onMouseEnter={() => setMultiMoveMenuOpen(true)}
              onMouseLeave={() => setMultiMoveMenuOpen(false)}
            >
              <button className="context-menu-item">
                <span>Μετακίνηση σε λίστα</span>
                <span className="submenu-arrow">▶</span>
              </button>

              {multiMoveMenuOpen && (
                <div
                  className="submenu submenu-fullscreen submenu-large"
                  style={getFullscreenSubmenuPosition()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      className="context-menu-item submenu-list-item"
                      onClick={() => handleMoveSelectedTasksToList(list)}
                    >
                      <span>{list.name}</span>
                      {(incompleteCountByList[list.id] || 0) > 0 && (
                        <span className="submenu-list-count">
                          {incompleteCountByList[list.id] || 0}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
{canBulkComplete && (
  <button
    className="context-menu-item"
    onClick={handleCompleteSelectedTasks}
  >
    Ολοκλήρωση {selectedTasks.length} εργασιών
  </button>
)}
{canBulkUncomplete && (
  <button
    className="context-menu-item"
    onClick={handleUncompleteSelectedTasks}
  >
    Άρση Ολοκλήρωσης {selectedTasks.length} εργασιών
  </button>
)}
            <button className="context-menu-item danger" onClick={handleDeleteSelected}>
              {selectedTasks.length === 1 ? 'Διαγραφή εργασίας' : 'Διαγραφή εργασιών'}
            </button>
          </div>
        )}

        {contextMenu && contextMenu.type === 'list' && (
  <div
    className="context-menu"
    style={getContextMenuPosition()}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      className="context-menu-item"
      onClick={() => openShareModal(contextMenu.list)}
    >
      Κοινή χρήση
    </button>

    {contextMenu.list.owner_user_id === session?.user?.id ? (
      <>
        <button
          className="context-menu-item"
          onClick={async () => {
            closeContextMenu()
            const nextName = window.prompt('Νέο όνομα λίστας', contextMenu.list.name)
            if (nextName !== null) {
              await handleRenameList(contextMenu.list, nextName)
            }
          }}
        >
          Μετονομασία λίστας
        </button>

        <button
          className="context-menu-item danger"
          onClick={() => handleDeleteList(contextMenu.list)}
        >
          Διαγραφή λίστας
        </button>
      </>
    ) : (
      <button
        className="context-menu-item danger"
        onClick={() => handleLeaveList(contextMenu.list)}
      >
        Αποχώρηση από τη λίστα
      </button>
    )}
  </div>
)}

        {contextMenu && contextMenu.type === 'list_multi' && (
          <div
            className="context-menu"
            style={getContextMenuPosition()}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.canBulkManage ? (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => openMultiShareModal(contextMenu.lists)}
                >
                  Κοινή χρήση λιστών
                </button>

                <button
                  className="context-menu-item danger"
                  onClick={() => handleDeleteSelectedLists(contextMenu.lists)}
                >
                  Διαγραφή λιστών
                </button>
              </>
            ) : contextMenu.canBulkLeave ? (
              <button
                className="context-menu-item danger"
                onClick={() => handleLeaveSelectedLists(contextMenu.lists)}
              >
                Αποχώρηση από λίστες
              </button>
            ) : (
              <div className="context-menu-item" style={{ cursor: 'default', opacity: 0.7 }}>
                Η μαζική διαχείριση είναι διαθέσιμη μόνο όταν όλες οι επιλεγμένες λίστες είναι είτε δικές σου είτε κοινόχρηστες προς εσένα.
              </div>
            )}
          </div>
        )}

        {contextMenu && contextMenu.type === 'note' && (
          <div
            className="context-menu"
            style={getContextMenuPosition()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="context-menu-item"
              onClick={async () => {
                closeContextMenu()
                setTimeout(async () => {
                  const nextContent = window.prompt(
                    'Νέο κείμενο σημείωσης',
                    contextMenu.note.content
                  )
                  if (nextContent !== null) {
                    await handleRenameNote(contextMenu.note, nextContent)
                  }
                }, 10)
              }}
            >
              Μετονομασία σημείωσης
            </button>

            <button
              className="context-menu-item danger"
              onClick={() => handleDeleteNote(contextMenu.note.id)}
            >
              Διαγραφή
            </button>
          </div>
        )}
      </div>

      {shareModalList && (
        <div
          onClick={closeShareModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              boxShadow: 'var(--shadow)',
              padding: '18px',
              color: 'var(--text)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {shareModalList.isMulti ? 'Κοινή χρήση λιστών' : 'Κοινή χρήση λίστας'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginTop: '4px' }}>
                  {shareModalList.isMulti
                    ? (shareModalList.displayNames || []).join(', ')
                    : shareModalList.name}
                </div>
              </div>

              <button className="details-close" onClick={closeShareModal}>
                ✕
              </button>
            </div>

            {shareModalList.owner_user_id === session?.user?.id ? (
              <form
                onSubmit={handleInviteToList}
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <input
                  type="email"
                  placeholder={shareModalList.isMulti ? 'Email χρήστη για invite σε όλες τις επιλεγμένες λίστες...' : 'Email χρήστη για invite...'}
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  className="task-input"
                  disabled={shareSubmitting || isOffline}
                />

                <button
                  type="submit"
                  className="add-button"
                  disabled={shareSubmitting || isOffline}
                >
                  {shareSubmitting ? 'Αποστολή...' : 'Αποστολή invite'}
                </button>
              </form>
            ) : (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-soft)',
                  lineHeight: 1.5,
                }}
              >
                Μπορείς να δεις ποιος είναι ο ιδιοκτήτης και ποιοι έχουν πρόσβαση στη λίστα.
              </div>
            )}

            {shareError && (
              <div
                style={{
                  marginTop: '10px',
                  color: 'var(--red)',
                  fontSize: '12px',
                  lineHeight: 1.4,
                }}
              >
                {shareError}
              </div>
            )}

            {shareMessage && (
              <div
                style={{
                  marginTop: '10px',
                  color: 'var(--green)',
                  fontSize: '12px',
                  lineHeight: 1.4,
                }}
              >
                {shareMessage}
              </div>
            )}

            {!shareModalList.isMulti && (
              <>
                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '8px',
                    }}
                  >
                    Ιδιοκτήτης
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      background: 'var(--panel-soft)',
                      fontSize: '12px',
                    }}
                  >
                    {shareOwnerEmail || '—'}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '8px',
                    }}
                  >
                    Διαμοιραζόμενοι χρήστες
                  </div>

                  {shareLoading ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>Φόρτωση...</div>
                  ) : shareMembers.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>
                      Δεν υπάρχουν ακόμη διαμοιραζόμενοι χρήστες.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {shareMembers.map((member) => (
                        <div
                          key={member.user_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '10px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            background: 'var(--panel-soft)',
                            fontSize: '12px',
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              flex: 1,
                            }}
                          >
                            <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{member.email}</span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-soft)',
                              }}
                            >
                              {member.role}
                            </span>
                          </div>

                          {shareModalList.owner_user_id === session?.user?.id && (
                            <button
                              type="button"
                              className="theme-toggle"
                              onClick={() => handleRemoveSharedUser(member)}
                              disabled={shareRemovingUserId === member.user_id || isOffline}
                              style={{
                                flexShrink: 0,
                                padding: '6px 10px',
                              }}
                            >
                              {shareRemovingUserId === member.user_id ? 'Αφαίρεση...' : 'Αφαίρεση'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

            <DragOverlay zIndex={9999}>
        {activeDraggedTask ? (
          <div
            className={`task-item ${isMobile ? 'mobile-drag-overlay' : ''}`}
            style={{
              pointerEvents: 'none',
              boxShadow: 'var(--shadow)',
              opacity: 0.98,
              transform: isMobile ? 'scale(1.03)' : 'scale(1)',
            }}
          >
                                    <span
              className={`round-checkbox task-select-indicator ${activeDraggedTask.completed ? 'is-completed' : ''} ${
                isMobile && selectedTasks.some((id) => String(id) === String(activeDraggedTask.id))
                  ? 'is-selected'
                  : ''
              }`}
              aria-hidden="true"
            />

            <div className="task-text-block">
              <span className={`task-title ${activeDraggedTask.completed ? 'completed' : ''}`}>
                {activeDraggedTask.title}
              </span>

              {(noteCountsByTask[activeDraggedTask.id] || 0) > 0 && (
                <span className="task-notes-count">
                  <span className="task-notes-icon">📝</span>
                  <span>{noteCountsByTask[activeDraggedTask.id] || 0}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              className={`weight-toggle ${activeDraggedTask.needs_weighing ? 'on' : ''}`}
              aria-hidden="true"
              tabIndex={-1}
            >
              ⚖
            </button>
          </div>
        ) : activeDraggedList ? (
          <div
  className={`list-button ${isMobile ? 'mobile-drag-overlay' : ''}`}
  style={{
    pointerEvents: 'none',
    boxShadow: 'var(--shadow)',
    opacity: 0.98,
    transform: isMobile ? 'scale(1.03)' : 'scale(1)',
  }}
>
            <span className="list-button-left">
              <span className="list-grip">≡</span>
              <span className="list-name-text">{activeDraggedList.name}</span>
            </span>

            <div className="list-count-group">
              {(incompleteCountByList[activeDraggedList.id] || 0) > 0 && (
                <span className="list-count-badge incomplete">
                  {incompleteCountByList[activeDraggedList.id] || 0}
                </span>
              )}

              {(completedCountByList[activeDraggedList.id] || 0) > 0 && (
                <span className="list-count-badge completed">
                  {completedCountByList[activeDraggedList.id] || 0}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
    </>
  )
}

export default App