declare module 'wav' {
  import { Writable, Readable } from 'stream';

  interface FileWriterOptions {
    channels?: number;
    sampleRate?: number;
    bitDepth?: number;
  }

  interface FileReaderOptions {
    // Reader options can be added if needed
  }

  class FileWriter extends Writable {
    constructor(path: string, options?: FileWriterOptions);
  }

  class Reader extends Readable {
    constructor(options?: FileReaderOptions);
    format: {
      audioFormat: number;
      channels: number;
      sampleRate: number;
      byteRate: number;
      blockAlign: number;
      bitDepth: number;
    };
  }

  class Writer extends Writable {
    constructor(options?: FileWriterOptions);
  }

  export { FileWriter, Reader, Writer };
}
