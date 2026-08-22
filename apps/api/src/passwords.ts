import { scryptSync, timingSafeEqual } from 'node:crypto'

import * as argon2 from 'argon2'

export async function hashPassword(password: string) {
  if (password.length < 10) throw new Error('The password must contain at least 10 characters.')
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function checkPassword(password: string, savedHash: string) {
  if (savedHash.startsWith('scrypt$')) return checkOldPassword(password, savedHash)
  try {
    return await argon2.verify(savedHash, password)
  } catch {
    return false
  }
}

export function passwordNeedsUpgrade(savedHash: string) {
  if (savedHash.startsWith('scrypt$')) return true
  try {
    return argon2.needsRehash(savedHash)
  } catch {
    return false
  }
}

function decode64(value: string) {
  return Buffer.from(value, 'base64url')
}

export function oldPasswordHash(n: number, r: number, p: number, salt: string, hash: string) {
  decode64(salt)
  decode64(hash)
  const memory = 128 * n * r
  if (
    n < 2 ||
    (n & (n - 1)) !== 0 ||
    r < 1 ||
    r > 16 ||
    p < 1 ||
    p > 8 ||
    memory > 128 * 1024 * 1024
  ) {
    throw new Error('The old password settings are not valid.')
  }
  return `scrypt$${n}$${r}$${p}$${salt}$${hash}`
}

function checkOldPassword(password: string, value: string) {
  try {
    const [, rawN, rawR, rawP, rawSalt, rawHash] = value.split('$')
    if (!rawN || !rawR || !rawP || !rawSalt || !rawHash) return false
    const n = Number(rawN)
    const r = Number(rawR)
    const p = Number(rawP)
    oldPasswordHash(n, r, p, rawSalt, rawHash)
    const salt = decode64(rawSalt)
    const expected = decode64(rawHash)
    const made = scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: Math.max(64 * 1024 * 1024, 256 * n * r),
    })
    return made.length === expected.length && timingSafeEqual(made, expected)
  } catch {
    return false
  }
}
