// Published source: https://ui.shadcn.com/r/styles/new-york/sonner.json
// Adaptation: the Vite app passes its resolved theme; no Next.js theme context.
import { Toaster as Sonner } from "sonner"
type ToasterProps = React.ComponentProps<typeof Sonner>
const Toaster = ({theme="system", ...props}: ToasterProps) => (
  <Sonner theme={theme} className="toaster group" toastOptions={{classNames:{
    toast:"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
    description:"group-[.toast]:text-muted-foreground",
    actionButton:"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
    cancelButton:"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
  }}} {...props}/>
)
export { Toaster }
