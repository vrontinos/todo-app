import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

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
  const [selectedListIds, setSelectedListIds] = useState([])
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
  const [listSortSettings, setListSortSettings] = useState({})

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
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingNoteValue, setEditingNoteValue] = useState('')
  const [lastEditorEmail, setLastEditorEmail] = useState('')

  const [contextMenu, setContextMenu] = useState(null)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [multiMoveMenuOpen, setMultiMoveMenuOpen] = useState(false)

  const [shareModalList, setShareModalList] = useState(null)
  const [shareModalLists, setShareModalLists] = useState([])
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

  const appRef = useRef(null)
  const mainRef = useRef(null)
  const editingNoteIdRef = useRef(null)
  const activeTaskRef = useRef(null)
  const selectedListRef = useRef(null)
  const contextMenuRef = useRef(null)

  const currentSortMode =
    selectedList && listSortSettings[selectedList.id]?.mode
      ? listSortSettings[selectedList.id].mode
      : 'created'

  const currentSortDirection =
    selectedList && listSortSettings[selectedList.id]?.direction
      ? listSortSettings[selectedList.id].direction
      : 'asc'

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
    const saved = localStorage.getItem('listSortSettings')
    if (saved) {
      try {
        setListSortSettings(JSON.parse(saved))
      } catch {
        setListSortSettings({})
      }
    }
  }, [])

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      setAuthError('')
      setAuthMessage('')
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
          fetchTasks(currentSelectedList.id, false)
        }

        if (currentActiveTask?.id && editingNoteIdRef.current === null) {
          fetchNotes(currentActiveTask.id, false)
        }
      }
    }

    function handleOffline() {
      setIsOffline(true)
      if (session?.user?.id) {
        setSyncStatus('error')
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
      setTasks([])
      setAllTasks([])
      setSelectedListIds([])
      setListSelectionAnchorId(null)
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
  }, [session])

  useEffect(() => {
    setTasks((prev) => sortTasks(prev, currentSortMode, currentSortDirection))
  }, [selectedList, listSortSettings])

  useEffect(() => {
    if (!session?.user?.id) return

    const channel = supabase
      .channel(`live-sync-all-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists' },
        async () => {
          const currentSelectedList = selectedListRef.current
          const currentActiveTask = activeTaskRef.current
          const isEditingNote = editingNoteIdRef.current !== null

          setSyncStatus('syncing')

          await fetchLists(false)
          await fetchAllTasks(false)
          await fetchTaskNoteCounts(false)

          if (currentSelectedList?.id) {
            await fetchTasks(currentSelectedList.id, false)
          }

          if (currentActiveTask?.id && !isEditingNote) {
            await fetchNotes(currentActiveTask.id, false)
          }

          setSyncStatus('synced')
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        async () => {
          const currentSelectedList = selectedListRef.current
          const currentActiveTask = activeTaskRef.current
          const isEditingNote = editingNoteIdRef.current !== null

          setSyncStatus('syncing')

          await fetchLists(false)
          await fetchAllTasks(false)
          await fetchTaskNoteCounts(false)

          if (currentSelectedList?.id) {
            await fetchTasks(currentSelectedList.id, false)
          }

          if (currentActiveTask?.id && !isEditingNote) {
            await fetchNotes(currentActiveTask.id, false)
          }

          setSyncStatus('synced')
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_notes' },
        async () => {
          const currentSelectedList = selectedListRef.current
          const currentActiveTask = activeTaskRef.current
          const isEditingNote = editingNoteIdRef.current !== null

          setSyncStatus('syncing')

          await fetchLists(false)
          await fetchAllTasks(false)
          await fetchTaskNoteCounts(false)

          if (currentSelectedList?.id) {
            await fetchTasks(currentSelectedList.id, false)
          }

          if (currentActiveTask?.id && !isEditingNote) {
            await fetchNotes(currentActiveTask.id, false)
          }

          setSyncStatus('synced')
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('synced')
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncStatus('error')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && session?.user?.id) {
        setSyncStatus('syncing')

        const currentSelectedList = selectedListRef.current
        const currentActiveTask = activeTaskRef.current
        const isEditingNote = editingNoteIdRef.current !== null

        fetchLists(false)
        fetchAllTasks(false)
        fetchTaskNoteCounts(false)

        if (currentSelectedList?.id) {
          fetchTasks(currentSelectedList.id, false)
        }

        if (currentActiveTask?.id && !isEditingNote) {
          fetchNotes(currentActiveTask.id, false)
        }
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

  function updateCurrentListSort(nextPartial) {
    if (!selectedList) return
    setListSortSettings((prev) => ({
      ...prev,
      [selectedList.id]: {
        mode: prev[selectedList.id]?.mode || 'created',
        direction: prev[selectedList.id]?.direction || 'asc',
        ...nextPartial,
      },
    }))
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

    if (selectedListRef.current?.id === list.id) {
      setSelectedList(null)
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
    setShareModalLists([])
    setShareEmail('')
    setShareOwnerEmail('')
    setShareMembers([])
    setShareLoading(false)
    setShareSubmitting(false)
    setShareError('')
    setShareMessage('')
    setShareRemovingUserId(null)
  }
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
    const submenuWidth = Math.min(560, Math.floor(window.innerWidth * 0.7))
    const padding = 8
    const overlap = 10

    const menuRect = contextMenuRef.current?.getBoundingClientRect()

    if (!menuRect) {
      return {
        left: `${padding}px`,
        top: `${padding}px`,
      }
    }

    const openRightLeft = menuRect.right - overlap
    const openLeftLeft = menuRect.left - submenuWidth + overlap

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
        return a.completed - b.completed
      }

      if (!a.completed && !b.completed && a.needs_weighing !== b.needs_weighing) {
        return a.needs_weighing ? 1 : -1
      }

      if (mode === 'alpha') {
        return (
          (a.title || '').localeCompare(b.title || '', 'el', {
            sensitivity: 'base',
          }) * factor
        )
      }

      if (mode === 'created') {
        const aTime = new Date(a.created_at || 0).getTime()
        const bTime = new Date(b.created_at || 0).getTime()
        return (aTime - bTime) * factor
      }

      return ((a.position || 0) - (b.position || 0)) * factor
    })
  }

  function sortNotes(noteArray) {
    return [...noteArray].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed - b.completed
      return new Date(a.created_at) - new Date(b.created_at)
    })
  }

  function formatDateTime(value) {
    if (!value) return '—'
    const d = new Date(value)
    return d.toLocaleString('el-GR')
  }

  const syncText = useMemo(() => {
    if (isOffline) return 'Χωρίς σύνδεση στο internet'
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

  const ownedSelectedLists = useMemo(
    () => lists.filter((list) => selectedListIds.includes(list.id) && list.owner_user_id === session?.user?.id),
    [lists, selectedListIds, session?.user?.id]
  )

  const isBulkShareModal = shareModalLists.length > 1

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
        setSelectedListIds([])
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

  function applySingleListSelection(list) {
    if (!list) return

    setCurrentListRole(list.owner_user_id === session?.user?.id ? 'owner' : 'editor')
    setSelectedList(list)
    setSelectedListIds([list.id])
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

  async function fetchLists(updateStatus = true) {
    if (!session?.user?.id) return
    if (updateStatus) setLoadingLists(true)

    const { data, error } = await supabase
      .from('lists')
      .select('*')
      .order('position', { ascending: true })

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
      setSelectedList(null)
      setTasks([])
      setActiveTask(null)
      setTaskNotes([])
      if (updateStatus) setLoadingLists(false)
      if (updateStatus) markSynced()
      return
    }

    const stillExists = selectedListRef.current
      ? loadedLists.find((l) => l.id === selectedListRef.current.id)
      : null

    const nextSelected = stillExists || loadedLists[0]
    setCurrentListRole(nextSelected.owner_user_id === session?.user?.id ? 'owner' : 'editor')
    setSelectedList(nextSelected)
    setSelectedListIds((prev) => {
      const existingIds = new Set(loadedLists.map((list) => list.id))
      const filtered = prev.filter((id) => existingIds.has(id))
      return filtered.length > 0 ? filtered : [nextSelected.id]
    })
    setListSelectionAnchorId((prev) =>
      loadedLists.some((list) => list.id === prev) ? prev : nextSelected.id
    )

    if (updateStatus) {
      setLoadingLists(false)
      markSynced()
    } else {
      setLoadingLists(false)
    }
  }

  async function fetchAllTasks(updateStatus = true) {
    if (!session?.user?.id) return

    const { data, error } = await supabase.from('tasks').select('*')

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

    const { data, error } = await supabase.from('task_notes').select('task_id')

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
  async function fetchTasks(listId, updateStatus = true) {
    if (!session?.user?.id) return
    if (!listId) return
    if (updateStatus) setLoadingTasks(true)

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('list_id', listId)

    if (error) {
      console.error('Σφάλμα φόρτωσης εργασιών:', error)
      setTasks([])
      setSyncStatus('error')
      if (updateStatus) setLoadingTasks(false)
      return
    }

    const loadedTasks = sortTasks(data || [], currentSortMode, currentSortDirection)
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

    if (updateStatus) {
      setLoadingTasks(false)
      markSynced()
    } else {
      setLoadingTasks(false)
    }
  }

  async function fetchNotes(taskId, updateStatus = true) {
    if (!session?.user?.id) return
    if (!taskId) return

    const { data, error } = await supabase
      .from('task_notes')
      .select('*')
      .eq('task_id', taskId)

    if (error) {
      console.error('Σφάλμα φόρτωσης σημειώσεων:', error)
      setTaskNotes([])
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

  async function handleAcceptInvite(inviteId) {
    if (!inviteId || isOffline) return

    setInviteActionLoading(inviteId)

    const { error } = await supabase.rpc('accept_list_invite', {
      invite_id: inviteId,
    })

    if (error) {
      console.error('Σφάλμα αποδοχής invitation:', error)
      alert('Δεν ήταν δυνατή η αποδοχή της πρόσκλησης.')
      setInviteActionLoading(null)
      return
    }

    await fetchPendingInvites()
    await fetchLists(false)
    setInviteActionLoading(null)
  }

  async function handleRejectInvite(inviteId) {
    if (!inviteId || isOffline) return

    const confirmed = window.confirm('Θέλεις να απορρίψεις αυτή την πρόσκληση;')
    if (!confirmed) return

    setInviteActionLoading(inviteId)

    const { error } = await supabase.rpc('reject_list_invite', {
      invite_id: inviteId,
    })

    if (error) {
      console.error('Σφάλμα απόρριψης invitation:', error)
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

  async function openShareModal(listOrLists) {
    const normalizedLists = Array.isArray(listOrLists)
      ? listOrLists.filter((list) => list?.id)
      : listOrLists?.id
        ? [listOrLists]
        : []

    if (normalizedLists.length === 0) return

    const primaryList = normalizedLists[0]

    closeContextMenu()
    setShareModalList(primaryList)
    setShareModalLists(normalizedLists)
    setShareEmail('')
    setShareOwnerEmail('')
    setShareMembers([])
    setShareLoading(false)
    setShareSubmitting(false)
    setShareError('')
    setShareMessage('')
    setShareRemovingUserId(null)

    if (normalizedLists.length === 1) {
      await fetchShareDetails(primaryList)
      return
    }

    setShareOwnerEmail(String(session?.user?.email || '').trim().toLowerCase())
  }

  async function handleInviteToList(e) {
    e.preventDefault()

    if (!shareModalList || !session?.user?.id || isOffline) return

    const targetLists = (shareModalLists.length > 0 ? shareModalLists : [shareModalList]).filter(
      (list) => list?.owner_user_id === session.user.id
    )

    if (targetLists.length === 0) {
      setShareError('Δεν υπάρχουν επιλεγμένες λίστες που μπορείς να μοιραστείς.')
      return
    }

    const email = shareEmail.trim().toLowerCase()
    if (!email) {
      setShareError('Συμπλήρωσε email.')
      return
    }

    if (email === String(shareOwnerEmail || '').trim().toLowerCase()) {
      setShareError('Αυτό το email είναι ήδη ο ιδιοκτήτης της λίστας.')
      return
    }

    if (targetLists.length === 1) {
      const alreadyShared = shareMembers.some(
        (member) => String(member.email || '').trim().toLowerCase() === email
      )

      if (alreadyShared) {
        setShareError('Ο χρήστης έχει ήδη πρόσβαση σε αυτή τη λίστα.')
        return
      }
    }

    setShareSubmitting(true)
    setShareError('')
    setShareMessage('')

    const inviteResults = await Promise.all(
      targetLists.map((list) =>
        supabase.from('list_invites').insert({
          list_id: list.id,
          invited_email: email,
          invited_by_user_id: session.user.id,
          status: 'pending',
          list_name_snapshot: list.name,
        })
      )
    )

    const failedNonDuplicate = inviteResults.filter(
      (result) => result.error && !String(result.error.message || '').toLowerCase().includes('duplicate')
    )

    if (failedNonDuplicate.length > 0) {
      console.error('Σφάλμα δημιουργίας invitations:', failedNonDuplicate)
      setShareError('Δεν ήταν δυνατή η αποστολή της πρόσκλησης σε όλες τις λίστες.')
      setShareSubmitting(false)
      return
    }

    const createdCount = inviteResults.filter((result) => !result.error).length
    const duplicateCount = inviteResults.length - createdCount

    try {
      const { error: emailError } = await supabase.functions.invoke('send-list-invite-email', {
        body: {
          invitedEmail: email,
          inviterEmail: String(session.user.email || shareOwnerEmail || '').trim().toLowerCase(),
          ownerEmail: String(shareOwnerEmail || '').trim().toLowerCase(),
          listNames: targetLists.map((list) => list.name),
          appUrl: window.location.origin,
        },
      })

      if (emailError) {
        console.error('Σφάλμα αποστολής email invitation:', emailError)
        setShareEmail('')
        setShareMessage(
          createdCount > 0
            ? 'Οι προσκλήσεις αποθηκεύτηκαν, αλλά το email δεν στάλθηκε.'
            : 'Τα invites υπήρχαν ήδη, αλλά το email δεν στάλθηκε.'
        )
        setShareSubmitting(false)
        return
      }
    } catch (emailError) {
      console.error('Σφάλμα κλήσης function για email invitation:', emailError)
      setShareEmail('')
      setShareMessage(
        createdCount > 0
          ? 'Οι προσκλήσεις αποθηκεύτηκαν, αλλά το email δεν στάλθηκε.'
          : 'Τα invites υπήρχαν ήδη, αλλά το email δεν στάλθηκε.'
      )
      setShareSubmitting(false)
      return
    }

    setShareEmail('')

    if (createdCount > 0 && duplicateCount === 0) {
      setShareMessage(
        targetLists.length === 1
          ? 'Η πρόσκληση στάλθηκε επιτυχώς και το email εστάλη.'
          : `Οι προσκλήσεις στάλθηκαν σε ${createdCount} λίστες και το email εστάλη.`
      )
    } else if (createdCount > 0) {
      setShareMessage(`Στάλθηκαν invites σε ${createdCount} λίστες. Σε ${duplicateCount} υπήρχε ήδη εκκρεμές invite.`)
    } else {
      setShareMessage('Υπήρχε ήδη εκκρεμές invite σε όλες τις επιλεγμένες λίστες.')
    }

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

  function handleSelectList(list, event) {
    if (!list?.id) return

    const orderedListIds = lists.map((item) => item.id)
    const clickedIndex = orderedListIds.findIndex((id) => id === list.id)

    setCurrentListRole(list.owner_user_id === session?.user?.id ? 'owner' : 'editor')
    setSelectedList(list)
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

    if (event?.shiftKey && listSelectionAnchorId !== null) {
      const anchorIndex = orderedListIds.findIndex((id) => id === listSelectionAnchorId)

      if (clickedIndex !== -1 && anchorIndex !== -1) {
        const start = Math.min(clickedIndex, anchorIndex)
        const end = Math.max(clickedIndex, anchorIndex)
        setSelectedListIds(orderedListIds.slice(start, end + 1))
        return
      }
    }

    if (event?.ctrlKey || event?.metaKey) {
      setSelectedListIds((prev) =>
        prev.includes(list.id) ? prev.filter((id) => id !== list.id) : [...prev, list.id]
      )
      setListSelectionAnchorId(list.id)
      return
    }

    setSelectedListIds([list.id])
    setListSelectionAnchorId(list.id)
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
    setSelectedListIds([data.id])
    setListSelectionAnchorId(data.id)
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

    setSelectedListIds((prev) => prev.filter((id) => id !== list.id))

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
    const oldTasks = [...tasks]

    updateTaskEverywhere(task.id, { title, updated_at: now, updated_by: session?.user?.id || null })
    markSaving()

    const { error } = await supabase
      .from('tasks')
      .update({ title, updated_at: now, updated_by: session?.user?.id || null })
      .eq('id', task.id)

    if (error) {
      console.error('Σφάλμα μετονομασίας εργασίας:', error)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

    setEditingTaskValue(title)
    setEditingTaskTitle(false)
    closeContextMenu()
    markSynced()
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

    markSaving()

    const { error } = await supabase
      .from('task_notes')
      .update({ content, updated_by: session?.user?.id || null })
      .eq('id', note.id)

    if (error) {
      console.error('Σφάλμα μετονομασίας σημείωσης:', error)
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

    markSaving()

    const { error } = await supabase
      .from('task_notes')
      .update({ content, updated_by: session?.user?.id || null })
      .eq('id', noteId)

    if (error) {
      console.error('Σφάλμα επεξεργασίας σημείωσης:', error)
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

  async function handleDeleteSelectedLists() {
    if (isOffline) return

    const listsToDelete = ownedSelectedLists

    if (listsToDelete.length === 0) return

    const label =
      listsToDelete.length === 1
        ? `Να διαγραφεί η λίστα "${listsToDelete[0].name}";`
        : `Να διαγραφούν ${listsToDelete.length} επιλεγμένες λίστες;`

    if (!window.confirm(label)) return

    const idsToDelete = listsToDelete.map((list) => list.id)
    const oldLists = [...lists]

    setLists((prev) => prev.filter((list) => !idsToDelete.includes(list.id)))
    setSelectedListIds((prev) => prev.filter((id) => !idsToDelete.includes(id)))

    if (selectedList?.id && idsToDelete.includes(selectedList.id)) {
      const remainingLists = lists.filter((list) => !idsToDelete.includes(list.id))

      if (remainingLists.length > 0) {
        applySingleListSelection(remainingLists[0])
      } else {
        setSelectedList(null)
        setSelectedListIds([])
        setListSelectionAnchorId(null)
        setTasks([])
        setActiveTask(null)
        setTaskNotes([])
        setEditingNoteId(null)
        setEditingNoteValue('')
      }
    }

    if (shareModalList?.id && idsToDelete.includes(shareModalList.id)) {
      closeShareModal()
    }

    markSaving()

    const { error } = await supabase.from('lists').delete().in('id', idsToDelete)

    if (error) {
      console.error('Σφάλμα διαγραφής λιστών:', error)
      setLists(oldLists)
      setSyncStatus('error')
      return
    }

    closeContextMenu()
    markSynced()
  }

  async function handleDeleteList(list) {
    if (list?.owner_user_id !== session?.user?.id) return
    if (!list || isOffline) return
    if (!window.confirm(`Να διαγραφεί η λίστα "${list.name}";`)) return

    markSaving()

    const { error } = await supabase.from('lists').delete().eq('id', list.id)

    if (error) {
      console.error('Σφάλμα διαγραφής λίστας:', error)
      setSyncStatus('error')
      return
    }

    closeContextMenu()

    const updatedLists = lists.filter((l) => l.id !== list.id)
    setLists(updatedLists)

    setSelectedListIds((prev) => prev.filter((id) => id !== list.id))

    if (selectedList?.id === list.id) {
      if (updatedLists.length > 0) {
        const nextList = updatedLists[0]
        setSelectedList(nextList)
        setActiveTask(null)
        setTaskNotes([])
        setEditingNoteId(null)
        setEditingNoteValue('')
        fetchTasks(nextList.id, false)
      } else {
        setSelectedList(null)
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
      console.error('Σφάλμα αποθήκευσης σειράς εργασιών:', results)
      setSyncStatus('error')
      fetchTasks(selectedList?.id, false)
      return
    }

    markSynced()
  }

  function handleListDragStart(listId) {
    setDraggedListId(listId)
    setDraggedTaskId(null)
    setDraggedTaskIds([])
  }

  function handleTaskDragStart(taskId) {
    if (taskSearch.trim() || isOffline) return

    const dragIds =
      selectedTasks.includes(taskId) && selectedTasks.length > 1
        ? [...selectedTasks]
        : [taskId]

    setDraggedTaskIds(dragIds)
    setDraggedTaskId(dragIds.length === 1 ? taskId : null)
    setDraggedListId(null)
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
      console.error('Σφάλμα μετακίνησης εργασιών με drag and drop:', results)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

    closeContextMenu()
    markSynced()
  }

  function handleAnyDragEnd() {
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
      position: nextPosition,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      created_by: session?.user?.id || null,
      updated_by: session?.user?.id || null,
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
          position: nextPosition,
          updated_at: new Date().toISOString(),
          created_by: session?.user?.id || null,
          updated_by: session?.user?.id || null,
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

    setTasks((prev) => {
      const withoutTemps = prev.filter(
        (task) => !tempTasks.some((temp) => temp.id === task.id)
      )
      return sortTasks([...withoutTemps, ...(data || [])], currentSortMode, currentSortDirection)
    })
    setAllTasks((prev) => [...prev, ...(data || [])])

    markSynced()
  }

  function handleTaskClick(task, event) {
    setActiveTask(task)
    setEditingTaskValue(task.title)
    setEditingNoteId(null)
    setEditingNoteValue('')
    fetchNotes(task.id, false)

    const taskId = task.id

    if (event.shiftKey && selectionAnchorId !== null) {
      const currentIndex = visibleTasks.findIndex((t) => t.id === taskId)
      const anchorIndex = visibleTasks.findIndex((t) => t.id === selectionAnchorId)

      if (currentIndex !== -1 && anchorIndex !== -1) {
        const start = Math.min(currentIndex, anchorIndex)
        const end = Math.max(currentIndex, anchorIndex)
        const rangeIds = visibleTasks.slice(start, end + 1).map((t) => t.id)
        setSelectedTasks(rangeIds)
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

    setSelectedTasks([taskId])
    setSelectionAnchorId(taskId)
  }

  async function handleToggleCompleted(task) {
    if (isOffline) return

    const oldTasks = [...tasks]
    const newCompleted = !task.completed
    const now = new Date().toISOString()

    updateTaskEverywhere(task.id, {
      completed: newCompleted,
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    markSaving()

    const { error } = await supabase
      .from('tasks')
      .update({
        completed: newCompleted,
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
      .eq('id', task.id)

    if (error) {
      console.error('Σφάλμα αλλαγής ολοκλήρωσης:', error)
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

    markSynced()
  }

  async function handleToggleWeighing(task, event) {
    event.preventDefault()
    event.stopPropagation()
    if (isOffline) return

    const newValue = !task.needs_weighing
    const now = new Date().toISOString()

    const updatedTasks = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            needs_weighing: newValue,
            updated_at: now,
            updated_by: session?.user?.id || null,
          }
        : t
    )

    setTasks(sortTasks(updatedTasks, currentSortMode, currentSortDirection))

    setAllTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              needs_weighing: newValue,
              updated_at: now,
              updated_by: session?.user?.id || null,
            }
          : t
      )
    )

    setActiveTask((prev) =>
      prev?.id === task.id
        ? {
            ...prev,
            needs_weighing: newValue,
            updated_at: now,
            updated_by: session?.user?.id || null,
          }
        : prev
    )

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
      setTasks(oldTasks)
      setSyncStatus('error')
      return
    }

    closeContextMenu()
    markSynced()
  }

  async function handleDeleteOneTask(taskId) {
    if (isOffline) return

    const task = allTasks.find((t) => t.id === taskId)
    if (!window.confirm(`Να διαγραφεί η εργασία "${task?.title || ''}";`)) return

    const oldTasks = [...tasks]

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
    const title = taskSearch.trim()
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
          <title>${escapeHtml(title)}</title>
        </head>
        <body style="font-family:Arial,sans-serif;padding:20px;">
          <h1 style="margin-top:0;font-size:18px;">${escapeHtml(title)}</h1>
          ${rows || '<p style="font-size:13px;">Δεν υπάρχουν μη ολοκληρωμένες εργασίες.</p>'}
        </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
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

    const now = new Date().toISOString()
    setTaskNotes((prev) => sortNotes([...prev, data]))
    setNewNoteText('')
    updateTaskEverywhere(activeTask.id, {
      updated_at: now,
      updated_by: session?.user?.id || null,
    })
    setNoteCountsByTask((prev) => ({
      ...prev,
      [activeTask.id]: (prev[activeTask.id] || 0) + 1,
    }))

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
    const noteToDelete = taskNotes.find((n) => n.id === noteId)
    const now = new Date().toISOString()

    setTaskNotes((prev) => prev.filter((note) => note.id !== noteId))

    if (activeTask?.id) {
      updateTaskEverywhere(activeTask.id, {
        updated_at: now,
        updated_by: session?.user?.id || null,
      })
    }

    if (activeTask?.id && noteToDelete) {
      setNoteCountsByTask((prev) => ({
        ...prev,
        [activeTask.id]: Math.max((prev[activeTask.id] || 1) - 1, 0),
      }))
    }

    if (editingNoteIdRef.current === noteId) {
      setEditingNoteId(null)
      setEditingNoteValue('')
    }

    markSaving()

    const noteResult = await supabase.from('task_notes').delete().eq('id', noteId)

    if (noteResult.error) {
      console.error('Σφάλμα διαγραφής σημείωσης:', noteResult.error)
      setTaskNotes(oldNotes)

      if (activeTask?.id && noteToDelete) {
        setNoteCountsByTask((prev) => ({
          ...prev,
          [activeTask.id]: (prev[activeTask.id] || 0) + 1,
        }))
      }

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

    const nextSelectedListIds =
      selectedListIds.length > 1 && selectedListIds.includes(list.id)
        ? selectedListIds
        : [list.id]

    if (!(selectedListIds.length > 1 && selectedListIds.includes(list.id))) {
      setSelectedListIds([list.id])
      setListSelectionAnchorId(list.id)
    }

    setContextMenu({
      type: nextSelectedListIds.length > 1 ? 'list_multi' : 'list',
      x: event.clientX,
      y: event.clientY,
      list,
      listIds: nextSelectedListIds,
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

  if (!session) {
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
            {authMode === 'signin' ? 'Σύνδεση' : 'Εγγραφή'}
          </h2>

          <form
            onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp}
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

            <input
              type="password"
              placeholder="Κωδικός"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="task-input"
              autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
            />

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

            <button type="submit" className="add-button">
              {authMode === 'signin' ? 'Σύνδεση' : 'Εγγραφή'}
            </button>
          </form>

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
      <div
        className={`app ${isResizingSidebar || isResizingDetails ? 'is-resizing' : ''}`}
        ref={appRef}
      >
        <div
          className="sidebar"
          style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}
        >
          <div className="sidebar-scroll-area">
            <div className="sidebar-top">
              <h2>Λίστες</h2>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="theme-toggle"
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                >
                  {theme === 'light' ? 'Dark' : 'Light'}
                </button>

                <button className="theme-toggle" onClick={handleSignOut}>
                  Έξοδος
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: '8px',
                fontSize: '11px',
                color: 'var(--text-soft)',
                wordBreak: 'break-word',
              }}
            >
              {session.user.email}
            </div>

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

            {loadingLists ? (
              <p>Φόρτωση...</p>
            ) : lists.length === 0 ? (
              <p>Δεν βρέθηκαν λίστες.</p>
            ) : (
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

                  const taskDropActive = taskDropListId === list.id
                  const incompleteCount = incompleteCountByList[list.id] || 0
                  const completedCount = completedCountByList[list.id] || 0

                  return (
                    <div
                      key={list.id}
                      className={`list-drop-wrapper ${showTopLine ? 'drop-top' : ''} ${showBottomLine ? 'drop-bottom' : ''} ${taskDropActive ? 'task-drop-active' : ''}`}
                    >
                      <button
                        className={`list-button ${selectedList?.id === list.id ? 'active' : ''} ${
                          draggedListId === list.id ? 'dragging' : ''
                        } ${selectedListIds.includes(list.id) ? 'task-item-selected' : ''}`}
                        onClick={(event) => handleSelectList(list, event)}
                        onContextMenu={(event) => handleListRightClick(event, list)}
                        draggable={!isOffline}
                        onDragStart={() => handleListDragStart(list.id)}
                        onDragOver={(event) => handleListDragOver(event, list.id)}
                        onDrop={() => handleListDrop(list.id)}
                        onDragEnd={handleAnyDragEnd}
                        title="Σύρε λίστα για αλλαγή σειράς ή εργασία για μεταφορά εδώ"
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
                    </div>
                  )
                })}
              </div>
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
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsResizingSidebar(true)
          }}
          title="Αλλαγή πλάτους αριστερής στήλης"
        />

        <div
          ref={mainRef}
          className={`main ${activeTask ? 'with-details' : ''}`}
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
          {invitesLoading ? (
            <div className="invites-banner">
              <h3>Προσκλήσεις σε λίστες</h3>
              <p>Φόρτωση προσκλήσεων...</p>
            </div>
          ) : pendingInvites.length > 0 ? (
            <div className="invites-banner">
              <h3>Προσκλήσεις σε λίστες</h3>
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="invite-item">
                  <span>
                    Έχεις εκκρεμή πρόσκληση για λίστα{' '}
                    <strong>{invite.list_name_snapshot || `#${invite.list_id}`}</strong>
                  </span>
                  <div className="invite-actions">
                    <button
                      type="button"
                      onClick={() => handleAcceptInvite(invite.id)}
                      disabled={inviteActionLoading === invite.id || isOffline}
                    >
                      {inviteActionLoading === invite.id ? 'Αποδοχή...' : 'Αποδοχή'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleRejectInvite(invite.id)}
                      disabled={inviteActionLoading === invite.id || isOffline}
                    >
                      Απόρριψη
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {selectedList ? (
            <>
              <div className="main-header">
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
                    autoFocus
                  />
                ) : (
                  <h1
  className="editable-title"
  onClick={() => {
    if (selectedList.owner_user_id === session?.user?.id) {
      setEditingListName(true)
      setEditingListValue(selectedList.name)
    }
  }}
  title={
    selectedList.owner_user_id === session?.user?.id
      ? 'Κλικ για μετονομασία'
      : 'Κοινόχρηστη λίστα'
  }
>
  {selectedList.name}
  <span
    style={{
      marginLeft: '10px',
      fontSize: '12px',
      fontWeight: 500,
      color: 'var(--text-soft)',
    }}
  >
    {currentListRole === 'owner' ? '(Ιδιοκτήτης)' : '(Κοινόχρηστη)'}
  </span>
</h1>
                )}

                <div className="main-actions">
                  <div className="task-sort-box">
                    <label htmlFor="sortMode">Ταξινόμηση</label>

                    <button
                      className={`sort-direction-button ${
                        currentSortDirection === 'asc' ? 'asc' : 'desc'
                      }`}
                      onClick={() =>
                        updateCurrentListSort({
                          direction: currentSortDirection === 'asc' ? 'desc' : 'asc',
                        })
                      }
                      title={
                        currentSortDirection === 'asc'
                          ? 'Αύξουσα σειρά'
                          : 'Φθίνουσα σειρά'
                      }
                      type="button"
                    >
                      {currentSortDirection === 'asc' ? '↑' : '↓'}
                    </button>

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

                  <button className="print-button" onClick={handlePrintTasks}>
                    Εκτύπωση Εργασιών
                  </button>
                </div>
              </div>

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
                  Προσθήκη
                </button>
              </form>

              {loadingTasks ? (
                <p>Φόρτωση εργασιών...</p>
              ) : visibleTasks.length === 0 ? (
                <p>
                  {taskSearch.trim()
                    ? 'Δεν βρέθηκε αυτό που ψάχνεις'
                    : 'Δεν υπάρχουν εργασίες σε αυτή τη λίστα.'}
                </p>
              ) : (
                <div className="task-container">
                  {visibleTasks.map((task, index) => {
                    const showTaskTopLine =
                      taskReorderIndicator &&
                      taskReorderIndicator.targetTaskId === task.id &&
                      taskReorderIndicator.position === 'top'

                    const showTaskBottomLine =
                      taskReorderIndicator &&
                      taskReorderIndicator.targetTaskId === task.id &&
                      taskReorderIndicator.position === 'bottom'

                    const previousTask = visibleTasks[index - 1]
                    const shouldShowCompletedDivider =
                      index > 0 &&
                      !previousTask.completed &&
                      task.completed

                    return (
                      <div key={task.id}>
                        {shouldShowCompletedDivider && (
                          <div className="completed-divider">Ολοκληρωμένες</div>
                        )}

                        <div
                          className={`task-drop-wrapper ${
                            showTaskTopLine ? 'task-drop-top' : ''
                          } ${showTaskBottomLine ? 'task-drop-bottom' : ''}`}
                        >
                          <div
                            className={`task-item ${
                              selectedTasks.includes(task.id) ? 'task-item-selected' : ''
                            } ${activeTask?.id === task.id ? 'task-item-active' : ''}`}
                            onClick={(event) => handleTaskClick(task, event)}
                            onContextMenu={(event) => handleTaskRightClick(event, task)}
                            draggable={!taskSearch.trim() && !isOffline}
                            onDragStart={() => handleTaskDragStart(task.id)}
                            onDragOver={(event) => handleTaskDragOver(event, task.id)}
                            onDrop={() => handleTaskDrop(task.id)}
                            onDragEnd={handleAnyDragEnd}
                            title={
                              taskSearch.trim()
                                ? 'Εμφάνιση αποτελέσματος αναζήτησης'
                                : currentSortMode === 'manual'
                                  ? 'Κλικ για επιλογή • Δεξί κλικ για μενού • Σύρε για αλλαγή σειράς ή σε λίστα για μεταφορά'
                                  : 'Κλικ για επιλογή • Δεξί κλικ για μενού • Σύρε σε λίστα για μεταφορά'
                            }
                          >
                            <input
                              className="round-checkbox"
                              type="checkbox"
                              checked={task.completed}
                              onMouseDown={(e) => {
                                e.stopPropagation()
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                              }}
                              onChange={(e) => {
                                e.stopPropagation()
                                handleToggleCompleted(task)
                              }}
                              disabled={isOffline}
                            />

                            <div className="task-text-block">
                              <span className={`task-title ${task.completed ? 'completed' : ''}`}>
                                {task.title}
                              </span>

                              {task.notes_count > 0 && (
                                <span
                                  className="task-notes-count"
                                  title={
                                    task.notes_count === 1
                                      ? '1 σημείωση'
                                      : `${task.notes_count} σημειώσεις`
                                  }
                                >
                                  <span className="task-notes-icon">📝</span>
                                  <span>{task.notes_count}</span>
                                </span>
                              )}

                              {taskSearch.trim() && (
                                <span className="task-list-label">
                                  Λίστα: {task.list_name || '—'}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              draggable={false}
                              className={`weight-toggle ${task.needs_weighing ? 'on' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={(e) => handleToggleWeighing(task, e)}
                              title="Ογκομέτρηση"
                              disabled={isOffline}
                            >
                              ⚖
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <p>Διάλεξε ή δημιούργησε μια λίστα.</p>
          )}
        </div>

        {activeTask && (
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
          className={`details-drawer ${activeTask ? 'open' : ''}`}
          style={
            activeTask
              ? { width: `${detailsWidth}px`, minWidth: `${detailsWidth}px` }
              : undefined
          }
        >
          {activeTask && (
            <div className="details-panel">
              <div className="details-panel-header">
                {editingTaskTitle ? (
                  <input
                    className="details-task-title-input"
                    value={editingTaskValue}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditingTaskValue(e.target.value)}
                    onBlur={async () => {
                      await handleRenameTask(activeTask, editingTaskValue)
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        await handleRenameTask(activeTask, editingTaskValue)
                      }
                      if (e.key === 'Escape') {
                        setEditingTaskTitle(false)
                        setEditingTaskValue(activeTask.title)
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <div
                    className="details-task-title"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingTaskTitle(true)
                      setEditingTaskValue(activeTask.title)
                    }}
                    title="Κλικ για μετονομασία"
                  >
                    {activeTask.title}
                  </div>
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

              <input
                type="text"
                className="note-input"
                placeholder="Γράψε σημείωση και πάτα Enter..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddNoteFromEnter()
                  }
                }}
                disabled={isOffline}
              />

              <div className="notes-list">
                {taskNotes.length === 0 ? (
                  <p className="notes-empty">Δεν υπάρχουν σημειώσεις ακόμη.</p>
                ) : (
                  taskNotes.map((note) => (
                    <div
                      key={note.id}
                      className={`note-item ${note.completed ? 'note-item-completed' : ''}`}
                      onClick={() => {
                        if (editingNoteId !== note.id) {
                          setEditingNoteId(note.id)
                          setEditingNoteValue(note.content)
                        }
                      }}
                      onContextMenu={(event) => handleNoteRightClick(event, note)}
                      title="Κλικ για επεξεργασία • Δεξί κλικ για μενού"
                    >
                      <input
                        className="round-checkbox"
                        type="checkbox"
                        checked={note.completed}
                        onChange={() => handleToggleNoteCompleted(note)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={isOffline}
                      />

                      {editingNoteId === note.id ? (
                        <input
                          className="note-inline-input"
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          onBlur={() => handleInlineRenameNote(note.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleInlineRenameNote(note.id)
                            }
                            if (e.key === 'Escape') {
                              clearEditingNoteIfStillSame(note.id, '')
                            }
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          disabled={isOffline}
                        />
                      ) : (
                        <span className={note.completed ? 'completed' : ''}>
                          {note.content}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="task-updated-box">
                <span className="task-updated-label">Τελευταία αλλαγή</span>
                <span className="task-updated-value">
                  {formatDateTime(activeTask.updated_at)}
                  {lastEditorEmail ? ` • από ${lastEditorEmail}` : ''}
                </span>
              </div>
            </div>
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

            <button className="context-menu-item danger" onClick={handleDeleteSelected}>
              {selectedTasks.length === 1 ? 'Διαγραφή εργασίας' : 'Διαγραφή εργασιών'}
            </button>
          </div>
        )}

        {contextMenu && contextMenu.type === 'list_multi' && (
  <div
    className="context-menu"
    style={getContextMenuPosition()}
    onClick={(e) => e.stopPropagation()}
  >
    <button
      className="context-menu-item"
      onClick={() => openShareModal(ownedSelectedLists)}
      disabled={ownedSelectedLists.length === 0 || isOffline}
    >
      Κοινή χρήση επιλεγμένων
    </button>

    <button
      className="context-menu-item danger"
      onClick={handleDeleteSelectedLists}
      disabled={ownedSelectedLists.length === 0 || isOffline}
    >
      Διαγραφή επιλεγμένων
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
                  {isBulkShareModal ? 'Κοινή χρήση λιστών' : 'Κοινή χρήση λίστας'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginTop: '4px' }}>
                  {isBulkShareModal
                    ? `${shareModalLists.length} επιλεγμένες λίστες`
                    : shareModalList.name}
                </div>
              </div>

              <button className="details-close" onClick={closeShareModal}>
                ✕
              </button>
            </div>

            {(isBulkShareModal || shareModalList.owner_user_id === session?.user?.id) ? (
              <form
                onSubmit={handleInviteToList}
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <input
                  type="email"
                  placeholder="Email χρήστη για invite..."
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
                  {shareSubmitting
                    ? 'Αποστολή...'
                    : isBulkShareModal
                      ? 'Αποστολή invite σε όλες τις επιλεγμένες'
                      : 'Αποστολή invite'}
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
                {isBulkShareModal ? 'Ιδιοκτήτης των επιλεγμένων' : 'Ιδιοκτήτης'}
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
                {isBulkShareModal
                  ? shareOwnerEmail || String(session?.user?.email || '').trim().toLowerCase() || '—'
                  : shareOwnerEmail || '—'}
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
                {isBulkShareModal ? 'Επιλεγμένες λίστες' : 'Διαμοιραζόμενοι χρήστες'}
              </div>

              {isBulkShareModal ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shareModalLists.map((list) => (
                    <div
                      key={list.id}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        background: 'var(--panel-soft)',
                        fontSize: '12px',
                        wordBreak: 'break-word',
                      }}
                    >
                      {list.name}
                    </div>
                  ))}
                </div>
              ) : shareLoading ? (
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

                      {!isBulkShareModal && shareModalList.owner_user_id === session?.user?.id && (
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
          </div>
        </div>
      )}
    </>
  )
}

export default App