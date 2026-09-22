import { themeJsonSchema } from '../src/schema.js';
import { createThemeStarter } from '../src/starter.js';

const file = new URL('../skills/muqun-theme/SKILL.md', import.meta.url);
let content = await Bun.file(file).text();
for (const [heading, fence, value] of [
  ['JSON Schema', 'json', themeJsonSchema()],
  ['Complete starter manifest', 'muqun-theme', createThemeStarter()],
] as const) {
  const section = new RegExp(`(## ${heading}\\n\\n(?:<!--[\\s\\S]*?-->\\n)*\`\`\`${fence}\\n)[\\s\\S]*?(\\n\`\`\`)`);
  if (!section.test(content)) throw new Error(`Missing skill section: ${heading}`);
  content = content.replace(section, (_match, start: string, end: string) =>
    `${start}${JSON.stringify(value)}${end}`,
  );
}
await Bun.write(file, content);
