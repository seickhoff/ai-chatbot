import Speaker from 'speaker';
import { Readable } from 'stream';

export class AudioOutputService {
  private speaker: Speaker | null;

  constructor() {
    this.speaker = null;
  }

  async play(audioBuffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.speaker = new Speaker({
          channels: 1,
          bitDepth: 16,
          sampleRate: 24000,
        });

        const stream = Readable.from(audioBuffer);

        this.speaker.on('finish', () => {
          console.log('🔊 Finished playing audio');
          this.speaker = null;
          resolve();
        });

        this.speaker.on('error', (error) => {
          console.error('❌ Speaker error:', error);
          this.speaker = null;
          reject(error);
        });

        stream.pipe(this.speaker);
      } catch (error) {
        console.error('❌ Audio playback error:', error);
        reject(error);
      }
    });
  }

  stop(): void {
    if (this.speaker) {
      this.speaker.end();
      this.speaker = null;
    }
  }
}
