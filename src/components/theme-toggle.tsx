"use client";

import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const EVENT = "themechange";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

// The theme on screen: a class set by the toggle (or by the script in layout.tsx) wins, otherwise the OS setting.
function readTheme(): Theme {
  const c = document.documentElement.classList;
  if (c.contains("dark")) return "dark";
  if (c.contains("light")) return "light";
  return darkQuery().matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mq = darkQuery();
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  try { localStorage.setItem("theme", next); } catch {} // private windows can block storage; the switch still works
  window.dispatchEvent(new Event(EVENT));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    // Cross-fade the switch where the browser supports it, unless the reader asked for less motion
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && document.startViewTransition) document.startViewTransition(() => applyTheme(next));
    else applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <HugeiconsIcon icon={theme === "dark" ? Sun03Icon : Moon02Icon} size={16} />
    </button>
  );
}
