import { createContext, use } from 'react'

// Date sorting is a display projection; manual URL ordering is available only
// in the saved order so a drop cannot silently replace that order.
export const UrlReorderAvailabilityContext = createContext(true)
export const useUrlReorderAvailable = () => use(UrlReorderAvailabilityContext)
