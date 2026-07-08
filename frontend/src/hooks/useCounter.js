import { useState, useEffect, useRef } from 'react'

export function useCounter(target, duration = 600, decimals = 0) {
  const [value, setValue] = useState(0)
  const startRef = useRef({ time: null, value: 0 })

  useEffect(() => {
    if (target === null || target === undefined) return
    startRef.current = { time: performance.now(), value: value }

    const animate = (now) => {
      const elapsed  = now - startRef.current.time
      const progress = Math.min(elapsed / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      const current  = startRef.current.value + (target - startRef.current.value) * eased
      // decimals: 0 للأعداد الصحيحة، 1 للعشرية
      setValue(parseFloat(current.toFixed(decimals)))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [target])

  return value
}
