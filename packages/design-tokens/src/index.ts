export const primitives = {
  color: {
    pine950: "#10241c", pine900: "#173528", pine800: "#214f3d", pine700: "#2f6b51", pine500: "#4f9a73", pine300: "#8fd1ad", pine100: "#dcefe4",
    stone950: "#18201c", stone700: "#4e5c54", stone500: "#718078", stone300: "#b8c0bb", stone200: "#d9dedb", stone100: "#edf0ee", stone50: "#f7f8f7",
    white: "#ffffff", canvas: "#f7f4ed", paper: "#fffdfa", lime: "#d9efb1", peach: "#f4c8ad", coral: "#e97758", lilac: "#d9c9f1", blue: "#c9dced",
    red700: "#9f332b", red100: "#f9dfdc", amber700: "#7a5415", amber100: "#fff0cf", blue700: "#285f87", blue100: "#ddecf7",
  },
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, "2xl": 28, "3xl": 36, "4xl": 48, display: 64 },
  lineHeight: { tight: 1.1, snug: 1.25, normal: 1.5, relaxed: 1.7 },
  radius: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, full: 9999 },
  shadow: { sm: "0 2px 10px rgba(16,36,28,.06)", md: "0 12px 32px rgba(16,36,28,.10)", lg: "0 24px 64px rgba(16,36,28,.16)" },
  breakpoint: { sm: 480, md: 768, lg: 1024, xl: 1280, "2xl": 1536 },
  duration: { instant: 0, fast: 120, normal: 200, slow: 320 },
  easing: { standard: "cubic-bezier(.2,.8,.2,1)", enter: "cubic-bezier(0,0,.2,1)", exit: "cubic-bezier(.4,0,1,1)" },
  zIndex: { base: 0, sticky: 20, navigation: 30, dropdown: 50, overlay: 70, modal: 80, toast: 90, tooltip: 100 },
} as const;

export const lightTheme = {
  canvas: primitives.color.canvas,
  surface: primitives.color.paper,
  surfaceRaised: primitives.color.white,
  text: primitives.color.stone950,
  textMuted: primitives.color.stone700,
  border: primitives.color.stone200,
  brand: primitives.color.pine800,
  brandHover: primitives.color.pine700,
  brandSoft: primitives.color.pine100,
  focus: primitives.color.blue700,
  danger: primitives.color.red700,
  dangerSoft: primitives.color.red100,
  warning: primitives.color.amber700,
  warningSoft: primitives.color.amber100,
} as const;

export const darkTheme = {
  canvas: "#0f1512",
  surface: "#17201b",
  surfaceRaised: "#1d2922",
  text: "#edf4ef",
  textMuted: "#a8b5ae",
  border: "#34423a",
  brand: "#70c49a",
  brandHover: "#8ad5ad",
  brandSoft: "#233c2e",
  focus: "#8bc7ef",
  danger: "#ee847b",
  dangerSoft: "#4a2926",
  warning: "#f2c76d",
  warningSoft: "#44381f",
} as const;

export type ThemeTokens = { [Key in keyof typeof lightTheme]: string };

export function cssThemeVariables(theme: ThemeTokens): Record<`--ce-${string}`, string> {
  return Object.fromEntries(Object.entries(theme).map(([key, value]) => [`--ce-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value])) as Record<`--ce-${string}`, string>;
}
