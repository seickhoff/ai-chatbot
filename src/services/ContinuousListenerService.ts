import { Readable, PassThrough } from 'stream';
import { WhisperSTTService } from './WhisperSTTService';

type ListenerMode = 'wake_word' | 'command';

export class ContinuousListenerService {
  private whisper: WhisperSTTService;
  private volumeThreshold: number;
  private silenceDuration: number;
  private chunkBuffer: Buffer[] = [];
  private silenceStartTime: number | null = null;
  private isProcessing: boolean = false;
  private mode: ListenerMode = 'wake_word';
  private currentResolver: ((value: string) => void) | null = null;
  private currentRejector: ((error: Error) => void) | null = null;
  private chunkCount: number = 0;
  private hasReceivedAudio: boolean = false;

  constructor(whisper: WhisperSTTService, volumeThreshold: number, silenceDuration: number) {
    this.whisper = whisper;
    this.volumeThreshold = volumeThreshold;
    this.silenceDuration = silenceDuration;
  }

  // Start listening to continuous stream
  startListening(audioStream: Readable): void {
    const self = this;

    audioStream.on('data', async (chunk: Buffer) => {
      await self.handleChunk(chunk);
    });

    audioStream.on('error', (error) => {
      if (self.currentRejector) {
        self.currentRejector(error);
        self.currentResolver = null;
        self.currentRejector = null;
      }
    });
  }

  private async handleChunk(chunk: Buffer): Promise<void> {
    this.chunkCount++;

    // Skip first chunk to avoid sox startup artifact
    if (this.chunkCount === 1) {
      return;
    }

    // For command mode, skip first few chunks to avoid TTS residual
    if (this.mode === 'command' && this.chunkCount <= 5) {
      return;
    }

    // Calculate max volume in this chunk
    let chunkMaxVolume = 0;
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = Math.abs(chunk.readInt16LE(i));
      if (sample > chunkMaxVolume) {
        chunkMaxVolume = sample;
      }
    }

    // Track if we've received actual audio (for command mode)
    if (this.mode === 'command' && chunkMaxVolume >= this.volumeThreshold) {
      this.hasReceivedAudio = true;
    }

    // Add chunk to buffer
    this.chunkBuffer.push(chunk);

    // Check for silence
    if (chunkMaxVolume < this.volumeThreshold) {
      const now = Date.now();
      if (this.silenceStartTime === null) {
        this.silenceStartTime = now;
      } else {
        const silenceDurationMs = now - this.silenceStartTime;
        if (silenceDurationMs >= this.silenceDuration * 1000) {
          // We've detected silence
          if (this.mode === 'wake_word') {
            await this.processWakeWord();
          } else if (this.mode === 'command') {
            await this.processCommand();
          }
        }
      }
    } else {
      // Volume above threshold, reset silence timer
      this.silenceStartTime = null;
    }
  }

  private async processWakeWord(): Promise<void> {
    if (this.isProcessing || this.chunkBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;
    const bufferedAudio = Buffer.concat(this.chunkBuffer);
    this.chunkBuffer = [];
    this.silenceStartTime = null;

    // Create a PassThrough stream from buffered audio
    const audioChunkStream = new PassThrough();
    audioChunkStream.end(bufferedAudio);

    try {
      const transcription = await this.whisper.recognizeStream(audioChunkStream);

      if (transcription && transcription.trim().length > 0) {
        console.log(`📋 Heard: "${transcription}"`);

        // Check if wake word was detected
        const normalizedText = transcription.toLowerCase().trim();
        if (normalizedText.includes('isis') || normalizedText.includes('ice is')) {
          if (this.currentResolver) {
            this.currentResolver(transcription);
            this.currentResolver = null;
            this.currentRejector = null;
          }
        }
      }
    } catch (error) {
      console.error('❌ Transcription error:', error);
    }

    this.isProcessing = false;
  }

  private async processCommand(): Promise<void> {
    // Only process if we received actual audio
    if (this.isProcessing || this.chunkBuffer.length === 0 || !this.hasReceivedAudio) {
      if (!this.hasReceivedAudio) {
        // Reset if we only got silence
        this.chunkBuffer = [];
        this.silenceStartTime = null;
      }
      return;
    }

    this.isProcessing = true;
    const bufferedAudio = Buffer.concat(this.chunkBuffer);
    this.chunkBuffer = [];

    // Create a PassThrough stream from buffered audio
    const audioChunkStream = new PassThrough();
    audioChunkStream.end(bufferedAudio);

    try {
      const transcription = await this.whisper.recognizeStream(audioChunkStream);
      if (this.currentResolver) {
        this.currentResolver(transcription);
        this.currentResolver = null;
        this.currentRejector = null;
      }
    } catch (error) {
      if (this.currentRejector) {
        this.currentRejector(error as Error);
        this.currentResolver = null;
        this.currentRejector = null;
      }
    }
  }

  // Listen for wake word
  async listenForWakeWord(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.mode = 'wake_word';
      this.chunkBuffer = [];
      this.silenceStartTime = null;
      this.isProcessing = false;
      this.hasReceivedAudio = false;
      this.currentResolver = resolve;
      this.currentRejector = reject;
    });
  }

  // Listen for command after wake word detected
  async listenForCommand(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.mode = 'command';
      this.chunkBuffer = [];
      this.silenceStartTime = null;
      this.isProcessing = false;
      this.chunkCount = 0; // Reset chunk count for command mode
      this.hasReceivedAudio = false;
      this.currentResolver = resolve;
      this.currentRejector = reject;
    });
  }
}
