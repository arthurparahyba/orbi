/** Prompts are Markdown files imported as text (Vite's `?raw`; scripts/raw-hooks.mjs under Node). */
declare module '*.md?raw' {
  const text: string;
  export default text;
}
