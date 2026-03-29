"use client"

import { useEffect, useState } from "react"

export default function CursorSpotlight() {
    const [position, setPosition] = useState({ x: 0, y: 0 })

    useEffect(() => {
        let rafId: number

        const handleMouseMove = (e: MouseEvent) => {
            cancelAnimationFrame(rafId)

            rafId = requestAnimationFrame(() => {
                setPosition({ x: e.clientX, y: e.clientY })
            })
        }

        window.addEventListener("mousemove", handleMouseMove)

        return () => {
            window.removeEventListener("mousemove", handleMouseMove)
            cancelAnimationFrame(rafId)
        }
    }, [])

    return (
        <div
            className="
        pointer-events-none fixed inset-0 z-50 hidden dark:block
      "
            style={{
                background: `radial-gradient(
          200px circle at ${position.x}px ${position.y}px,
          rgba(99, 102, 241, 0.08),
          transparent 80%
        )`,
            }}
        />
    )
}