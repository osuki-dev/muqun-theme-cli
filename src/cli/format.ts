import type { VerifyIssue } from '../verify.js';

/**
 * Every line the CLI prints, as pure functions from data to strings.
 *
 * Kept apart from the commands so the wording can be asserted directly, and so
 * a command reads as a sequence of decisions rather than a sequence of
 * `console.log` calls. Nothing here touches the world.
 */

const MiB = 1024 * 1024;

/**
 * Colour only when someone is watching.
 *
 * `validate` is the command most likely to run in CI, where escape codes end up
 * as literal noise in a log. `NO_COLOR` is honoured because it is the one
 * convention every other tool in a pipeline already agrees on.
 */
export const colorEnabled = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

const ESC = '\u001b';
const paint =
  (code: string) =>
  (text: string): string =>
    colorEnabled() ? `${ESC}[${code}m${text}${ESC}[0m` : text;

export const bold = paint('1');
export const red = paint('31');
export const green = paint('32');
export const yellow = paint('33');
export const dim = paint('2');

export const size = (bytes: number): string =>
  bytes >= MiB ? `${(bytes / MiB).toFixed(2)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;

/**
 * One line per issue, except when that would be fourteen copies of one sentence.
 *
 * A fresh scaffold has a placeholder in every slot, so honest per-asset warnings
 * bury everything else. Identical messages collapse to a count, which says the
 * same thing and leaves the unique problems visible. The library still reports
 * them individually; this is presentation.
 */
export function issueLines(issues: readonly VerifyIssue[]): string[] {
  const groups = new Map<string, VerifyIssue[]>();
  for (const issue of issues) {
    const key = JSON.stringify([issue.severity, issue.message]);
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  const lines: string[] = [];
  for (const group of groups.values()) {
    const [first] = group;
    const label = first.severity === 'error' ? red('error  ') : yellow('warning');
    if (group.length <= 3) {
      for (const issue of group) lines.push(`  ${label} ${issue.path} ${dim(issue.message)}`);
      continue;
    }
    const names = group.map((issue) => issue.path.replace(/^assets\./, ''));
    lines.push(`  ${label} ${group.length}x ${dim(first.message)}`);
    lines.push(
      `          ${dim(names.slice(0, 8).join(', ') + (names.length > 8 ? `, +${names.length - 8} more` : ''))}`
    );
  }
  return lines;
}

export const countErrors = (issues: readonly VerifyIssue[]): number =>
  issues.filter((issue) => issue.severity === 'error').length;

/**
 * What optimisation did to each image, and what it saved overall.
 *
 * Per asset, because an automatic lossy re-encode is something an author is
 * entitled to see itemised rather than inferred from a smaller file: the source
 * format, the before and after bytes, and the quality used.
 */
export function optimizationLines(
  reports: readonly {
    id: string;
    fromPath: string;
    fromFormat: string;
    fromBytes: number;
    toPath?: string;
    toBytes?: number;
    quality?: number;
    skipped?: string;
    digestRewritten?: boolean;
  }[]
): string[] {
  if (!reports.length) return [];
  const converted = reports.filter((report) => report.toBytes !== undefined);
  const lines: string[] = [];

  for (const report of reports) {
    if (report.toBytes === undefined) {
      lines.push(`  ${dim('kept')}      ${report.id.padEnd(16)} ${dim(report.skipped ?? '')}`);
      continue;
    }
    const percent = Math.round((100 * report.toBytes) / report.fromBytes);
    lines.push(
      `  ${green('webp')}      ${report.id.padEnd(16)} ` +
        `${report.fromFormat} ${size(report.fromBytes)} -> ${size(report.toBytes)} ` +
        dim(`(${percent}%, q${report.quality})`) +
        (report.digestRewritten ? dim(' sha256 rewritten') : '')
    );
  }

  if (converted.length) {
    const before = converted.reduce((total, report) => total + report.fromBytes, 0);
    const after = converted.reduce((total, report) => total + (report.toBytes ?? 0), 0);
    lines.push(
      dim(
        `  ${converted.length} image(s) optimised: ${size(before)} -> ${size(after)} ` +
          `(${Math.round((100 * after) / before)}%)`
      )
    );
  }
  return lines;
}

/** How much of the translucency slider a floor leaves, in words. */
export function travel(floor: number): string {
  const points = Math.round((1 - floor) * 100);
  const phrase = `${points} point${points === 1 ? '' : 's'} of travel`;
  if (points === 0) return red('no translucency possible');
  return points < 10 ? yellow(`only ${phrase}`) : green(phrase);
}
