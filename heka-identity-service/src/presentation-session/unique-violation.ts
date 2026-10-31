import { UniqueConstraintViolationException } from '@mikro-orm/core'

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof UniqueConstraintViolationException
}
