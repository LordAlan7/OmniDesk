import { apiRequest } from './api'

export interface User {
  id: number
  name: string
  email: string
  roles: string[]
  active: boolean
  createdAt: string
}

export interface CreateUserData {
  name: string
  email: string
  password: string
  roles: string[]
}

export interface UserFilters {
  search?: string
  role?: string
  active?: boolean
  page?: number
  limit?: number
}

export function listUsers(filters: UserFilters = {}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 10),
  })

  if (filters.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters.role) {
    params.set('role', filters.role)
  }

  if (filters.active !== undefined) {
    params.set('active', String(filters.active))
  }

  return apiRequest<User[]>(`/users?${params.toString()}`)
}

export function getUser(id: number) {
  return apiRequest<User>(`/users/${id}`)
}

export function createUser(data: CreateUserData) {
  return apiRequest<User>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateUser(
  id: number,
  data: {
    name: string
    email: string
    roles: string[]
  },
) {
  return apiRequest<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function setUserRoles(id: number, roles: string[]) {
  return apiRequest<User>(`/users/${id}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  })
}

export function setUserStatus(id: number, active: boolean) {
  return apiRequest<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
  
}
export function listRoles() {
  return apiRequest<string[]>('/roles')
}