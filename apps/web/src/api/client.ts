import { z } from 'zod'

export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'request_failed', status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

async function readJson(response: Response) {
  try {
    const body: unknown = await response.json()
    return body
  } catch {
    return null
  }
}

export async function request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  })
  const body = await readJson(response)
  if (!response.ok) {
    const error = z.object({ error: z.string(), code: z.string().optional() }).safeParse(body)
    throw new ApiError(
      error.success ? error.data.error : 'The request failed.',
      error.success ? error.data.code : undefined,
      response.status,
    )
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('The server returned data in an unknown format.', 'response_invalid', 500)
  }
  return parsed.data
}

export function jsonOptions(method: string, body: unknown, csrf?: string) {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(body),
  }
}
