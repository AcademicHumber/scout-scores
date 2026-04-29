import Link from "next/link"
import messages from "@/messages/es.json"

interface Props {
  kind: "invalid" | "emailMismatch"
  expected?: string
  got?: string
}

export function InviteResult({ kind, expected, got }: Props) {
  const content = {
    invalid: {
      title: messages.admin.invitePage.invalid.title,
      subtitle: messages.admin.invitePage.invalid.subtitle,
    },
    emailMismatch: {
      title: messages.admin.invitePage.emailMismatch.title,
      subtitle: messages.admin.invitePage.emailMismatch.subtitle
        .replace("{{expected}}", expected ?? "")
        .replace("{{got}}", got ?? ""),
    },
  }[kind]

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <div className="max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{content.title}</h1>
        <p className="mb-6 text-gray-600">{content.subtitle}</p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  )
}
