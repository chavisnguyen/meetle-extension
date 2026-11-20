export const DEFAULT_API = "https://api.englishmaile.com";

export interface Config {
  apiBase: string;
  /** Tests only: a ready-made bearer token. Normally the offscreen page asks the background for a Google one. */
  token?: string;
}

/** What is kept in IndexedDB about one recording, next to its chunks. */
export interface Meta {
  sid: string;
  meetUrl: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  state: "recording" | "ready" | "uploaded";
}

export type ToOffscreen =
  | {
      target: "offscreen";
      type: "start";
      streamId: string;
      meetUrl: string;
      sessionId: string;
      cfg: Config;
      /** Tests only: record a generated picture and tone instead of the tab, and skip the mic. */
      fake?: boolean;
    }
  | { target: "offscreen"; type: "stop" }
  | { target: "offscreen"; type: "recover"; cfg: Config };

export type ToBackground =
  | { type: "start"; tab: { id: number; url: string }; sessionId: string }
  | { type: "stop" }
  | { type: "status"; text: string; recording?: boolean }
  /** The teacher's token from the API (signs in through Google when there is none); `fresh` drops the cached one first (the API refused it). */
  | { type: "token"; fresh?: boolean };
