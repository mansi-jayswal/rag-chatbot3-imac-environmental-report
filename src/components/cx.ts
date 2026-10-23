// Joins class names, skipping falsy ones. (src/lib/utils.ts `cn` comes from the npm package "cn" and does not merge
// conflicting Tailwind classes, so the chat components just compose classes by hand.)
export const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
