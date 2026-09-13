import SKILL from '../../skills/muqun-theme/SKILL.md' with { type: 'text' };

/**
 * The agent authoring skill, carried inside the executable.
 *
 * `skills/muqun-theme/SKILL.md` ships in the npm tarball, but a tool run with
 * `bunx` has no stable path to hand anyone. Bun inlines the file at build time,
 * so `muqun-theme skill` can print or write it wherever an agent will look --
 * and `check` can tell a themes repository when its vendored copy has fallen
 * behind the CLI that is checking it.
 */
export const SKILL_TEXT: string = SKILL;

/** The `version:` field of the skill's front matter, or "unknown". */
export const skillVersion = (): string =>
  /^version:\s*(\S+)/m.exec(SKILL_TEXT)?.[1] ?? 'unknown';
