// yaml импортируется как текст (правило в remotion.config.ts).
declare module '*.yaml' {
  const text: string;
  export default text;
}
