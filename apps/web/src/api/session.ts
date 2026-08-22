import { jsonOptions, request } from './client'
import { actionSchema, sessionSchema, storagesSchema } from './schemas'

export function loadSession() {
  return request('/api/v1/session', sessionSchema)
}

export function login(username: string, password: string) {
  return request('/api/v1/login', sessionSchema, jsonOptions('POST', { username, password }))
}

export function logout(csrf: string) {
  return request('/api/v1/logout', actionSchema, jsonOptions('POST', {}, csrf))
}

export async function loadStorages() {
  const response = await request('/api/v1/storages', storagesSchema)
  return response.storages
}
