import { CampusExchangeApiClient } from "@campus-exchange/api-client";
import { analyticsEvents } from "@campus-exchange/analytics";
import { darkTheme, lightTheme, primitives } from "@campus-exchange/design-tokens";
import { searchQuery } from "@campus-exchange/validation";

export const mobileFoundation = {
  apiVersion: "v1",
  apiClient: CampusExchangeApiClient,
  analyticsEvents,
  themes: { light: lightTheme, dark: darkTheme },
  primitives,
  validation: { searchQuery },
} as const;
