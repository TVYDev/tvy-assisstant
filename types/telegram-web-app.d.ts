export {};

type TelegramColorScheme = "light" | "dark";

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
}

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebAppInitDataUnsafe {
  query_id?: string;
  user?: TelegramWebAppUser;
  auth_date?: number;
  hash?: string;
}

interface TelegramHapticFeedback {
  impactOccurred(
    style: "light" | "medium" | "heavy" | "rigid" | "soft",
  ): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

interface TelegramBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface TelegramContentSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

declare global {
  interface TelegramWebApp {
    initData: string;
    initDataUnsafe: TelegramWebAppInitDataUnsafe;
    colorScheme: TelegramColorScheme;
    themeParams: TelegramThemeParams;
    ready(): void;
    expand(): void;
    close(): void;
    setHeaderColor(color: string): void;
    setBackgroundColor(color: string): void;
    setBottomBarColor?(color: string): void;
    HapticFeedback: TelegramHapticFeedback;
    BackButton: TelegramBackButton;
    contentSafeAreaInset?: TelegramContentSafeAreaInset;
    safeAreaInset?: TelegramContentSafeAreaInset;
  }

  interface TelegramNamespace {
    WebApp: TelegramWebApp;
  }

  interface Window {
    Telegram?: TelegramNamespace;
  }
}
