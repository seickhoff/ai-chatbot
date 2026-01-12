declare module 'node-record-lpcm16' {
  import { Readable } from 'stream';

  interface RecordingOptions {
    sampleRate?: number;
    threshold?: number;
    verbose?: boolean;
    recordProgram?: string;
    silence?: string;
  }

  interface Recording {
    stream: () => Readable;
    stop: () => void;
  }

  export function record(options?: RecordingOptions): Recording;
}
