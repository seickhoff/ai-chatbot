import say = require('say');
import * as fs from 'fs';
import { promisify } from 'util';

// The 'say' module exports a singleton instance with speak(), export(), stop() methods
const exportSpeech = promisify(say.export.bind(say));

export class SayTTSService {
  private voice: string | null;
  private speed: number;

  constructor(voice: string | null = null, speed: number = 1.0) {
    // null = use system default voice
    // macOS: 'Alex', 'Samantha', etc.
    // Linux: uses Festival by default
    this.voice = voice;
    this.speed = speed;
  }

  async synthesize(text: string): Promise<Buffer> {
    try {
      const tempFile = `/tmp/tts-${Date.now()}.wav`;

      await exportSpeech(text, this.voice || undefined, this.speed, tempFile);

      const audioBuffer = fs.readFileSync(tempFile);

      // Clean up temp file
      fs.unlinkSync(tempFile);

      return audioBuffer;
    } catch (error) {
      console.error('❌ Text-to-speech error:', error);
      throw error;
    }
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      say.speak(text, this.voice || undefined, this.speed, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  stop(): void {
    say.stop();
  }
}
