import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class WhisperSTTService {
  private context: any;
  private modelPath: string;

  constructor(modelPath: string = './models/ggml-base.en.bin') {
    this.modelPath = modelPath;
    this.context = null;
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(
        `Whisper model not found at ${this.modelPath}. Please download a model from https://huggingface.co/ggerganov/whisper.cpp/tree/main`
      );
    }

    // Don't initialize context here - we'll create fresh one each time
    console.log('✅ Whisper STT ready');
  }

  async recognizeStream(audioStream: Readable): Promise<string> {
    const startTime = Date.now();
    // Store in memory, only write to RAM disk when needed
    // /dev/shm is RAM disk on Linux (Raspberry Pi), /tmp is RAM-backed on macOS
    const tempDir = fs.existsSync('/dev/shm') ? '/dev/shm' : '/tmp';
    const tempFile = `${tempDir}/audio-${Date.now()}.wav`;

    return new Promise<string>((resolve, reject) => {
      let bytesWritten = 0;
      let maxAmplitude = 0;
      const recordingStartTime = Date.now();
      const audioChunks: Buffer[] = [];

      // Collect audio data in memory first
      audioStream.on('data', (chunk: Buffer) => {
        audioChunks.push(chunk);
        bytesWritten += chunk.length;

        // Calculate max amplitude to verify we're getting real audio (not silence)
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = Math.abs(chunk.readInt16LE(i));
          if (sample > maxAmplitude) {
            maxAmplitude = sample;
          }
        }
      });

      audioStream.on('end', async () => {
        try {
          const recordingEndTime = Date.now();
          const recordingDuration = ((recordingEndTime - recordingStartTime) / 1000).toFixed(2);

          if (bytesWritten === 0) {
            console.log('⚠️  Warning: No audio data captured!');
            resolve('');
            return;
          }

          // Combine all PCM chunks into a single buffer in memory
          const pcmBuffer = Buffer.concat(audioChunks);

          // Create WAV file in memory
          const wavBuffer = this.createWavBuffer(pcmBuffer, 16000, 1, 16);

          const fileSizeKB = (wavBuffer.length / 1024).toFixed(2);
          console.log(
            `⏱️  Recording: ${recordingDuration}s | Size: ${fileSizeKB} KB | Max amplitude: ${maxAmplitude}`
          );

          // Write to RAM disk only when transcribing (Whisper requires file path)
          fs.writeFileSync(tempFile, wavBuffer);

          const transcriptionStartTime = Date.now();

          // Use standalone Node.js script to avoid ts-node/import issues
          const { stdout } = await execFileAsync(
            'node',
            ['./transcribe.js', tempFile, this.modelPath],
            {
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
              timeout: 60000, // 60 second timeout
            }
          );

          const transcriptionEndTime = Date.now();
          const transcriptionDuration = (
            (transcriptionEndTime - transcriptionStartTime) /
            1000
          ).toFixed(2);

          const transcribedText = stdout.trim();

          // Clean up temp file from RAM disk
          fs.unlinkSync(tempFile);

          const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`⏱️  Transcription: ${transcriptionDuration}s | Total: ${totalDuration}s`);

          // Return the transcribed text
          resolve(transcribedText);
        } catch (error) {
          console.error('❌ Transcription error:', error);
          // Clean up temp file on error
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
          reject(error);
        }
      });

      audioStream.on('error', (error) => {
        console.error('❌ Audio stream error:', error);
        reject(error);
      });
    });
  }

  // Create WAV file buffer from PCM data (in memory)
  private createWavBuffer(
    pcmData: Buffer,
    sampleRate: number,
    channels: number,
    bitDepth: number
  ): Buffer {
    const blockAlign = channels * (bitDepth / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length;
    const headerSize = 44;
    const fileSize = headerSize + dataSize - 8;

    const header = Buffer.alloc(headerSize);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.release();
      this.context = null;
    }
  }
}
