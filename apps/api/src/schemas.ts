import { Type } from '@sinclair/typebox'

export const LoginBody = Type.Object({
  username: Type.String({ minLength: 1, maxLength: 80 }),
  password: Type.String({ minLength: 1, maxLength: 512 }),
})

export const UserBody = Type.Object({
  username: Type.String({ minLength: 2, maxLength: 80, pattern: '^[a-zA-Z0-9._-]+$' }),
  password: Type.String({ minLength: 10, maxLength: 512 }),
  role: Type.Union([Type.Literal('admin'), Type.Literal('member')], { default: 'member' }),
})

export const StorageMemberBody = Type.Object({
  user_id: Type.Integer({ minimum: 1 }),
  can_upload: Type.Optional(Type.Boolean({ default: false })),
})

export const FolderBody = Type.Object({
  storage: Type.String({ minLength: 1, maxLength: 60 }),
  path: Type.Optional(Type.String({ default: '' })),
  name: Type.String({ minLength: 1, maxLength: 180 }),
})

export const RenameBody = Type.Object({
  storage: Type.String({ minLength: 1, maxLength: 60 }),
  path: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1, maxLength: 180 }),
})

export const BulkTrashBody = Type.Object({
  storage: Type.String({ minLength: 1, maxLength: 60 }),
  paths: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 100 }),
})

export const UploadStartBody = Type.Object({
  storage: Type.String({ minLength: 1, maxLength: 60 }),
  path: Type.Optional(Type.String({ default: '' })),
  name: Type.String({ minLength: 1, maxLength: 180 }),
  size: Type.Integer({ minimum: 0 }),
})

export const ErrorResponse = Type.Object({
  error: Type.String(),
  code: Type.String(),
})

export const commonErrors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
  413: ErrorResponse,
  422: ErrorResponse,
  429: ErrorResponse,
  507: ErrorResponse,
}
