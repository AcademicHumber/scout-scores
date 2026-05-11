"use server"

import { signIn } from "@/auth"
import { signupSchema, normalizeEmail, hashPassword } from "@/lib/auth-credentials"
import { findUserByEmailRaw, createUserWithPassword } from "@/repositories/auth.repo"

export async function signupAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const email = normalizeEmail(parsed.data.email)

  const existing = await findUserByEmailRaw(email)
  if (existing) {
    if (existing.passwordHash) return { error: "emailTaken" }
    return { error: "emailWithGoogle" }
  }

  const passwordHash = await hashPassword(parsed.data.password)
  await createUserWithPassword({ email, name: parsed.data.name, passwordHash })

  // Auto-signIn: aceptarInvitacionEnSignIn corre en el jwt callback.
  // signIn lanza NEXT_REDIRECT internamente — nunca retorna aquí.
  await signIn("credentials", { email, password: parsed.data.password, redirectTo: "/dashboard" })
  return null
}
