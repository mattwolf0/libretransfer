import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { SortDirection, SortField } from '../api'

function readSort(value: string | null) {
  return value === 'type' || value === 'size' || value === 'changed' ? value : 'name'
}

function readDirection(value: string | null) {
  return value === 'desc' ? 'desc' : 'asc'
}

function readNumber(value: string | null, fallback: number) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

export function useFolderNavigation() {
  const [search, setSearch] = useSearchParams()
  const path = search.get('path') ?? ''
  const searchQuery = search.get('q') ?? ''
  const sortField: SortField = readSort(search.get('sort'))
  const sortDirection: SortDirection = readDirection(search.get('dir'))
  const currentPage = readNumber(search.get('page'), 1)
  const requestedPageSize = readNumber(search.get('pageSize'), 50)
  const pageSize = [25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50
  const [searchText, setSearchText] = useState(searchQuery)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText === searchQuery) return
      const next = new URLSearchParams(search)
      if (searchText.trim()) next.set('q', searchText.trim())
      else next.delete('q')
      next.delete('page')
      setSearch(next, { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery, search, searchText, setSearch])

  function changeSearch(changes: Record<string, string | number | null>, replace = true) {
    const next = new URLSearchParams(search)
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === '' || value === 1) next.delete(key)
      else next.set(key, String(value))
    })
    setSearch(next, { replace })
  }

  function openFolder(nextPath: string) {
    const next = new URLSearchParams()
    if (nextPath) next.set('path', nextPath)
    if (sortField !== 'name') next.set('sort', sortField)
    if (sortDirection !== 'asc') next.set('dir', sortDirection)
    if (pageSize !== 50) next.set('pageSize', String(pageSize))
    setSearch(next)
    setSearchText('')
  }

  function changeSort(nextField: SortField) {
    const nextDirection = sortField === nextField && sortDirection === 'asc' ? 'desc' : 'asc'
    changeSearch({ sort: nextField === 'name' ? null : nextField, dir: nextDirection, page: null })
  }

  return {
    path,
    searchQuery,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
    searchText,
    setSearchText,
    changeSearch,
    openFolder,
    changeSort,
  }
}
