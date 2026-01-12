declare module 'say' {
  interface SayInstance {
    speak(
      text: string,
      voice?: string | null,
      speed?: number,
      callback?: (error?: Error) => void
    ): void;

    export(
      text: string,
      voice: string | null | undefined,
      speed: number,
      filename: string,
      callback?: (error?: Error) => void
    ): void;

    stop(callback?: (error?: Error) => void): void;

    getInstalledVoices(callback: (error: Error | null, voices?: string[]) => void): void;
  }

  const say: SayInstance;
  export = say;
}
