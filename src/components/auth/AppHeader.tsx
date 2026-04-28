import { auth } from "@/auth"
import { DistrictSwitcher } from "./DistrictSwitcher"
import { SignOutButton } from "./SignOutButton"
import messages from "@/messages/es.json"

export async function AppHeader() {
  const session = await auth()
  const user = session?.user

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-gray-900">Puntajes Scout</span>
            {user && <DistrictSwitcher />}
          </div>

          <div className="flex items-center gap-3">
            {user?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name ?? ""}
                className="h-8 w-8 rounded-full"
              />
            )}
            <span className="text-sm text-gray-700">{user?.name}</span>
            <SignOutButton label={messages.auth.header.logout} />
          </div>
        </div>
      </div>
    </header>
  )
}
