declare module "mespeak" {
  export type SpeakFormat =
    | "array"
    | "base64"
    | "buffer"
    | "data-uri"
    | "data-url"
    | "dataurl"
    | "mime";

  export type SpeakOptions = {
    amplitude?: number;
    wordgap?: number;
    pitch?: number;
    speed?: number;
    voice?: string;
    variant?: string;
    rawdata?: SpeakFormat;
    log?: boolean;
    callback?: (result: boolean) => void;
    multipart?: boolean;
    [key: string]: unknown;
  };

  export type SpeakPart = {
    text: string;
    [key: string]: unknown;
  };

  export interface MeSpeak {
    loadConfig(config: unknown): boolean;
    loadVoice(voice: unknown): boolean;
    resetQueue(): void;
    speak(
      text: string,
      options?: SpeakOptions,
      callback?: (result: boolean) => void
    ): unknown;
    speakMultipart(
      parts: SpeakPart[],
      options?: SpeakOptions,
      callback?: (result: boolean) => void
    ): unknown;
  }

  const meSpeak: MeSpeak;
  export default meSpeak;
}
