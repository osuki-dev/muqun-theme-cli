/**
 * A complete seed, not a reference to a built-in theme.
 *
 * The app derives this at runtime from its own `osuki` pack, which lives behind
 * the app's theme registry and pulls the whole UI colour library in with it.
 * None of that is portable, and none of it is interesting to an author: the only
 * thing that matters is that these bytes are a valid manifest which already
 * clears the contrast gate at full opacity.
 *
 * So the app's output is snapshotted here, verbatim, as text. Regenerate with
 * the app checked out:
 *
 *   bun -e "import {createThemeStarter} from '@/theme/authoring';
 *            import {formatThemeJson} from '@/theme/format-json';
 *            console.log(formatThemeJson(JSON.stringify(createThemeStarter())))"
 *
 * `__tests__/schema.test.ts` pins the properties that make the claim above true, so an
 * edit that quietly breaks the gate fails a test rather than shipping a starter
 * an author cannot apply.
 */
export const THEME_STARTER_JSON = `{
  "format": "muqun-theme",
  "schemaVersion": 1,
  "id": "my-theme",
  "name": "My theme",
  "version": "1.0.0",
  "variants": {
    "light": {
      "colors": {
        "background": "#F7F3EC",
        "surface": "#FFFFFF",
        "surfaceRaised": "#ECE7DF",
        "border": "#E0DAD1",
        "borderStrong": "#C2B9AE",
        "text": "#050B12",
        "textMuted": "#5D6679",
        "textSubtle": "#5A6272",
        "textDisabled": "#A7ADB8",
        "primary": "#A62A18",
        "onPrimary": "#FFFFFF",
        "primarySubtle": "#A62A180F",
        "danger": "#9E1F14",
        "dangerSubtle": "#9E1F140F",
        "success": "#177A53",
        "warning": "#8A5710",
        "info": "#3E63FF"
      },
      "terminal": {
        "background": "#F7F3EC",
        "foreground": "#050B12",
        "cursor": "#C54337",
        "link": "#3455DC",
        "selection": "#FF5A4A24",
        "ansi": [
          "#050B12",
          "#D93025",
          "#027A48",
          "#B54708",
          "#3538CD",
          "#6941C6",
          "#0E7090",
          "#475467",
          "#6A7281",
          "#B42318",
          "#027A48",
          "#B54708",
          "#3E63FF",
          "#7F56D9",
          "#0E7090",
          "#050B12"
        ]
      }
    },
    "dark": {
      "colors": {
        "background": "#050B12",
        "surface": "#0B111A",
        "surfaceRaised": "#131B26",
        "border": "#1C2532",
        "borderStrong": "#2E3A4A",
        "text": "#FCFBFA",
        "textMuted": "#B6BDC8",
        "textSubtle": "#8B95A5",
        "textDisabled": "#6B7585",
        "primary": "#FF5A4A",
        "onPrimary": "#050B12",
        "primarySubtle": "#FF5A4A1F",
        "danger": "#F2554A",
        "dangerSubtle": "#F2554A14",
        "success": "#34C08B",
        "warning": "#F0A93C",
        "info": "#6B87FF"
      },
      "terminal": {
        "background": "#08111B",
        "foreground": "#D8E1EA",
        "cursor": "#FF5A4A",
        "link": "#A4BCFD",
        "selection": "#FF5A4A3D",
        "ansi": [
          "#0C121A",
          "#F2554A",
          "#34C08B",
          "#F0A93C",
          "#7DA2FF",
          "#C7A0FF",
          "#67E3F9",
          "#B6BDC8",
          "#6B7585",
          "#FDA29B",
          "#6CE9A6",
          "#FEC84B",
          "#A4BCFD",
          "#D6BBFB",
          "#A5F0FC",
          "#FCFBFA"
        ]
      }
    }
  }
}`;
