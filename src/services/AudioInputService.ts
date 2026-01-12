import * as record from 'node-record-lpcm16';
import { Readable } from 'stream';

export class AudioInputService {
  private recording: any;

  constructor() {
    this.recording = null;
  }

  startRecording(silenceThreshold: number = 0, silenceDuration: number = 0): Readable {
    // Auto-detect platform: ALSA for Linux/RPi, sox for macOS
    const recordProgram = process.platform === 'darwin' ? 'sox' : 'arecord';

    console.log('🎤 Starting recording...');
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Record program: ${recordProgram}`);
    console.log(`   Sample rate: 16000 Hz`);
    console.log(`   Silence threshold: ${silenceThreshold}`);
    if (silenceDuration > 0) {
      console.log(`   Silence duration: ${silenceDuration}s`);
    }

    const recordOptions: any = {
      sampleRate: 16000,
      threshold: silenceThreshold,
      verbose: false,
      recordProgram: recordProgram,
    };

    // Add silence detection if specified
    if (silenceDuration > 0) {
      recordOptions.silence = silenceDuration.toString();
    }

    this.recording = record.record(recordOptions);

    const stream = this.recording.stream();

    // Add event listeners to monitor the stream
    stream.on('data', (chunk: Buffer) => {
      // Only log the first chunk to avoid spam
      if (!stream.hasListener) {
        console.log(`✅ Receiving audio data (chunk size: ${chunk.length} bytes)`);
        stream.hasListener = true;
      }
    });

    stream.on('error', (err: Error) => {
      console.error('❌ Audio stream error:', err);
    });

    console.log('🎤 Recording started - speak now!');
    return stream;
  }

  stopRecording(): void {
    if (this.recording) {
      console.log('🛑 Stopping recording and closing audio stream...');
      this.recording.stop();
      this.recording = null;
      console.log('✅ Recording stopped successfully');
    } else {
      console.log('⚠️  No active recording to stop');
    }
  }
}
