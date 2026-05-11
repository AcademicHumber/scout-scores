import { z } from "zod"
import { hash, compare } from "bcryptjs"

export const MIN_PASSWORD_LENGTH = 8
export const LOCKOUT_THRESHOLD = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000
export const BCRYPT_COST = 10

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed)
}

export const signupSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`),
})

export const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const setPasswordSchema = z.object({
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`),
})
