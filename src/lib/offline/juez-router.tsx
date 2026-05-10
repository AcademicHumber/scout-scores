"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

type Ctx = { pathname: string | null; navigate: (href: string) => void }

const JuezRouterCtx = createContext<Ctx | null>(null)

export function JuezRouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState<string | null>(null)

  useEffect(() => {
    setPathname(window.location.pathname)
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const navigate = useCallback((href: string) => {
    if (typeof window === "undefined") return
    if (window.location.pathname === href) return
    window.history.pushState({}, "", href)
    setPathname(href)
    window.scrollTo(0, 0)
  }, [])

  return (
    <JuezRouterCtx.Provider value={{ pathname, navigate }}>
      {children}
    </JuezRouterCtx.Provider>
  )
}

export function useJuezRouter() {
  const ctx = useContext(JuezRouterCtx)
  if (!ctx) throw new Error("useJuezRouter must be used inside JuezRouterProvider")
  return ctx
}

export function JuezLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string
  children: ReactNode
  className?: string
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const { navigate } = useJuezRouter()
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(href)
      }}
      className={className}
      {...rest}
    >
      {children}
    </a>
  )
}
