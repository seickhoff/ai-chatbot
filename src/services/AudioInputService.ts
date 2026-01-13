import * as record from 'node-record-lpcm16';
import { Readable } from 'stream';

export class AudioInputService {
  private recording: any;
  private continuousStream: Readable | null = null;

  constructor() {
    this.recording = null;
    this.continuousStream = null;
  }

  // Start continuous recording that never stops on its own
  startContinuousRecording(): Readable {
    if (this.continuousStream) {
      return this.continuousStream;
    }

    const recordProgram = process.platform === 'darwin' ? 'sox' : 'arecord';

    console.log('🎤 Starting continuous recording...');
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Record program: ${recordProgram}`);
    console.log(`   Sample rate: 16000 Hz`);

    const recordOptions: any = {
      sampleRate: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: recordProgram,
    };

    this.recording = record.record(recordOptions);
    const stream = this.recording.stream();
    this.continuousStream = stream;

    let chunkCount = 0;
    let lastVolumeLog = Date.now();
    let maxVolumeInWindow = 0;

    stream.on('data', (chunk: Buffer) => {
      chunkCount++;

      // Calculate max volume in this chunk
      let chunkMaxVolume = 0;
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = Math.abs(chunk.readInt16LE(i));
        if (sample > chunkMaxVolume) {
          chunkMaxVolume = sample;
        }
      }

      // Track max volume in 1-second window (skip first chunk to avoid startup artifact)
      if (chunkCount > 1 && chunkMaxVolume > maxVolumeInWindow) {
        maxVolumeInWindow = chunkMaxVolume;
      }

      // Log volume every second
      const now = Date.now();
      if (now - lastVolumeLog >= 1000) {
        const volumePercent = ((maxVolumeInWindow / 32767) * 100).toFixed(1);
        console.log(`📊 Volume: ${maxVolumeInWindow} (${volumePercent}%)`);
        maxVolumeInWindow = 0;
        lastVolumeLog = now;
      }

      // Only log the first chunk to avoid spam
      if (chunkCount === 1) {
        console.log(`✅ Receiving audio data (chunk size: ${chunk.length} bytes)`);
      }
    });

    stream.on('error', (err: Error) => {
      console.error('❌ Audio stream error:', err);
    });

    console.log('🎤 Continuous recording started!');
    return stream;
  }

  startRecording(
    silenceThreshold: number = 0,
    silenceDuration: number = 0,
    volumeThreshold: number = 0
  ): Readable {
    // Auto-detect platform: ALSA for Linux/RPi, sox for macOS
    const recordProgram = process.platform === 'darwin' ? 'sox' : 'arecord';

    console.log('🎤 Starting recording...');
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Record program: ${recordProgram}`);
    console.log(`   Sample rate: 16000 Hz`);
    if (volumeThreshold > 0) {
      console.log(`   Volume-based silence: < ${volumeThreshold} for ${silenceDuration}s`);
    } else {
      console.log(`   Silence threshold: ${silenceThreshold}`);
      if (silenceDuration > 0) {
        console.log(`   Silence duration: ${silenceDuration}s`);
      }
    }

    const recordOptions: any = {
      sampleRate: 16000,
      threshold: silenceThreshold,
      verbose: false,
      recordProgram: recordProgram,
    };

    // Add silence detection if specified (but we'll override with custom logic)
    if (silenceDuration > 0 && volumeThreshold === 0) {
      recordOptions.silence = silenceDuration.toString();
    }

    this.recording = record.record(recordOptions);

    const stream = this.recording.stream();

    // Add event listeners to monitor the stream
    let chunkCount = 0;
    let lastVolumeLog = Date.now();
    let maxVolumeInWindow = 0;

    // Custom silence detection based on volume
    let silenceStartTime: number | null = null;
    const self = this;

    stream.on('data', (chunk: Buffer) => {
      chunkCount++;

      // Calculate max volume in this chunk
      let chunkMaxVolume = 0;
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = Math.abs(chunk.readInt16LE(i));
        if (sample > chunkMaxVolume) {
          chunkMaxVolume = sample;
        }
      }

      // Track max volume in 1-second window (skip first chunk to avoid startup artifact)
      if (chunkCount > 1 && chunkMaxVolume > maxVolumeInWindow) {
        maxVolumeInWindow = chunkMaxVolume;
      }

      // Custom volume-based silence detection
      if (volumeThreshold > 0) {
        const now = Date.now();

        if (chunkMaxVolume < volumeThreshold) {
          // Volume is below threshold (silence)
          if (silenceStartTime === null) {
            silenceStartTime = now;
          } else {
            // Check if we've been silent long enough
            const silenceDurationMs = now - silenceStartTime;
            if (silenceDurationMs >= silenceDuration * 1000) {
              console.log(
                `🔇 Custom silence detected! (${(silenceDurationMs / 1000).toFixed(1)}s below ${volumeThreshold})`
              );
              self.stopRecording();
              return;
            }
          }
        } else {
          // Volume above threshold, reset silence timer
          silenceStartTime = null;
        }
      }

      // Log volume every second
      const now = Date.now();
      if (now - lastVolumeLog >= 1000) {
        const volumePercent = ((maxVolumeInWindow / 32767) * 100).toFixed(1);
        console.log(`📊 Volume: ${maxVolumeInWindow} (${volumePercent}%)`);
        maxVolumeInWindow = 0;
        lastVolumeLog = now;
      }

      // Only log the first chunk to avoid spam
      if (chunkCount === 1) {
        console.log(`✅ Receiving audio data (chunk size: ${chunk.length} bytes)`);
      }
    });

    stream.on('end', () => {
      console.log(`🔇 Stream ended after ${chunkCount} chunks`);
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

  stopContinuousRecording(): void {
    if (this.recording) {
      console.log('🛑 Stopping continuous recording...');
      this.recording.stop();
      this.recording = null;
      this.continuousStream = null;
      console.log('✅ Continuous recording stopped');
    }
  }
}
