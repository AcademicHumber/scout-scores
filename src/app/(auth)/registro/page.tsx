import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { CredentialsSignupForm } from "./CredentialsSignupForm"
import messages from "@/messages/es.json"

const m = messages.auth.signup

export default async function RegistroPage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
          <p className="text-sm text-gray-500">{m.subtitle}</p>
        </div>
        <CredentialsSignupForm />
      </div>
    </div>
  )
}
