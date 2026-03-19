import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";

const POLL_INTERVAL_MS = 700;
const SEARCH_DEBOUNCE_MS = 130;
const FILTER_SEARCH_DEBOUNCE_MS = 320;
const SEARCH_LIMIT = 200;
const SEARCH_LIMIT_MIN = SEARCH_LIMIT;
const SEARCH_LIMIT_MAX = 5000;
const PREVIEW_PREFETCH_LIMIT = 40;
const DUPLICATE_CANCEL_MESSAGE = "Duplicate scan cancelled.";
const DUPLICATE_NOTICE_TIMEOUT_MS = 2400;

type IndexStatus = {
  indexing: boolean;
  ready: boolean;
  indexedCount: number;
  lastError?: string | null;
};

type SearchResult = {
  name: string;
  path: string;
  extension: string;
  size: number;
  createdUnix: number;
  modifiedUnix: number;
  isDirectory: boolean;
};

type DuplicateFile = {
  name: string;
  path: string;
  size: number;
  createdUnix: number;
  modifiedUnix: number;
};

type DuplicateGroup = {
  groupId: string;
  size: number;
  totalBytes: number;
  fileCount: number;
  files: DuplicateFile[];
};

type DuplicateScanStatus = {
  running: boolean;
  cancelRequested: boolean;
  scannedFiles: number;
  totalFiles: number;
  groupsFound: number;
  progressPercent: number;
};

type DuplicateDeleteCandidate = {
  groupId: string;
  path: string;
  name: string;
  size: number;
};

type DriveInfo = {
  letter: string;
  path: string;
  filesystem: string;
  driveType: string;
  isNtfs: boolean;
  canOpenVolume: boolean;
};

type SocialIconName = "github" | "linkedin" | "telegram";

type SocialLink = {
  label: string;
  url: string;
  icon: SocialIconName;
};

type ActiveTab = "search" | "duplicates" | "advanced" | "about";
type ResultViewTab = "all" | "apps" | "media" | "docs" | "archives";
type ResultSortMode = "relevance" | "newest" | "largest" | "name";
type ThemeMode = "dark" | "light";
type PreviewKind = "image" | "video" | "pdf" | "none";
const THEME_PRESET_IDS = ["slate", "nordic", "aurora", "ember", "cedar", "solar"] as const;
type ThemePresetId = (typeof THEME_PRESET_IDS)[number];
type ThemeVariableSet = Record<string, string>;
type ThemePreviewSwatch = {
  bg: string;
  panel: string;
  panelAlt: string;
  accent: string;
  text: string;
  muted: string;
  glow: string;
};
type ThemePreset = {
  id: ThemePresetId;
  label: string;
  description: string;
  dark: ThemeVariableSet;
  light: ThemeVariableSet;
  preview: {
    dark: ThemePreviewSwatch;
    light: ThemePreviewSwatch;
  };
};

const DEVELOPER_NAME = "Eyuel Engida";
const THEME_STORAGE_KEY = "omnisearch_theme_mode";
const THEME_PRESET_STORAGE_KEY = "omnisearch_theme_preset";
const PREVIEW_STORAGE_KEY = "omnisearch_show_previews";
const INCLUDE_FOLDERS_STORAGE_KEY = "omnisearch_include_folders";
const INCLUDE_ALL_DRIVES_STORAGE_KEY = "omnisearch_include_all_drives";
const SEARCH_LIMIT_STORAGE_KEY = "omnisearch_search_limit";
const THEME_PRESETS: ThemePreset[] = [
  {
    id: "aurora",
    label: "Aurora",
    description: "The blue-green OmniSearch look.",
    dark: {
      "--bg-deep": "#07090f",
      "--bg-mid": "#0d1322",
      "--panel": "rgba(13, 18, 33, 0.82)",
      "--panel-border": "rgba(124, 141, 182, 0.28)",
      "--text-main": "#edf2ff",
      "--text-muted": "#9ea8c4",
      "--accent": "#59d8a1",
      "--danger": "#ff7575",
      "--body-glow-a": "rgba(41, 116, 255, 0.22)",
      "--body-glow-b": "rgba(86, 212, 153, 0.15)",
      "--panel-shadow": "0 28px 76px rgba(0, 0, 0, 0.5)",
      "--surface-elevated": "rgba(9, 13, 26, 0.78)",
      "--surface-strong": "rgba(12, 17, 30, 0.9)",
      "--surface-input": "rgba(8, 11, 21, 0.92)",
      "--surface-muted": "rgba(8, 10, 18, 0.78)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(11, 15, 27, 0.9), rgba(9, 13, 22, 0.78))",
      "--border-soft": "rgba(136, 151, 183, 0.32)",
      "--border-strong": "rgba(124, 141, 182, 0.38)",
      "--text-soft-contrast": "#b7c8ea",
      "--highlight-bg": "rgba(89, 216, 161, 0.22)",
      "--highlight-text": "#d8fff1",
      "--result-hover": "rgba(77, 143, 224, 0.1)",
    },
    light: {
      "--bg-deep": "#eef4ff",
      "--bg-mid": "#d8e6fb",
      "--panel": "rgba(248, 252, 255, 0.93)",
      "--panel-border": "rgba(124, 141, 182, 0.44)",
      "--text-main": "#1b2c47",
      "--text-muted": "#587096",
      "--accent": "#2f9d73",
      "--danger": "#b53d3d",
      "--body-glow-a": "rgba(58, 124, 227, 0.24)",
      "--body-glow-b": "rgba(71, 190, 150, 0.2)",
      "--panel-shadow": "0 24px 58px rgba(78, 108, 156, 0.24)",
      "--surface-elevated": "rgba(228, 236, 252, 0.84)",
      "--surface-strong": "rgba(241, 246, 255, 0.95)",
      "--surface-input": "rgba(246, 250, 255, 0.97)",
      "--surface-muted": "rgba(236, 243, 255, 0.9)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(228, 236, 252, 0.95), rgba(236, 243, 255, 0.88))",
      "--border-soft": "rgba(114, 139, 185, 0.34)",
      "--border-strong": "rgba(104, 129, 177, 0.42)",
      "--text-soft-contrast": "#38547c",
      "--highlight-bg": "rgba(57, 151, 115, 0.2)",
      "--highlight-text": "#123a2e",
      "--result-hover": "rgba(91, 135, 214, 0.12)",
    },
    preview: {
      dark: {
        bg: "#0b1120",
        panel: "#172137",
        panelAlt: "#11192c",
        accent: "#59d8a1",
        text: "#edf2ff",
        muted: "#90a5c8",
        glow: "rgba(89, 216, 161, 0.24)",
      },
      light: {
        bg: "#eaf3ff",
        panel: "#f8fbff",
        panelAlt: "#dbe8f8",
        accent: "#2f9d73",
        text: "#1b2c47",
        muted: "#5f789b",
        glow: "rgba(47, 157, 115, 0.18)",
      },
    },
  },
  {
    id: "nordic",
    label: "Nordic Ink",
    description: "Deep navy with cool aqua edges.",
    dark: {
      "--bg-deep": "#0b1620",
      "--bg-mid": "#162635",
      "--panel": "rgba(17, 31, 45, 0.84)",
      "--panel-border": "rgba(121, 160, 177, 0.28)",
      "--text-main": "#ebf7ff",
      "--text-muted": "#97b4c4",
      "--accent": "#56c7ce",
      "--danger": "#ff8a88",
      "--body-glow-a": "rgba(59, 132, 180, 0.2)",
      "--body-glow-b": "rgba(86, 199, 187, 0.18)",
      "--panel-shadow": "0 28px 76px rgba(0, 0, 0, 0.46)",
      "--surface-elevated": "rgba(12, 24, 36, 0.78)",
      "--surface-strong": "rgba(16, 30, 43, 0.91)",
      "--surface-input": "rgba(10, 21, 32, 0.94)",
      "--surface-muted": "rgba(9, 20, 30, 0.82)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(15, 30, 43, 0.92), rgba(10, 20, 30, 0.8))",
      "--border-soft": "rgba(120, 154, 169, 0.3)",
      "--border-strong": "rgba(112, 160, 176, 0.38)",
      "--text-soft-contrast": "#c1e7ef",
      "--highlight-bg": "rgba(86, 199, 206, 0.22)",
      "--highlight-text": "#d8ffff",
      "--result-hover": "rgba(79, 172, 188, 0.11)",
    },
    light: {
      "--bg-deep": "#eef7fb",
      "--bg-mid": "#d9ebf3",
      "--panel": "rgba(248, 252, 255, 0.94)",
      "--panel-border": "rgba(111, 145, 162, 0.36)",
      "--text-main": "#173141",
      "--text-muted": "#567387",
      "--accent": "#2c99a6",
      "--danger": "#b84a4a",
      "--body-glow-a": "rgba(86, 160, 194, 0.22)",
      "--body-glow-b": "rgba(93, 197, 184, 0.18)",
      "--panel-shadow": "0 24px 58px rgba(73, 106, 124, 0.2)",
      "--surface-elevated": "rgba(229, 241, 247, 0.88)",
      "--surface-strong": "rgba(243, 249, 252, 0.96)",
      "--surface-input": "rgba(248, 252, 254, 0.97)",
      "--surface-muted": "rgba(235, 245, 249, 0.92)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(230, 240, 246, 0.96), rgba(238, 247, 251, 0.9))",
      "--border-soft": "rgba(108, 142, 156, 0.28)",
      "--border-strong": "rgba(100, 145, 162, 0.36)",
      "--text-soft-contrast": "#355f76",
      "--highlight-bg": "rgba(44, 153, 166, 0.18)",
      "--highlight-text": "#103640",
      "--result-hover": "rgba(74, 158, 177, 0.12)",
    },
    preview: {
      dark: {
        bg: "#11202d",
        panel: "#1a3043",
        panelAlt: "#152537",
        accent: "#56c7ce",
        text: "#ecf8ff",
        muted: "#8faab8",
        glow: "rgba(86, 199, 206, 0.24)",
      },
      light: {
        bg: "#eff8fb",
        panel: "#f9fdff",
        panelAlt: "#d8eaf1",
        accent: "#2c99a6",
        text: "#173141",
        muted: "#567387",
        glow: "rgba(44, 153, 166, 0.18)",
      },
    },
  },
  {
    id: "slate",
    label: "Win Slate",
    description: "A calm Windows 11-style steel palette.",
    dark: {
      "--bg-deep": "#171b22",
      "--bg-mid": "#262b32",
      "--panel": "rgba(31, 36, 44, 0.86)",
      "--panel-border": "rgba(136, 149, 171, 0.26)",
      "--text-main": "#f1f5fb",
      "--text-muted": "#aab4c6",
      "--accent": "#7ab3ff",
      "--danger": "#ff7c86",
      "--body-glow-a": "rgba(86, 123, 184, 0.18)",
      "--body-glow-b": "rgba(122, 179, 255, 0.16)",
      "--panel-shadow": "0 28px 76px rgba(0, 0, 0, 0.44)",
      "--surface-elevated": "rgba(28, 34, 42, 0.8)",
      "--surface-strong": "rgba(34, 40, 49, 0.92)",
      "--surface-input": "rgba(23, 28, 36, 0.95)",
      "--surface-muted": "rgba(24, 29, 37, 0.84)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(34, 40, 49, 0.92), rgba(25, 30, 38, 0.8))",
      "--border-soft": "rgba(137, 150, 170, 0.28)",
      "--border-strong": "rgba(131, 148, 173, 0.36)",
      "--text-soft-contrast": "#cdd9ee",
      "--highlight-bg": "rgba(122, 179, 255, 0.2)",
      "--highlight-text": "#eef6ff",
      "--result-hover": "rgba(122, 179, 255, 0.1)",
    },
    light: {
      "--bg-deep": "#f0f3f7",
      "--bg-mid": "#dfe5ed",
      "--panel": "rgba(250, 252, 255, 0.95)",
      "--panel-border": "rgba(126, 138, 157, 0.34)",
      "--text-main": "#1f2835",
      "--text-muted": "#657385",
      "--accent": "#3a82e6",
      "--danger": "#b44752",
      "--body-glow-a": "rgba(93, 127, 189, 0.18)",
      "--body-glow-b": "rgba(118, 171, 245, 0.16)",
      "--panel-shadow": "0 24px 58px rgba(72, 85, 107, 0.18)",
      "--surface-elevated": "rgba(232, 238, 245, 0.9)",
      "--surface-strong": "rgba(244, 247, 251, 0.96)",
      "--surface-input": "rgba(248, 250, 253, 0.98)",
      "--surface-muted": "rgba(237, 242, 247, 0.92)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(232, 237, 244, 0.96), rgba(241, 245, 250, 0.9))",
      "--border-soft": "rgba(120, 132, 150, 0.28)",
      "--border-strong": "rgba(115, 128, 147, 0.34)",
      "--text-soft-contrast": "#495c73",
      "--highlight-bg": "rgba(58, 130, 230, 0.18)",
      "--highlight-text": "#0f2448",
      "--result-hover": "rgba(87, 146, 230, 0.11)",
    },
    preview: {
      dark: {
        bg: "#1d222a",
        panel: "#2a313b",
        panelAlt: "#212831",
        accent: "#7ab3ff",
        text: "#f1f5fb",
        muted: "#aab4c6",
        glow: "rgba(122, 179, 255, 0.22)",
      },
      light: {
        bg: "#eff3f7",
        panel: "#fbfcfe",
        panelAlt: "#dde4ec",
        accent: "#3a82e6",
        text: "#1f2835",
        muted: "#657385",
        glow: "rgba(58, 130, 230, 0.16)",
      },
    },
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm copper highlights over dark charcoal.",
    dark: {
      "--bg-deep": "#160f10",
      "--bg-mid": "#2a1d21",
      "--panel": "rgba(33, 23, 27, 0.86)",
      "--panel-border": "rgba(190, 127, 94, 0.24)",
      "--text-main": "#fff1ea",
      "--text-muted": "#d2a894",
      "--accent": "#ff9b62",
      "--danger": "#ff6f78",
      "--body-glow-a": "rgba(242, 131, 82, 0.2)",
      "--body-glow-b": "rgba(255, 176, 85, 0.14)",
      "--panel-shadow": "0 28px 76px rgba(0, 0, 0, 0.46)",
      "--surface-elevated": "rgba(28, 19, 23, 0.8)",
      "--surface-strong": "rgba(36, 24, 28, 0.92)",
      "--surface-input": "rgba(23, 16, 18, 0.95)",
      "--surface-muted": "rgba(27, 17, 20, 0.84)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(35, 24, 28, 0.92), rgba(23, 16, 19, 0.8))",
      "--border-soft": "rgba(176, 122, 98, 0.28)",
      "--border-strong": "rgba(195, 130, 96, 0.36)",
      "--text-soft-contrast": "#ffd0bc",
      "--highlight-bg": "rgba(255, 155, 98, 0.22)",
      "--highlight-text": "#fff5ef",
      "--result-hover": "rgba(255, 155, 98, 0.1)",
    },
    light: {
      "--bg-deep": "#fff3eb",
      "--bg-mid": "#f7dfd2",
      "--panel": "rgba(255, 250, 247, 0.95)",
      "--panel-border": "rgba(195, 137, 105, 0.3)",
      "--text-main": "#45231d",
      "--text-muted": "#936556",
      "--accent": "#d66c37",
      "--danger": "#b33d46",
      "--body-glow-a": "rgba(229, 132, 83, 0.2)",
      "--body-glow-b": "rgba(255, 186, 91, 0.16)",
      "--panel-shadow": "0 24px 58px rgba(133, 89, 67, 0.18)",
      "--surface-elevated": "rgba(249, 233, 224, 0.9)",
      "--surface-strong": "rgba(255, 247, 242, 0.97)",
      "--surface-input": "rgba(255, 251, 248, 0.98)",
      "--surface-muted": "rgba(251, 240, 233, 0.92)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(249, 233, 224, 0.96), rgba(253, 244, 238, 0.9))",
      "--border-soft": "rgba(188, 132, 101, 0.28)",
      "--border-strong": "rgba(178, 126, 98, 0.34)",
      "--text-soft-contrast": "#8a4f3d",
      "--highlight-bg": "rgba(214, 108, 55, 0.18)",
      "--highlight-text": "#4b2418",
      "--result-hover": "rgba(214, 108, 55, 0.1)",
    },
    preview: {
      dark: {
        bg: "#1b1416",
        panel: "#332227",
        panelAlt: "#281b1f",
        accent: "#ff9b62",
        text: "#fff1ea",
        muted: "#d1a693",
        glow: "rgba(255, 155, 98, 0.24)",
      },
      light: {
        bg: "#fff4ec",
        panel: "#fffaf6",
        panelAlt: "#f4dfd2",
        accent: "#d66c37",
        text: "#45231d",
        muted: "#936556",
        glow: "rgba(214, 108, 55, 0.18)",
      },
    },
  },
  {
    id: "cedar",
    label: "Cedar",
    description: "Calm workstation green with softer contrast.",
    dark: {
      "--bg-deep": "#09110f",
      "--bg-mid": "#14241d",
      "--panel": "rgba(15, 25, 22, 0.84)",
      "--panel-border": "rgba(112, 162, 129, 0.24)",
      "--text-main": "#eefcf5",
      "--text-muted": "#96b7a6",
      "--accent": "#67d69a",
      "--danger": "#ff7d8e",
      "--body-glow-a": "rgba(70, 158, 122, 0.18)",
      "--body-glow-b": "rgba(120, 220, 171, 0.16)",
      "--panel-shadow": "0 28px 76px rgba(0, 0, 0, 0.46)",
      "--surface-elevated": "rgba(11, 20, 17, 0.8)",
      "--surface-strong": "rgba(15, 27, 22, 0.92)",
      "--surface-input": "rgba(8, 18, 14, 0.95)",
      "--surface-muted": "rgba(10, 18, 15, 0.84)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(15, 27, 22, 0.92), rgba(9, 17, 14, 0.8))",
      "--border-soft": "rgba(117, 161, 134, 0.28)",
      "--border-strong": "rgba(114, 170, 135, 0.36)",
      "--text-soft-contrast": "#c4efd9",
      "--highlight-bg": "rgba(103, 214, 154, 0.2)",
      "--highlight-text": "#effff5",
      "--result-hover": "rgba(103, 214, 154, 0.1)",
    },
    light: {
      "--bg-deep": "#eff7f1",
      "--bg-mid": "#dcebdd",
      "--panel": "rgba(249, 253, 249, 0.95)",
      "--panel-border": "rgba(108, 148, 122, 0.32)",
      "--text-main": "#1d3428",
      "--text-muted": "#5d7e6e",
      "--accent": "#31965f",
      "--danger": "#b24454",
      "--body-glow-a": "rgba(66, 155, 117, 0.18)",
      "--body-glow-b": "rgba(109, 209, 161, 0.16)",
      "--panel-shadow": "0 24px 58px rgba(80, 111, 93, 0.18)",
      "--surface-elevated": "rgba(232, 241, 232, 0.9)",
      "--surface-strong": "rgba(246, 250, 246, 0.97)",
      "--surface-input": "rgba(250, 252, 250, 0.98)",
      "--surface-muted": "rgba(239, 245, 239, 0.92)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(232, 241, 232, 0.96), rgba(241, 247, 241, 0.9))",
      "--border-soft": "rgba(111, 148, 123, 0.28)",
      "--border-strong": "rgba(104, 141, 118, 0.34)",
      "--text-soft-contrast": "#426856",
      "--highlight-bg": "rgba(49, 150, 95, 0.18)",
      "--highlight-text": "#123322",
      "--result-hover": "rgba(73, 164, 111, 0.1)",
    },
    preview: {
      dark: {
        bg: "#0f1b17",
        panel: "#193027",
        panelAlt: "#12231c",
        accent: "#67d69a",
        text: "#eefcf5",
        muted: "#96b7a6",
        glow: "rgba(103, 214, 154, 0.22)",
      },
      light: {
        bg: "#eff7f1",
        panel: "#fbfefb",
        panelAlt: "#dcebdd",
        accent: "#31965f",
        text: "#1d3428",
        muted: "#5d7e6e",
        glow: "rgba(49, 150, 95, 0.16)",
      },
    },
  },
  {
    id: "solar",
    label: "Solar Sand",
    description: "Warm sandstone tones with gold accents.",
    dark: {
      "--bg-deep": "#15120b",
      "--bg-mid": "#2a2417",
      "--panel": "rgba(32, 27, 18, 0.85)",
      "--panel-border": "rgba(180, 150, 94, 0.24)",
      "--text-main": "#fff7e6",
      "--text-muted": "#d3bf95",
      "--accent": "#e8c15a",
      "--danger": "#ff7f78",
      "--body-glow-a": "rgba(212, 164, 70, 0.18)",
      "--body-glow-b": "rgba(244, 214, 115, 0.14)",
      "--panel-shadow": "0 28px 76px rgba(0, 0, 0, 0.46)",
      "--surface-elevated": "rgba(23, 19, 12, 0.8)",
      "--surface-strong": "rgba(31, 26, 17, 0.92)",
      "--surface-input": "rgba(19, 16, 10, 0.95)",
      "--surface-muted": "rgba(22, 18, 11, 0.84)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(31, 26, 17, 0.92), rgba(20, 17, 10, 0.8))",
      "--border-soft": "rgba(173, 148, 96, 0.28)",
      "--border-strong": "rgba(187, 157, 92, 0.36)",
      "--text-soft-contrast": "#f5ddb0",
      "--highlight-bg": "rgba(232, 193, 90, 0.2)",
      "--highlight-text": "#fff8ea",
      "--result-hover": "rgba(232, 193, 90, 0.1)",
    },
    light: {
      "--bg-deep": "#fbf5e7",
      "--bg-mid": "#efe2be",
      "--panel": "rgba(255, 253, 248, 0.95)",
      "--panel-border": "rgba(172, 147, 95, 0.3)",
      "--text-main": "#44351a",
      "--text-muted": "#8c7751",
      "--accent": "#b88f1f",
      "--danger": "#b3453f",
      "--body-glow-a": "rgba(201, 160, 67, 0.18)",
      "--body-glow-b": "rgba(236, 204, 111, 0.14)",
      "--panel-shadow": "0 24px 58px rgba(121, 102, 61, 0.18)",
      "--surface-elevated": "rgba(245, 236, 213, 0.9)",
      "--surface-strong": "rgba(255, 251, 243, 0.97)",
      "--surface-input": "rgba(255, 253, 248, 0.98)",
      "--surface-muted": "rgba(248, 241, 223, 0.92)",
      "--surface-toolbar":
        "linear-gradient(180deg, rgba(245, 236, 213, 0.96), rgba(251, 246, 231, 0.9))",
      "--border-soft": "rgba(171, 145, 90, 0.28)",
      "--border-strong": "rgba(165, 140, 87, 0.34)",
      "--text-soft-contrast": "#7a6537",
      "--highlight-bg": "rgba(184, 143, 31, 0.18)",
      "--highlight-text": "#46340a",
      "--result-hover": "rgba(184, 143, 31, 0.1)",
    },
    preview: {
      dark: {
        bg: "#1c170e",
        panel: "#322919",
        panelAlt: "#251f13",
        accent: "#e8c15a",
        text: "#fff7e6",
        muted: "#d3bf95",
        glow: "rgba(232, 193, 90, 0.22)",
      },
      light: {
        bg: "#fbf4e5",
        panel: "#fffdf8",
        panelAlt: "#ede1bf",
        accent: "#b88f1f",
        text: "#44351a",
        muted: "#8c7751",
        glow: "rgba(184, 143, 31, 0.18)",
      },
    },
  },
];
const RESULT_VIEW_TABS: Array<{ id: ResultViewTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "apps", label: "Apps" },
  { id: "media", label: "Media" },
  { id: "docs", label: "Docs" },
  { id: "archives", label: "Archives" },
];

const APP_EXTENSIONS = new Set([
  "exe",
  "msi",
  "bat",
  "cmd",
  "com",
  "ps1",
  "lnk",
  "appx",
]);

const MEDIA_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "mp4",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "webm",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "webp",
]);

const DOC_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "md",
  "rtf",
  "csv",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "tsx",
  "rs",
  "cpp",
  "h",
  "py",
  "java",
]);

const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "iso"]);
const IMAGE_PREVIEW_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "webp",
  "ico",
]);
const VIDEO_PREVIEW_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "wmv", "webm", "m4v"]);

const SOCIAL_LINKS: SocialLink[] = [
  { label: "GitHub", url: "https://github.com/Eul45", icon: "github" },
  {
    label: "LinkedIn",
    url: "https://www.linkedin.com/in/eyuel-engida-77155a317",
    icon: "linkedin",
  },
  { label: "Telegram", url: "https://t.me/Eul_zzz", icon: "telegram" },
];

function SocialIcon({ icon }: { icon: SocialIconName }) {
  if (icon === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 .297a12 12 0 0 0-3.79 23.4c.6.113.82-.258.82-.577 0-.285-.01-1.04-.016-2.04-3.338.724-4.043-1.61-4.043-1.61-.545-1.385-1.332-1.754-1.332-1.754-1.09-.744.084-.729.084-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.305-5.467-1.335-5.467-5.93 0-1.31.467-2.38 1.236-3.22-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 6.844c1.02.005 2.046.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.654 1.653.243 2.873.119 3.176.77.84 1.235 1.91 1.235 3.22 0 4.607-2.807 5.624-5.48 5.921.43.37.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576A12 12 0 0 0 12 .297Z" />
      </svg>
    );
  }

  if (icon === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.447 20.452H16.89V14.87c0-1.33-.027-3.04-1.852-3.04-1.853 0-2.136 1.445-2.136 2.94v5.682H9.34V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.268 2.37 4.268 5.455v6.286zM5.337 7.433a2.063 2.063 0 1 1 .002-4.126 2.063 2.063 0 0 1-.002 4.126zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771A1.75 1.75 0 0 0 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm5.255 8.599c-.162 1.703-.866 5.834-1.224 7.741-.151.807-.449 1.078-.737 1.104-.625.058-1.1-.413-1.706-.81-.949-.624-1.485-1.012-2.405-1.621-1.063-.699-.374-1.083.232-1.715.159-.166 2.91-2.666 2.963-2.895.006-.028.013-.133-.05-.189s-.156-.037-.223-.022c-.095.021-1.597 1.014-4.507 2.979-.427.294-.814.437-1.161.429-.382-.008-1.117-.216-1.664-.394-.67-.218-1.203-.334-1.157-.705.024-.193.291-.391.8-.593 3.132-1.364 5.221-2.264 6.268-2.699 2.986-1.242 3.607-1.458 4.011-1.465.088-.002.285.02.413.124.108.087.138.205.152.288.014.083.031.272.017.42z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M7 3.75v3.5M17 3.75v3.5M3.5 9.5h17M8 13h3M13 13h3M8 17h3" />
    </svg>
  );
}

function StepChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={direction === "up" ? "M3.5 10 8 5.5 12.5 10" : "M3.5 6 8 10.5 12.5 6"} />
    </svg>
  );
}

function openDateInputPicker(input: HTMLInputElement | null): void {
  if (!input) {
    return;
  }

  input.focus();
  try {
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }
  } catch {
    // Ignore and fall back to a normal click below.
  }

  input.click();
}

type NumberInputFieldProps = {
  id?: string;
  value: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
};

function NumberInputField({
  id,
  value,
  min,
  max,
  step = 1,
  placeholder,
  ariaLabel,
  onChange,
}: NumberInputFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const nudgeValue = (direction: "up" | "down") => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    if (direction === "up") {
      input.stepUp();
    } else {
      input.stepDown();
    }
    onChange(input.value);
  };

  return (
    <div className="number-input-shell">
      <input
        ref={inputRef}
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        inputMode="numeric"
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="number-input-steppers" aria-hidden="true">
        <button
          type="button"
          className="number-input-stepper"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            nudgeValue("up");
          }}
        >
          <StepChevronIcon direction="up" />
        </button>
        <button
          type="button"
          className="number-input-stepper"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            nudgeValue("down");
          }}
        >
          <StepChevronIcon direction="down" />
        </button>
      </div>
    </div>
  );
}

function toBytesFromMb(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.floor(parsed * 1024 * 1024);
}

function normalizeSearchLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return SEARCH_LIMIT;
  }
  return Math.min(SEARCH_LIMIT_MAX, Math.max(SEARCH_LIMIT_MIN, Math.floor(value)));
}

function toUnixStart(dateValue: string): number | undefined {
  if (!dateValue) {
    return undefined;
  }
  const unix = Date.parse(`${dateValue}T00:00:00`);
  if (Number.isNaN(unix)) {
    return undefined;
  }
  return Math.floor(unix / 1000);
}

function toUnixEnd(dateValue: string): number | undefined {
  if (!dateValue) {
    return undefined;
  }
  const unix = Date.parse(`${dateValue}T23:59:59`);
  if (Number.isNaN(unix)) {
    return undefined;
  }
  return Math.floor(unix / 1000);
}

function formatBytes(size: number): string {
  if (size <= 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex > 1 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatUnix(unixSeconds: number): string {
  if (unixSeconds <= 0) {
    return "-";
  }
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

function stripInvisibleText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function basenameFromPath(path: string): string {
  const normalized = path.replace(/\//g, "\\");
  const lastSlash = normalized.lastIndexOf("\\");
  if (lastSlash < 0 || lastSlash + 1 >= normalized.length) {
    return normalized.trim();
  }
  return normalized.slice(lastSlash + 1).trim();
}

function categoryFromExtension(extension: string): ResultViewTab {
  const ext = extension.trim().toLowerCase();
  if (!ext) {
    return "all";
  }
  if (APP_EXTENSIONS.has(ext)) {
    return "apps";
  }
  if (MEDIA_EXTENSIONS.has(ext)) {
    return "media";
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return "docs";
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return "archives";
  }
  return "all";
}

function rowKeyForResult(result: SearchResult): string {
  return `${result.path}:${result.modifiedUnix}`;
}

function normalizedExtension(result: SearchResult): string {
  if (result.isDirectory) {
    return "";
  }
  const ext = result.extension.trim().replace(/^\./, "").toLowerCase();
  if (ext) {
    return ext;
  }
  const dotIndex = result.name.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === result.name.length - 1) {
    return "";
  }
  return result.name.slice(dotIndex + 1).trim().toLowerCase();
}

function previewKindFromResult(result: SearchResult): PreviewKind {
  if (result.isDirectory) {
    return "none";
  }
  const ext = normalizedExtension(result);
  if (!ext) {
    return "none";
  }
  if (IMAGE_PREVIEW_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (VIDEO_PREVIEW_EXTENSIONS.has(ext)) {
    return "video";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  return "none";
}

function previewSrcFromPath(path: string): string {
  try {
    return convertFileSrc(path, "asset");
  } catch {
    return "";
  }
}

function fileUrlFromPath(path: string): string {
  try {
    const normalizedPath = path.replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalizedPath)) {
      const drive = normalizedPath.slice(0, 2);
      const rest = normalizedPath
        .slice(3)
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
      return `file:///${drive}/${rest}`;
    }
    if (normalizedPath.startsWith("//")) {
      const uncPath = normalizedPath
        .split("/")
        .filter((part) => part.length > 0)
        .map((part) => encodeURIComponent(part))
        .join("/");
      return `file:///${uncPath}`;
    }
    return "";
  } catch {
    return "";
  }
}

function previewSourcesFromPath(path: string): string[] {
  const candidates = [previewSrcFromPath(path), fileUrlFromPath(path)].filter(
    (value) => value.length > 0,
  );
  return [...new Set(candidates)];
}

function relevanceScore(result: SearchResult, queryValue: string): number {
  const query = queryValue.trim().toLowerCase();
  if (!query) {
    return 0;
  }

  const name = result.name.toLowerCase();
  const path = result.path.toLowerCase();

  if (name.startsWith(query)) {
    return 10_000 - name.length;
  }

  const nameIndex = name.indexOf(query);
  if (nameIndex >= 0) {
    return 7_000 - nameIndex;
  }

  const pathIndex = path.indexOf(query);
  if (pathIndex >= 0) {
    return 4_000 - pathIndex;
  }

  return 0;
}

function highlightMatch(text: string, queryValue: string): ReactNode {
  const query = queryValue.trim();
  if (!query) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (!lowerText.includes(lowerQuery)) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const nextIndex = lowerText.indexOf(lowerQuery, cursor);
    if (nextIndex === -1) {
      nodes.push(<span key={`t-${key}`}>{text.slice(cursor)}</span>);
      break;
    }

    if (nextIndex > cursor) {
      nodes.push(<span key={`t-${key}`}>{text.slice(cursor, nextIndex)}</span>);
      key += 1;
    }

    nodes.push(
      <mark className="match-highlight" key={`m-${key}`}>
        {text.slice(nextIndex, nextIndex + query.length)}
      </mark>,
    );
    key += 1;
    cursor = nextIndex + query.length;
  }

  return <>{nodes}</>;
}

function hasSelectedText(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const selection = window.getSelection();
  return Boolean(selection && selection.toString().trim().length > 0);
}

function isThemePresetId(value: string | null): value is ThemePresetId {
  return value !== null && THEME_PRESET_IDS.includes(value as ThemePresetId);
}

function themePresetById(id: ThemePresetId): ThemePreset {
  return (
    THEME_PRESETS.find((preset) => preset.id === id) ??
    THEME_PRESETS.find((preset) => preset.id === "slate") ??
    THEME_PRESETS[0]
  );
}

function themePreviewStyle(preview: ThemePreviewSwatch): CSSProperties {
  return {
    "--theme-preview-bg": preview.bg,
    "--theme-preview-panel": preview.panel,
    "--theme-preview-panel-alt": preview.panelAlt,
    "--theme-preview-accent": preview.accent,
    "--theme-preview-text": preview.text,
    "--theme-preview-muted": preview.muted,
    "--theme-preview-glow": preview.glow,
  } as CSSProperties;
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    return "dark";
  });
  const [themePreset, setThemePreset] = useState<ThemePresetId>(() => {
    if (typeof window === "undefined") {
      return "slate";
    }
    const saved = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
    if (isThemePresetId(saved)) {
      return saved;
    }
    return "slate";
  });
  const [status, setStatus] = useState<IndexStatus>({
    indexing: false,
    ready: false,
    indexedCount: 0,
    lastError: null,
  });
  const [indexSyncing, setIndexSyncing] = useState(false);
  const [appliedIndexConfigKey, setAppliedIndexConfigKey] = useState("");
  const [pendingIndexConfigKey, setPendingIndexConfigKey] = useState("");
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [driveError, setDriveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [extension, setExtension] = useState("");
  const [minSizeMb, setMinSizeMb] = useState("");
  const [maxSizeMb, setMaxSizeMb] = useState("");
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");
  const [duplicateMinSizeMb, setDuplicateMinSizeMb] = useState("50");
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicatesError, setDuplicatesError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [duplicateScanStatus, setDuplicateScanStatus] = useState<DuplicateScanStatus>({
    running: false,
    cancelRequested: false,
    scannedFiles: 0,
    totalFiles: 0,
    groupsFound: 0,
    progressPercent: 0,
  });
  const [duplicateDeleteCandidate, setDuplicateDeleteCandidate] =
    useState<DuplicateDeleteCandidate | null>(null);
  const [duplicateDeleteBusy, setDuplicateDeleteBusy] = useState(false);
  const [resultView, setResultView] = useState<ResultViewTab>("all");
  const [resultSort, setResultSort] = useState<ResultSortMode>("relevance");
  const [showPreviews, setShowPreviews] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const saved = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (saved === "0") {
      return false;
    }
    if (saved === "1") {
      return true;
    }
    return true;
  });
  const [includeFolders, setIncludeFolders] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(INCLUDE_FOLDERS_STORAGE_KEY) === "1";
  });
  const [includeAllDrives, setIncludeAllDrives] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(INCLUDE_ALL_DRIVES_STORAGE_KEY) === "1";
  });
  const [defaultSearchLimit, setDefaultSearchLimit] = useState<number>(() => {
    if (typeof window === "undefined") {
      return SEARCH_LIMIT;
    }
    const savedRaw = window.localStorage.getItem(SEARCH_LIMIT_STORAGE_KEY);
    if (!savedRaw) {
      return SEARCH_LIMIT;
    }
    const saved = Number(savedRaw);
    return normalizeSearchLimit(saved);
  });
  const [searchLimit, setSearchLimit] = useState<number>(defaultSearchLimit);
  const [searchLimitInput, setSearchLimitInput] = useState<string>(() =>
    String(defaultSearchLimit),
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [previewSourceState, setPreviewSourceState] = useState<Record<string, number>>({});
  const [previewReadyState, setPreviewReadyState] = useState<Record<string, true>>({});
  const [previewDataUrls, setPreviewDataUrls] = useState<Record<string, string>>({});
  const [appVersion, setAppVersion] = useState<string>("");
  const previousIndexedCountRef = useRef<number | null>(null);
  const indexSyncTimeoutRef = useRef<number | null>(null);
  const duplicateNoticeTimeoutRef = useRef<number | null>(null);
  const createdAfterInputRef = useRef<HTMLInputElement | null>(null);
  const createdBeforeInputRef = useRef<HTMLInputElement | null>(null);
  const activeThemePreset = themePresetById(themePreset);

  const hasFilters =
    extension.trim().length > 0 ||
    minSizeMb.trim().length > 0 ||
    maxSizeMb.trim().length > 0 ||
    createdAfter.length > 0 ||
    createdBefore.length > 0;
  const hasMetadataFilters =
    minSizeMb.trim().length > 0 ||
    maxSizeMb.trim().length > 0 ||
    createdAfter.length > 0 ||
    createdBefore.length > 0;

  const selectedDriveInfo = drives.find((drive) => drive.letter === selectedDrive);
  const hasAnyFallbackDrive = useMemo(
    () => drives.some((drive) => drive.isNtfs && !drive.canOpenVolume),
    [drives],
  );
  const isSelectedDriveFallback = Boolean(
    selectedDriveInfo && selectedDriveInfo.isNtfs && !selectedDriveInfo.canOpenVolume,
  );
  const isFallbackModeActive = includeAllDrives ? hasAnyFallbackDrive : isSelectedDriveFallback;
  const fallbackModeMessage = includeAllDrives
    ? "Running in fallback mode on one or more drives. Indexing still works, but it is slower and live updates are limited. Run OmniSearch as administrator for best performance."
    : "Running in fallback mode on this drive. Indexing still works, but it is slower and live updates are limited. Run OmniSearch as administrator for best performance.";
  const visibleStatusError =
    status.lastError && status.lastError.toLowerCase().includes(DUPLICATE_CANCEL_MESSAGE.toLowerCase())
      ? null
      : status.lastError;
  const trimmedQuery = query.trim();
  const requestedIndexConfigKey = includeAllDrives
    ? `ALL:${includeFolders ? "1" : "0"}`
    : selectedDrive
      ? `${selectedDrive}:${includeFolders ? "1" : "0"}`
      : "";

  const resultCounts = useMemo<Record<ResultViewTab, number>>(() => {
    const counts: Record<ResultViewTab, number> = {
      all: results.length,
      apps: 0,
      media: 0,
      docs: 0,
      archives: 0,
    };

    for (const result of results) {
      const category = categoryFromExtension(result.extension);
      if (category !== "all") {
        counts[category] += 1;
      }
    }

    return counts;
  }, [results]);

  const visibleResults = useMemo(() => {
    const filtered = results.filter((result) => {
      if (resultView === "all") {
        return true;
      }
      return categoryFromExtension(result.extension) === resultView;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (resultSort === "newest") {
        return right.modifiedUnix - left.modifiedUnix;
      }
      if (resultSort === "largest") {
        return right.size - left.size;
      }
      if (resultSort === "name") {
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }

      const rankDiff = relevanceScore(right, trimmedQuery) - relevanceScore(left, trimmedQuery);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? 1 : -1;
      }
      if (right.modifiedUnix !== left.modifiedUnix) {
        return right.modifiedUnix - left.modifiedUnix;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });

    return sorted;
  }, [results, resultView, resultSort, trimmedQuery]);

  const visibleTotalBytes = useMemo(
    () => visibleResults.reduce((sum, result) => sum + result.size, 0),
    [visibleResults],
  );

  const duplicateStats = useMemo(() => {
    let totalFiles = 0;
    let reclaimableBytes = 0;
    let listedFiles = 0;
    for (const group of duplicateGroups) {
      totalFiles += group.fileCount;
      listedFiles += group.files.length;
      reclaimableBytes += Math.max(0, group.fileCount - 1) * group.size;
    }
    return {
      groupCount: duplicateGroups.length,
      totalFiles,
      listedFiles,
      reclaimableBytes,
    };
  }, [duplicateGroups]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", themeMode);
    root.setAttribute("data-theme-preset", themePreset);
    const palette = activeThemePreset[themeMode];
    for (const [token, value] of Object.entries(palette)) {
      root.style.setProperty(token, value);
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, themePreset);
  }, [activeThemePreset, themeMode, themePreset]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.body.classList.add("app-boot-ready");
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove("app-boot-ready");
    };
  }, []);

  useEffect(() => {
    let active = true;
    getVersion()
      .then((version) => {
        if (active) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (active) {
          setAppVersion("unknown");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const suppressContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", suppressContextMenu, true);
    return () => {
      window.removeEventListener("contextmenu", suppressContextMenu, true);
    };
  }, []);

  useEffect(() => {
    const scrollContainers = Array.from(
      document.querySelectorAll<HTMLElement>(".scrollable-tab-panel"),
    );
    if (scrollContainers.length === 0) {
      return;
    }

    const timeouts = new Map<HTMLElement, number>();
    const listeners = scrollContainers.map((container) => {
      container.dataset.scrollState = "idle";
      const handleScroll = () => {
        container.dataset.scrollState = "active";
        const existingTimeout = timeouts.get(container);
        if (existingTimeout !== undefined) {
          window.clearTimeout(existingTimeout);
        }
        const timeout = window.setTimeout(() => {
          container.dataset.scrollState = "idle";
          timeouts.delete(container);
        }, 720);
        timeouts.set(container, timeout);
      };

      container.addEventListener("scroll", handleScroll, { passive: true });
      return { container, handleScroll };
    });

    return () => {
      for (const { container, handleScroll } of listeners) {
        container.removeEventListener("scroll", handleScroll);
        container.dataset.scrollState = "idle";
      }
      for (const timeout of timeouts.values()) {
        window.clearTimeout(timeout);
      }
    };
  }, [activeTab, duplicateGroups.length, results.length]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, showPreviews ? "1" : "0");
  }, [showPreviews]);

  useEffect(() => {
    window.localStorage.setItem(INCLUDE_FOLDERS_STORAGE_KEY, includeFolders ? "1" : "0");
  }, [includeFolders]);

  useEffect(() => {
    window.localStorage.setItem(INCLUDE_ALL_DRIVES_STORAGE_KEY, includeAllDrives ? "1" : "0");
  }, [includeAllDrives]);

  useEffect(() => {
    window.localStorage.setItem(SEARCH_LIMIT_STORAGE_KEY, String(defaultSearchLimit));
  }, [defaultSearchLimit]);

  useEffect(() => {
    setSearchLimitInput(String(defaultSearchLimit));
  }, [defaultSearchLimit]);

  useEffect(() => {
    setSearchLimit(defaultSearchLimit);
  }, [trimmedQuery, extension, minSizeMb, maxSizeMb, createdAfter, createdBefore, hasFilters, defaultSearchLimit]);

  useEffect(() => {
    setPreviewSourceState({});
    setPreviewReadyState({});
    setPreviewDataUrls({});
  }, [results, showPreviews]);

  useEffect(() => {
    if (!showPreviews || visibleResults.length === 0) {
      return;
    }

    const candidates = visibleResults
      .slice(0, PREVIEW_PREFETCH_LIMIT)
      .filter((result) => previewKindFromResult(result) !== "none");
    if (candidates.length === 0) {
      return;
    }

    const missing = candidates.filter((result) => !previewDataUrls[rowKeyForResult(result)]);
    if (missing.length === 0) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      for (const result of missing) {
        if (cancelled) {
          return;
        }
        try {
          const dataUrl = await invoke<string>("load_preview_data_url", { path: result.path });
          if (cancelled || !dataUrl || !dataUrl.startsWith("data:")) {
            continue;
          }
          const rowKey = rowKeyForResult(result);
          setPreviewDataUrls((previous) => {
            if (previous[rowKey]) {
              return previous;
            }
            return {
              ...previous,
              [rowKey]: dataUrl,
            };
          });
        } catch {
          // Ignore per-file preview generation failures; UI will fallback gracefully.
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [showPreviews, visibleResults, previewDataUrls]);

  useEffect(() => {
    let active = true;

    const loadDrives = async () => {
      try {
        const available = await invoke<DriveInfo[]>("list_drives");
        if (!active) {
          return;
        }
        setDrives(available);
        const preferred =
          available.find((drive) => drive.letter === "C" && drive.isNtfs && drive.canOpenVolume) ??
          available.find((drive) => drive.isNtfs && drive.canOpenVolume) ??
          available.find((drive) => drive.isNtfs) ??
          available[0];
        if (preferred) {
          setSelectedDrive(preferred.letter);
          setDriveError(null);
        } else {
          setDriveError("No available drives were found.");
        }
      } catch (error) {
        if (active) {
          setDriveError(`Failed to load drives: ${String(error)}`);
        }
      }
    };

    void loadDrives();

    const poll = window.setInterval(() => {
      void invoke<IndexStatus>("index_status")
        .then((next) => {
          if (active) {
            setStatus(next);
          }
        })
        .catch((error) => {
          if (active) {
            setStatus((previous) => ({
              ...previous,
              lastError: String(error),
            }));
          }
        });
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!selectedDrive) {
      return;
    }
    if (
      requestedIndexConfigKey === appliedIndexConfigKey ||
      requestedIndexConfigKey === pendingIndexConfigKey
    ) {
      return;
    }

    let active = true;
    setPendingIndexConfigKey(requestedIndexConfigKey);
    const beginIndexing = async () => {
      try {
        const initial = await invoke<IndexStatus>("start_indexing", {
          drive: selectedDrive,
          includeFolders: includeFolders,
          include_folders: includeFolders,
          includeAllDrives: includeAllDrives,
          include_all_drives: includeAllDrives,
        });
        if (active) {
          setStatus(initial);
          setAppliedIndexConfigKey(requestedIndexConfigKey);
          setPendingIndexConfigKey("");
        }
      } catch (error) {
        if (active) {
          setStatus((previous) => ({
            ...previous,
            lastError: String(error),
          }));
          setPendingIndexConfigKey("");
        }
      }
    };
    void beginIndexing();

    return () => {
      active = false;
    };
  }, [
    selectedDrive,
    includeFolders,
    includeAllDrives,
    requestedIndexConfigKey,
    appliedIndexConfigKey,
    pendingIndexConfigKey,
  ]);

  useEffect(() => {
    setDuplicateGroups([]);
    setDuplicatesError(null);
    setDuplicatesLoading(false);
    setDuplicateScanStatus({
      running: false,
      cancelRequested: false,
      scannedFiles: 0,
      totalFiles: 0,
      groupsFound: 0,
      progressPercent: 0,
    });
  }, [selectedDrive, includeFolders, includeAllDrives]);

  useEffect(() => {
    if (!duplicatesLoading) {
      return;
    }

    let active = true;
    const pollStatus = async () => {
      try {
        const next = await invoke<DuplicateScanStatus>("duplicate_scan_status");
        if (active) {
          setDuplicateScanStatus(next);
        }
      } catch {
        // Best effort polling only; ignore intermittent status read errors.
      }
    };

    void pollStatus();
    const poll = window.setInterval(() => {
      void pollStatus();
    }, 220);

    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [duplicatesLoading]);

  useEffect(() => {
    if (!status.ready) {
      previousIndexedCountRef.current = status.indexedCount;
      setIndexSyncing(false);
      if (indexSyncTimeoutRef.current !== null) {
        window.clearTimeout(indexSyncTimeoutRef.current);
        indexSyncTimeoutRef.current = null;
      }
      return;
    }

    const previousCount = previousIndexedCountRef.current;
    if (
      previousCount !== null &&
      status.indexedCount !== previousCount &&
      !status.indexing
    ) {
      setIndexSyncing(true);
      if (indexSyncTimeoutRef.current !== null) {
        window.clearTimeout(indexSyncTimeoutRef.current);
      }
      indexSyncTimeoutRef.current = window.setTimeout(() => {
        setIndexSyncing(false);
        indexSyncTimeoutRef.current = null;
      }, 1600);
    }
    previousIndexedCountRef.current = status.indexedCount;
  }, [status.ready, status.indexing, status.indexedCount]);

  useEffect(() => {
    return () => {
      if (indexSyncTimeoutRef.current !== null) {
        window.clearTimeout(indexSyncTimeoutRef.current);
      }
      if (duplicateNoticeTimeoutRef.current !== null) {
        window.clearTimeout(duplicateNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!trimmedQuery && !hasFilters) {
      setResults([]);
      setSearchError(null);
      setActionError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const debounceMs = hasMetadataFilters ? FILTER_SEARCH_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      const runSearch = async () => {
        setLoading(true);
        const minSize = toBytesFromMb(minSizeMb);
        const maxSize = toBytesFromMb(maxSizeMb);
        const minCreatedUnix = toUnixStart(createdAfter);
        const maxCreatedUnix = toUnixEnd(createdBefore);

        try {
          const searchArgs = {
            query: trimmedQuery,
            extension: extension.trim(),
            minSize,
            min_size: minSize,
            maxSize,
            max_size: maxSize,
            minCreatedUnix,
            min_created_unix: minCreatedUnix,
            maxCreatedUnix,
            max_created_unix: maxCreatedUnix,
            limit: searchLimit,
          };
          const found = await invoke<SearchResult[]>("search_files", {
            ...searchArgs,
          });
          if (active) {
            setResults(found);
            setSearchError(null);
          }
        } catch (error) {
          if (active) {
            setResults([]);
            setSearchError(String(error));
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      void runSearch();
    }, debounceMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    trimmedQuery,
    extension,
    minSizeMb,
    maxSizeMb,
    createdAfter,
    createdBefore,
    hasFilters,
    hasMetadataFilters,
    searchLimit,
  ]);

  async function reindexWithConfig(
    nextIncludeFolders: boolean,
    nextIncludeAllDrives: boolean,
  ): Promise<void> {
    if (!selectedDrive) {
      return;
    }
    const nextConfigKey = nextIncludeAllDrives
      ? `ALL:${nextIncludeFolders ? "1" : "0"}`
      : `${selectedDrive}:${nextIncludeFolders ? "1" : "0"}`;

    try {
      setPendingIndexConfigKey(nextConfigKey);
      const next = await invoke<IndexStatus>("start_indexing", {
        drive: selectedDrive,
        includeFolders: nextIncludeFolders,
        include_folders: nextIncludeFolders,
        includeAllDrives: nextIncludeAllDrives,
        include_all_drives: nextIncludeAllDrives,
      });
      setStatus(next);
      setAppliedIndexConfigKey(nextConfigKey);
      setPendingIndexConfigKey("");
    } catch (error) {
      setStatus((previous) => ({
        ...previous,
        lastError: String(error),
      }));
      setPendingIndexConfigKey("");
    }
  }

  async function reindex(): Promise<void> {
    await reindexWithConfig(includeFolders, includeAllDrives);
  }

  function clearSearchFilters(): void {
    setExtension("");
    setMinSizeMb("");
    setMaxSizeMb("");
    setCreatedAfter("");
    setCreatedBefore("");
  }

  function loadMoreResults(): void {
    setSearchLimit((previous) =>
      Math.min(SEARCH_LIMIT_MAX, previous + Math.max(defaultSearchLimit, SEARCH_LIMIT_MIN)),
    );
  }

  function applySearchLimitPreference(): void {
    const parsed = Number(searchLimitInput.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSettingsError(`Enter a valid number between ${SEARCH_LIMIT_MIN} and ${SEARCH_LIMIT_MAX}.`);
      setSettingsMessage(null);
      return;
    }

    const normalized = normalizeSearchLimit(parsed);
    setDefaultSearchLimit(normalized);
    setSearchLimit(normalized);
    setSearchLimitInput(String(normalized));
    setSettingsError(null);
    if (normalized !== parsed) {
      setSettingsMessage(
        `Saved. Adjusted to ${normalized.toLocaleString()} to keep the allowed range.`,
      );
      return;
    }
    setSettingsMessage(`Saved. New searches now start with ${normalized.toLocaleString()} results.`);
  }

  function resetSearchLimitPreference(): void {
    setDefaultSearchLimit(SEARCH_LIMIT);
    setSearchLimit(SEARCH_LIMIT);
    setSearchLimitInput(String(SEARCH_LIMIT));
    setSettingsError(null);
    setSettingsMessage(`Reset to default: ${SEARCH_LIMIT.toLocaleString()} results.`);
  }

  async function findDuplicates(): Promise<void> {
    if (duplicatesLoading || duplicateScanStatus.running) {
      return;
    }

    if (!status.ready) {
      setDuplicatesError("Index is not ready yet. Wait for indexing to finish.");
      return;
    }

    setDuplicateGroups([]);
    setDuplicatesError(null);
    setDuplicateNotice(null);
    setDuplicatesLoading(true);
    setDuplicateScanStatus({
      running: true,
      cancelRequested: false,
      scannedFiles: 0,
      totalFiles: 0,
      groupsFound: 0,
      progressPercent: 0,
    });
    const minSize = toBytesFromMb(duplicateMinSizeMb) ?? 50 * 1024 * 1024;

    try {
      const groups = await invoke<DuplicateGroup[]>("find_duplicate_groups", {
        minSize,
        min_size: minSize,
        maxGroups: 250,
        max_groups: 250,
        maxFilesPerGroup: 40,
        max_files_per_group: 40,
      });
      setDuplicateGroups(groups);
      setDuplicatesError(null);
    } catch (error) {
      setDuplicateGroups([]);
      const message = String(error);
      if (message.toLowerCase().includes("cancel")) {
        showDuplicateNotice(DUPLICATE_CANCEL_MESSAGE);
        setDuplicatesError(null);
      } else {
        setDuplicatesError(message);
      }
    } finally {
      try {
        const finalStatus = await invoke<DuplicateScanStatus>("duplicate_scan_status");
        setDuplicateScanStatus(finalStatus);
      } catch {
        setDuplicateScanStatus((previous) => ({
          ...previous,
          running: false,
          cancelRequested: false,
        }));
      }
      setDuplicatesLoading(false);
    }
  }

  async function cancelDuplicateScan(): Promise<void> {
    try {
      const requested = await invoke<boolean>("cancel_duplicate_scan");
      if (requested) {
        setDuplicatesError(null);
        setDuplicateNotice(null);
        setDuplicateScanStatus((previous) => ({
          ...previous,
          cancelRequested: true,
        }));
      }
    } catch (error) {
      setDuplicatesError(`Failed to cancel duplicate scan: ${String(error)}`);
    }
  }

  function removeDuplicateFromState(groupId: string, path: string): void {
    setDuplicateGroups((previous) =>
      previous
        .map((group) => {
          if (group.groupId !== groupId) {
            return group;
          }
          const nextFiles = group.files.filter(
            (file) => stripInvisibleText(file.path).trim() !== path,
          );
          if (nextFiles.length === group.files.length) {
            return group;
          }
          const nextFileCount = Math.max(0, group.fileCount - 1);
          const nextTotalBytes =
            group.totalBytes >= group.size ? group.totalBytes - group.size : group.totalBytes;
          return {
            ...group,
            fileCount: nextFileCount,
            totalBytes: nextTotalBytes,
            files: nextFiles,
          };
        })
        .filter((group) => group.fileCount >= 2),
    );
  }

  async function confirmDuplicateDelete(): Promise<void> {
    if (!duplicateDeleteCandidate || duplicateDeleteBusy) {
      return;
    }
    setDuplicateDeleteBusy(true);
    try {
      const deleted = await invoke<boolean>("delete_path", {
        path: duplicateDeleteCandidate.path,
      });
      if (deleted) {
        removeDuplicateFromState(
          duplicateDeleteCandidate.groupId,
          duplicateDeleteCandidate.path,
        );
        setDuplicateDeleteCandidate(null);
        setDuplicatesError(null);
      }
    } catch (error) {
      setDuplicatesError(`Failed to delete item: ${String(error)}`);
    } finally {
      setDuplicateDeleteBusy(false);
    }
  }

  function clearDuplicateResults(): void {
    setDuplicateGroups([]);
    setDuplicatesError(null);
    setDuplicateNotice(null);
    setDuplicateScanStatus({
      running: false,
      cancelRequested: false,
      scannedFiles: 0,
      totalFiles: 0,
      groupsFound: 0,
      progressPercent: 0,
    });
  }

  function showDuplicateNotice(message: string): void {
    setDuplicateNotice(message);
    if (duplicateNoticeTimeoutRef.current !== null) {
      window.clearTimeout(duplicateNoticeTimeoutRef.current);
    }
    duplicateNoticeTimeoutRef.current = window.setTimeout(() => {
      setDuplicateNotice(null);
      duplicateNoticeTimeoutRef.current = null;
    }, DUPLICATE_NOTICE_TIMEOUT_MS);
  }

  async function revealResult(path: string): Promise<void> {
    try {
      await invoke("reveal_in_folder", { path });
      setActionError(null);
    } catch (error) {
      setActionError(`Failed to reveal item in folder: ${String(error)}`);
    }
  }

  async function openResult(path: string): Promise<void> {
    try {
      await invoke("open_file", { path });
      setActionError(null);
    } catch (error) {
      setActionError(`Failed to open file: ${String(error)}`);
    }
  }

  async function openExternalLink(url: string): Promise<void> {
    try {
      await invoke("open_external_url", { url });
      setActionError(null);
    } catch (error) {
      setActionError(`Failed to open link: ${String(error)}`);
    }
  }

  function toggleThemeMode(): void {
    setThemeMode((previous) => (previous === "dark" ? "light" : "dark"));
  }

  function handlePreviewError(rowKey: string, sourceCount: number): void {
    setPreviewSourceState((previous) => {
      const currentIndex = previous[rowKey] ?? 0;
      if (currentIndex < 0) {
        return previous;
      }
      const nextIndex = currentIndex + 1;
      if (nextIndex < sourceCount) {
        return {
          ...previous,
          [rowKey]: nextIndex,
        };
      }
      return {
        ...previous,
        [rowKey]: -1,
      };
    });
  }

  function handlePreviewReady(previewKey: string): void {
    setPreviewReadyState((previous) => {
      if (previous[previewKey]) {
        return previous;
      }
      return {
        ...previous,
        [previewKey]: true,
      };
    });
  }

  const statusText = status.indexing
    ? `Indexing ${status.indexedCount.toLocaleString()} items...`
    : indexSyncing
      ? `Syncing updates... Indexed ${status.indexedCount.toLocaleString()} items`
      : status.ready
        ? `Indexed ${status.indexedCount.toLocaleString()} items`
        : "Indexer idle";
  const duplicateProgressPercent = Math.max(
    0,
    Math.min(100, Number.isFinite(duplicateScanStatus.progressPercent) ? duplicateScanStatus.progressPercent : 0),
  );
  const duplicateProgressLabel =
    duplicateScanStatus.totalFiles > 0
      ? `${duplicateScanStatus.scannedFiles.toLocaleString()} / ${duplicateScanStatus.totalFiles.toLocaleString()} files scanned`
      : `${duplicateScanStatus.scannedFiles.toLocaleString()} files scanned`;
  const showDuplicateProgress =
    duplicatesLoading ||
    duplicateScanStatus.running ||
    duplicateScanStatus.cancelRequested ||
    duplicateScanStatus.totalFiles > 0;
  const hasSearchRequest = Boolean(trimmedQuery || hasFilters);
  const canLoadMore =
    hasSearchRequest &&
    !loading &&
    !searchError &&
    results.length > 0 &&
    results.length >= searchLimit &&
    searchLimit < SEARCH_LIMIT_MAX;

  return (
    <div className="app-shell">
      <main className="spotlight-panel">
        <header className="panel-header">
          <h1>OmniSearch</h1>
          <div className="header-tools">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleThemeMode}
              aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span className="theme-toggle-dot" aria-hidden="true" />
              <span>{themeMode === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
            <label className="drive-picker" htmlFor="drive-picker">
              <span>Drive</span>
              <select
                id="drive-picker"
                value={selectedDrive}
                disabled={includeAllDrives}
                onChange={(event) => {
                  setSelectedDrive(event.currentTarget.value);
                }}
              >
                {drives
                  .filter((drive) => drive.isNtfs)
                  .map((drive) => (
                    <option key={drive.letter} value={drive.letter}>
                      {`${drive.letter}: (${drive.filesystem || "Unknown"})${drive.canOpenVolume ? "" : " - fallback mode"}`}
                    </option>
                  ))}
              </select>
            </label>
            <label
              className="scan-switch"
              htmlFor="all-drives-toggle"
              title="Scan all NTFS drives before search. Uses more time and resources."
            >
              <input
                id="all-drives-toggle"
                type="checkbox"
                checked={includeAllDrives}
                onChange={(event) => {
                  const nextIncludeAllDrives = event.currentTarget.checked;
                  setIncludeAllDrives(nextIncludeAllDrives);
                  void reindexWithConfig(includeFolders, nextIncludeAllDrives);
                }}
              />
              <span className="scan-switch-slider" aria-hidden="true" />
              <span>Scan all drives</span>
            </label>
            <label
              className="scan-option"
              htmlFor="include-folders-toggle"
              title="Include folders in index."
            >
              <input
                id="include-folders-toggle"
                type="checkbox"
                checked={includeFolders}
                onChange={(event) => {
                  const nextIncludeFolders = event.currentTarget.checked;
                  setIncludeFolders(nextIncludeFolders);
                  void reindexWithConfig(nextIncludeFolders, includeAllDrives);
                }}
              />
              <span>Include folders</span>
            </label>
            <button type="button" className="ghost-button" onClick={reindex}>
              Reindex
            </button>
          </div>
        </header>

        <nav className="tab-row" aria-label="Main sections">
          <button
            type="button"
            className={`tab ${activeTab === "search" ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab("search");
            }}
          >
            Search
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "duplicates" ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab("duplicates");
            }}
          >
            Duplicates
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "advanced" ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab("advanced");
            }}
          >
            Advanced
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "about" ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab("about");
            }}
          >
            About
          </button>
        </nav>

        {activeTab === "search" ? (
          <section className="tab-panel" aria-label="Search files">
            <div className="status-row">
              <span
                className={`status-dot ${
                  status.indexing || indexSyncing ? "live" : status.ready ? "ready" : "idle"
                }`}
              />
              <span>{statusText}</span>
            </div>

            {visibleStatusError ? <p className="error-row">{visibleStatusError}</p> : null}
            {driveError ? <p className="error-row">{driveError}</p> : null}
            {isFallbackModeActive ? <p className="warning-row">{fallbackModeMessage}</p> : null}

            <input
              className="search-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Type to search across indexed items..."
              autoFocus
            />

            <section className="filter-grid">
              <label>
                Extension
                <input
                  type="text"
                  value={extension}
                  onChange={(event) => setExtension(event.currentTarget.value)}
                  placeholder=".mp4 or folder"
                />
              </label>
              <label>
                Min size (MB)
                <NumberInputField
                  min={0}
                  step={1}
                  value={minSizeMb}
                  placeholder="0"
                  ariaLabel="Minimum size in megabytes"
                  onChange={setMinSizeMb}
                />
              </label>
              <label>
                Max size (MB)
                <NumberInputField
                  min={0}
                  step={1}
                  value={maxSizeMb}
                  placeholder="2048"
                  ariaLabel="Maximum size in megabytes"
                  onChange={setMaxSizeMb}
                />
              </label>
              <label>
                Created after
                <div className="date-input-shell">
                  <input
                    ref={createdAfterInputRef}
                    type="date"
                    value={createdAfter}
                    onChange={(event) => setCreatedAfter(event.currentTarget.value)}
                  />
                  <button
                    type="button"
                    className="date-input-trigger"
                    aria-label="Open created after date picker"
                    onClick={() => {
                      openDateInputPicker(createdAfterInputRef.current);
                    }}
                  >
                    <CalendarIcon />
                  </button>
                </div>
              </label>
              <label>
                Created before
                <div className="date-input-shell">
                  <input
                    ref={createdBeforeInputRef}
                    type="date"
                    value={createdBefore}
                    onChange={(event) => setCreatedBefore(event.currentTarget.value)}
                  />
                  <button
                    type="button"
                    className="date-input-trigger"
                    aria-label="Open created before date picker"
                    onClick={() => {
                      openDateInputPicker(createdBeforeInputRef.current);
                    }}
                  >
                    <CalendarIcon />
                  </button>
                </div>
              </label>
            </section>

            <section className="results-panel">
              <div className="results-toolbar">
                <div className="results-scope-tabs" aria-label="Result categories">
                  {RESULT_VIEW_TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`scope-tab ${resultView === item.id ? "is-active" : ""}`}
                      onClick={() => {
                        setResultView(item.id);
                      }}
                    >
                      <span>{item.label}</span>
                      <small>{resultCounts[item.id].toLocaleString()}</small>
                    </button>
                  ))}
                </div>

                <div className="results-toolbar-actions">
                  <div className="results-inline-stats" aria-live="polite">
                    <span>
                      {`${visibleResults.length.toLocaleString()} shown`}
                      {visibleResults.length !== results.length
                        ? ` / ${results.length.toLocaleString()}`
                        : ""}
                      {` (limit ${searchLimit.toLocaleString()})`}
                    </span>
                    <span>{formatBytes(visibleTotalBytes)}</span>
                  </div>
                  <label className="preview-toggle" htmlFor="preview-toggle">
                    <input
                      id="preview-toggle"
                      type="checkbox"
                      checked={showPreviews}
                      onChange={(event) => {
                        setShowPreviews(event.currentTarget.checked);
                      }}
                    />
                    <span>Show previews</span>
                  </label>
                  <label className="sort-picker" htmlFor="result-sort">
                    <span>Sort</span>
                    <select
                      id="result-sort"
                      value={resultSort}
                      onChange={(event) => {
                        setResultSort(event.currentTarget.value as ResultSortMode);
                      }}
                    >
                      <option value="relevance">Best match</option>
                      <option value="newest">Newest</option>
                      <option value="largest">Largest</option>
                      <option value="name">Name A-Z</option>
                    </select>
                  </label>
                  {hasFilters ? (
                    <button type="button" className="clear-filters" onClick={clearSearchFilters}>
                      Clear filters
                    </button>
                  ) : null}
                </div>
              </div>

              {loading ? <p className="hint compact-hint">Searching...</p> : null}
              {searchError ? <p className="error-row">{searchError}</p> : null}
              {actionError ? <p className="error-row">{actionError}</p> : null}
              {!loading && !searchError && visibleResults.length === 0 && (trimmedQuery || hasFilters) ? (
                <p className="hint compact-hint">No items match the current filters.</p>
              ) : null}

              <ul className="results-list">
                {visibleResults.map((result) => {
                  const rowKey = rowKeyForResult(result);
                  const isDirectory = result.isDirectory;
                  const normalizedExt = normalizedExtension(result);
                  const shortType = isDirectory
                    ? "DIR"
                    : (normalizedExt || "file").slice(0, 2).toUpperCase();
                  const extensionLabel = isDirectory
                    ? "folder"
                    : normalizedExt
                      ? `.${normalizedExt}`
                      : "file";
                  const previewKind = showPreviews ? previewKindFromResult(result) : "none";
                  const previewSources =
                    previewKind !== "none"
                      ? [
                          ...(previewDataUrls[rowKey] ? [previewDataUrls[rowKey]] : []),
                          ...previewSourcesFromPath(result.path),
                        ].filter((source, index, all) => source.length > 0 && all.indexOf(source) === index)
                      : [];
                  const activePreviewIndex = previewSourceState[rowKey] ?? 0;
                  const previewFailed = activePreviewIndex < 0;
                  const previewRenderKey = `${rowKey}:${activePreviewIndex}:${previewKind}`;
                  const previewReady = Boolean(previewReadyState[previewRenderKey]);
                  const previewSrc =
                    !previewFailed && previewKind !== "none"
                      ? (previewSources[activePreviewIndex] ?? "")
                      : "";
                  const hasRenderablePreview = previewSrc.length > 0;

                  return (
                    <li
                      key={rowKey}
                      className="result-row clickable"
                      role="button"
                      tabIndex={0}
                      title="Click to reveal in folder, double-click to open"
                      onClick={() => {
                        if (hasSelectedText()) {
                          return;
                        }
                        void revealResult(result.path);
                      }}
                      onDoubleClick={() => {
                        if (hasSelectedText()) {
                          return;
                        }
                        void openResult(result.path);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void openResult(result.path);
                        } else if (event.key === " ") {
                          event.preventDefault();
                          void revealResult(result.path);
                        }
                      }}
                    >
                      {showPreviews ? (
                        <div
                          className={`result-preview ${previewKind} ${isDirectory ? "folder" : ""}`}
                          aria-hidden="true"
                        >
                          <span className="preview-fallback">{shortType}</span>
                          {hasRenderablePreview && previewKind === "image" ? (
                            <img
                              key={`${rowKey}:${activePreviewIndex}:image`}
                              className={`preview-media ${previewReady ? "ready" : ""}`}
                              src={previewSrc}
                              alt=""
                              loading="lazy"
                              onLoad={() => {
                                handlePreviewReady(previewRenderKey);
                              }}
                              onError={() => {
                                handlePreviewError(rowKey, previewSources.length);
                              }}
                            />
                          ) : null}
                          {hasRenderablePreview && previewKind === "video" ? (
                            <video
                              key={`${rowKey}:${activePreviewIndex}:video`}
                              className={`preview-media ${previewReady ? "ready" : ""}`}
                              src={previewSrc}
                              muted
                              playsInline
                              preload="metadata"
                              onLoadedData={() => {
                                handlePreviewReady(previewRenderKey);
                              }}
                              onError={() => {
                                handlePreviewError(rowKey, previewSources.length);
                              }}
                            />
                          ) : null}
                          {hasRenderablePreview && previewKind === "pdf" ? (
                            <iframe
                              key={`${rowKey}:${activePreviewIndex}:pdf`}
                              className={`preview-media ${previewReady ? "ready" : ""}`}
                              src={`${previewSrc}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
                              title=""
                              loading="lazy"
                              onLoad={() => {
                                handlePreviewReady(previewRenderKey);
                              }}
                              onError={() => {
                                handlePreviewError(rowKey, previewSources.length);
                              }}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div className={`result-icon ${isDirectory ? "folder" : ""}`}>{shortType}</div>
                      )}

                      <div className="result-main">
                        <strong>{highlightMatch(result.name, trimmedQuery)}</strong>
                        <span>{highlightMatch(result.path, trimmedQuery)}</span>
                      </div>
                      <div className="result-meta">
                        <span className="meta-chip">{extensionLabel}</span>
                        <span className="meta-chip">{formatBytes(result.size)}</span>
                        <span className="meta-chip">{formatUnix(result.createdUnix)}</span>
                      </div>
                      <div className="result-actions">
                        <button
                          type="button"
                          className="row-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openResult(result.path);
                          }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="row-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            void revealResult(result.path);
                          }}
                        >
                          Folder
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {canLoadMore ? (
                <div className="load-more-row">
                  <button type="button" className="load-more-button" onClick={loadMoreResults}>
                    {`Load more (+${defaultSearchLimit.toLocaleString()})`}
                  </button>
                </div>
              ) : null}
            </section>
          </section>
        ) : null}

        {activeTab === "duplicates" ? (
          <section className="tab-panel" aria-label="Find duplicate files">
            <div className="status-row">
              <span
                className={`status-dot ${
                  status.indexing || indexSyncing ? "live" : status.ready ? "ready" : "idle"
                }`}
              />
              <span>{statusText}</span>
            </div>

            {visibleStatusError ? <p className="error-row">{visibleStatusError}</p> : null}
            {driveError ? <p className="error-row">{driveError}</p> : null}
            {isFallbackModeActive ? <p className="warning-row">{fallbackModeMessage}</p> : null}

            <section className="duplicate-controls">
              <label className="duplicate-size-input">
                <span>Min file size (MB)</span>
                <NumberInputField
                  min={0}
                  step={1}
                  value={duplicateMinSizeMb}
                  placeholder="50"
                  ariaLabel="Minimum duplicate file size in megabytes"
                  onChange={setDuplicateMinSizeMb}
                />
              </label>
              <button
                type="button"
                className="ghost-button"
                disabled={!status.ready || duplicatesLoading || duplicateScanStatus.running}
                onClick={() => {
                  void findDuplicates();
                }}
              >
                {duplicatesLoading || duplicateScanStatus.running ? "Scanning..." : "Find duplicates"}
              </button>
              {duplicatesLoading || duplicateScanStatus.running ? (
                <button
                  type="button"
                  className="ghost-button danger-ghost-button"
                  disabled={duplicateScanStatus.cancelRequested}
                  onClick={() => {
                    void cancelDuplicateScan();
                  }}
                >
                  {duplicateScanStatus.cancelRequested ? "Cancelling..." : "Cancel scan"}
                </button>
              ) : null}
              {duplicateGroups.length > 0 && !duplicatesLoading && !duplicateScanStatus.running ? (
                <button type="button" className="ghost-button" onClick={clearDuplicateResults}>
                  Clear results
                </button>
              ) : null}
            </section>

            <section className="results-panel">
              <div className="results-toolbar">
                <div className="results-inline-stats" aria-live="polite">
                  <span>{`${duplicateStats.groupCount.toLocaleString()} groups`}</span>
                  <span>{`${duplicateStats.totalFiles.toLocaleString()} files`}</span>
                  <span>{`Reclaimable ${formatBytes(duplicateStats.reclaimableBytes)}`}</span>
                </div>
              </div>

              {showDuplicateProgress ? (
                <div
                  className={`duplicate-progress ${duplicateScanStatus.cancelRequested ? "is-cancelling" : ""}`}
                  aria-live="polite"
                >
                  <div className="duplicate-progress-top">
                    <span>
                      {duplicateScanStatus.cancelRequested
                        ? "Cancelling duplicate scan..."
                        : duplicatesLoading || duplicateScanStatus.running
                          ? "Scanning duplicate files..."
                          : "Last duplicate scan"}
                    </span>
                    <strong>{`${duplicateProgressPercent.toFixed(1)}%`}</strong>
                  </div>
                  <div
                    className="duplicate-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(duplicateProgressPercent)}
                  >
                    <span
                      className="duplicate-progress-fill"
                      style={{ width: `${duplicateProgressPercent}%` }}
                    />
                  </div>
                  <div className="duplicate-progress-meta">
                    <span>{duplicateProgressLabel}</span>
                    <span>{`${duplicateScanStatus.groupsFound.toLocaleString()} groups found`}</span>
                  </div>
                </div>
              ) : null}

              {duplicatesLoading ? <p className="hint compact-hint">Scanning for duplicates...</p> : null}
              {duplicateNotice ? <p className="info-row">{duplicateNotice}</p> : null}
              {duplicatesError ? <p className="error-row">{duplicatesError}</p> : null}
              {!duplicatesLoading && !duplicatesError && duplicateGroups.length === 0 ? (
                <p className="hint compact-hint">
                  Run a duplicate scan to group files with identical content.
                </p>
              ) : null}

              <ul className="results-list">
                {duplicateGroups.flatMap((group, groupIndex) => {
                  const hiddenCount = Math.max(0, group.fileCount - group.files.length);
                  const renderedRows: ReactNode[] = [];
                  renderedRows.push(
                    <li key={`${group.groupId}:summary`} className="result-row duplicate-summary-row">
                      <div className="result-icon duplicate-group-icon">DP</div>
                      <div className="result-main duplicate-group-main">
                        <span className="duplicate-group-label">Group</span>
                        <strong>{`${group.fileCount.toLocaleString()} matching files`}</strong>
                        <span>
                          {hiddenCount > 0
                            ? `${hiddenCount.toLocaleString()} files hidden for performance`
                            : "All files in this group are shown"}
                        </span>
                      </div>
                      <div className="result-meta">
                        <span className="meta-chip">{`${formatBytes(group.size)} each`}</span>
                        <span className="meta-chip">{`${formatBytes(group.totalBytes)} total`}</span>
                        <span className="meta-chip">
                          {`Reclaimable ${formatBytes(Math.max(0, group.fileCount - 1) * group.size)}`}
                        </span>
                      </div>
                      <div className="result-actions" />
                    </li>,
                  );

                  if (group.files.length === 0) {
                    renderedRows.push(
                      <li key={`${group.groupId}:empty`} className="result-row duplicate-empty-row">
                        <div className="result-icon">--</div>
                        <div className="result-main">
                          <strong>No files available in this group</strong>
                          <span>Try running scan again.</span>
                        </div>
                        <div className="result-meta" />
                        <div className="result-actions" />
                      </li>,
                    );
                  } else {
                    for (let fileIndex = 0; fileIndex < group.files.length; fileIndex += 1) {
                      const file = group.files[fileIndex];
                      const cleanedPath = stripInvisibleText(file.path);
                      const cleanedName = stripInvisibleText(file.name);
                      const hasPath = cleanedPath.trim().length > 0;
                      const filePath = hasPath ? cleanedPath.trim() : "(path unavailable)";
                      const fileNameFromPath = hasPath ? basenameFromPath(cleanedPath) : "";
                      const fileName =
                        cleanedName.trim() || fileNameFromPath || "(unknown file name)";
                      const rowKey = `${group.groupId}:${cleanedPath || cleanedName || fileIndex}`;

                      renderedRows.push(
                        <li
                          key={rowKey}
                          className="result-row clickable duplicate-file-row-flat"
                          role="button"
                          tabIndex={0}
                          title="Click to reveal in folder, double-click to open"
                          onClick={() => {
                            if (hasPath) {
                              if (hasSelectedText()) {
                                return;
                              }
                              void revealResult(cleanedPath);
                            }
                          }}
                          onDoubleClick={() => {
                            if (hasPath) {
                              if (hasSelectedText()) {
                                return;
                              }
                              void openResult(cleanedPath);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (!hasPath) {
                              return;
                            }
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void openResult(cleanedPath);
                            } else if (event.key === " ") {
                              event.preventDefault();
                              void revealResult(cleanedPath);
                            }
                          }}
                        >
                          <div className="result-icon">DU</div>
                          <div className="result-main">
                            <strong title={fileName}>{fileName}</strong>
                            <span title={filePath}>{filePath}</span>
                          </div>
                          <div className="result-meta">
                            <span className="meta-chip">{formatBytes(file.size)}</span>
                            <span className="meta-chip">{formatUnix(file.modifiedUnix)}</span>
                          </div>
                          <div className="result-actions">
                            <button
                              type="button"
                              className="row-action"
                              disabled={!hasPath}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (hasPath) {
                                  void openResult(cleanedPath);
                                }
                              }}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="row-action"
                              disabled={!hasPath}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (hasPath) {
                                  void revealResult(cleanedPath);
                                }
                              }}
                            >
                              Folder
                            </button>
                            <button
                              type="button"
                              className="row-action danger-row-action"
                              disabled={!hasPath}
                              title="Delete"
                              aria-label="Delete duplicate"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!hasPath) {
                                  return;
                                }
                                setDuplicateDeleteCandidate({
                                  groupId: group.groupId,
                                  path: cleanedPath.trim(),
                                  name: fileName,
                                  size: file.size,
                                });
                              }}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 7h2v8h-2v-8zm4 0h2v8h-2v-8zM7 10h2v8H7v-8z" />
                              </svg>
                            </button>
                          </div>
                        </li>,
                      );
                    }
                  }

                  if (groupIndex < duplicateGroups.length - 1) {
                    renderedRows.push(
                      <li key={`${group.groupId}:divider`} className="duplicate-group-divider" />,
                    );
                  }

                  return renderedRows;
                })}
              </ul>
            </section>

            {duplicateDeleteCandidate ? (
              <div
                className="modal-overlay"
                role="dialog"
                aria-modal="true"
                onClick={() => {
                  if (!duplicateDeleteBusy) {
                    setDuplicateDeleteCandidate(null);
                  }
                }}
              >
                <div
                  className="modal-card"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <h3>Delete duplicate?</h3>
                  <p>
                    {duplicateDeleteCandidate.name || "Selected file"}
                  </p>
                  <p className="modal-path">{duplicateDeleteCandidate.path}</p>
                  <p className="modal-meta">
                    {formatBytes(duplicateDeleteCandidate.size)}
                  </p>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={duplicateDeleteBusy}
                      onClick={() => {
                        setDuplicateDeleteCandidate(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="row-action danger-row-action"
                      disabled={duplicateDeleteBusy}
                      onClick={() => {
                        void confirmDuplicateDelete();
                      }}
                    >
                      {duplicateDeleteBusy ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "advanced" ? (
          <section className="tab-panel scrollable-tab-panel" aria-label="Advanced settings">
            <div className="about-panel advanced-panel">
              <div className="about-header">
                <div>
                  <h2>Advanced settings</h2>
                  <p className="about-tagline">
                    Choose a full app look and tune how many results load at once.
                  </p>
                </div>
              </div>

              <div className="advanced-settings">
                <div className="advanced-settings-section">
                  <div className="advanced-section-header">
                    <div>
                      <h3>Theme gallery</h3>
                      <p className="advanced-note">
                        Pick a complete app style. Every preset adapts to both dark and light
                        mode.
                      </p>
                    </div>
                    <span className="theme-mode-status">
                      {themeMode === "dark" ? "Dark mode active" : "Light mode active"}
                    </span>
                  </div>

                  <div className="theme-grid" aria-label="Theme presets">
                    {THEME_PRESET_IDS.map((presetId) => {
                      const preset = themePresetById(presetId);
                      const isActive = preset.id === themePreset;

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`theme-card ${isActive ? "is-active" : ""}`}
                          aria-pressed={isActive}
                          onClick={() => {
                            setThemePreset(preset.id);
                          }}
                        >
                          <div className="theme-card-preview" aria-hidden="true">
                            <div className="theme-mini" style={themePreviewStyle(preset.preview.dark)}>
                              <div className="theme-mini-header">
                                <span className="theme-mini-label">Dark</span>
                                <span className="theme-mini-dot" />
                              </div>
                              <div className="theme-mini-search-bar" />
                              <div className="theme-mini-tabs">
                                <span className="theme-mini-pill theme-mini-pill-accent" />
                                <span className="theme-mini-pill" />
                              </div>
                              <div className="theme-mini-list">
                                <span className="theme-mini-line" />
                                <span className="theme-mini-line theme-mini-line-short" />
                              </div>
                            </div>

                            <div className="theme-mini" style={themePreviewStyle(preset.preview.light)}>
                              <div className="theme-mini-header">
                                <span className="theme-mini-label">Light</span>
                                <span className="theme-mini-dot" />
                              </div>
                              <div className="theme-mini-search-bar" />
                              <div className="theme-mini-tabs">
                                <span className="theme-mini-pill theme-mini-pill-accent" />
                                <span className="theme-mini-pill" />
                              </div>
                              <div className="theme-mini-list">
                                <span className="theme-mini-line" />
                                <span className="theme-mini-line theme-mini-line-short" />
                              </div>
                            </div>
                          </div>

                          <div className="theme-card-body">
                            <div className="theme-card-copy">
                              <strong>{preset.label}</strong>
                              <span>{preset.description}</span>
                            </div>
                            <span className="theme-card-tag">
                              {isActive ? "Selected" : "Apply"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <p className="advanced-note">
                    {`Current preset: ${activeThemePreset.label}. Use the header toggle anytime to switch between its dark and light versions.`}
                  </p>
                </div>

                <div className="advanced-settings-section">
                  <label htmlFor="search-limit-input">
                    Results per search (range {SEARCH_LIMIT_MIN} - {SEARCH_LIMIT_MAX})
                  </label>
                  <NumberInputField
                    id="search-limit-input"
                    min={SEARCH_LIMIT_MIN}
                    max={SEARCH_LIMIT_MAX}
                    step={50}
                    value={searchLimitInput}
                    ariaLabel="Results per search"
                    onChange={(value) => {
                      setSearchLimitInput(value);
                      if (settingsError) {
                        setSettingsError(null);
                      }
                      if (settingsMessage) {
                        setSettingsMessage(null);
                      }
                    }}
                  />
                  <div className="advanced-settings-actions">
                    <button type="button" className="ghost-button" onClick={applySearchLimitPreference}>
                      Update
                    </button>
                    <button type="button" className="ghost-button" onClick={resetSearchLimitPreference}>
                      Reset default ({SEARCH_LIMIT})
                    </button>
                  </div>
                  <p className="advanced-note">
                    {`Current default: ${defaultSearchLimit.toLocaleString()} | Current active limit: ${searchLimit.toLocaleString()}`}
                  </p>
                  <p className="advanced-note">Load more uses this same amount each click.</p>
                  {settingsError ? <p className="advanced-error">{settingsError}</p> : null}
                  {settingsMessage ? <p className="advanced-success">{settingsMessage}</p> : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "about" ? (
          <section className="tab-panel" aria-label="About OmniSearch and developer">
            <div className="about-panel">
              <div className="about-header">
                <div>
                  <h2>About OmniSearch</h2>
                  <p className="about-tagline">
                    Fast local search across your drives with rich filters.
                  </p>
                  <div className="about-version">
                    <span className="about-version-label">Version</span>
                    <span className="about-version-value">
                      {appVersion ? `v${appVersion}` : "Loading..."}
                    </span>
                  </div>
                </div>
                <div className="about-developer">
                  <span className="about-label">Built by</span>
                  <span className="about-name">{DEVELOPER_NAME}</span>
                </div>
              </div>
              <div className="social-links">
                {SOCIAL_LINKS.map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    className="social-link"
                    onClick={() => {
                      void openExternalLink(item.url);
                    }}
                  >
                    <SocialIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
