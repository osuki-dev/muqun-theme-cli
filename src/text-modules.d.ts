/**
 * Bun resolves `import x from './file.md' with { type: 'text' }` to the file's
 * contents, in `bun test` and in `bun build` alike. tsc only needs to be told
 * the shape.
 */
declare module '*.md' {
  const text: string;
  export default text;
}
