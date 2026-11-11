import { createContext, useContext } from 'react'

/** #81e/#87: true inside a paper/slide figure — charts render chart + legend only (no heading, table toggle, ⓘ or hover hint). */
export const FigureCtx = createContext(false)
export const useFigure = () => useContext(FigureCtx)
