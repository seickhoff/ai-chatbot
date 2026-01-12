import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as wav from 'wav';
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
    // Save stream to temporary file
    // Use /dev/shm (RAM disk) on Linux, /tmp on macOS
    const tempDir = fs.existsSync('/dev/shm') ? '/dev/shm' : '/tmp';
    const tempFile = `${tempDir}/audio-${Date.now()}.wav`;

    return new Promise<string>((resolve, reject) => {
      let bytesWritten = 0;
      let chunkCount = 0;
      let maxAmplitude = 0;
      const recordingStartTime = Date.now();

      // Create WAV file writer with proper headers
      // node-record-lpcm16 outputs 16kHz, 16-bit, mono PCM
      const wavWriter = new wav.FileWriter(tempFile, {
        channels: 1,
        sampleRate: 16000,
        bitDepth: 16,
      });

      // Track data being written
      audioStream.on('data', (chunk) => {
        bytesWritten += chunk.length;
        chunkCount++;

        // Calculate max amplitude to verify we're getting real audio (not silence)
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = Math.abs(chunk.readInt16LE(i));
          if (sample > maxAmplitude) {
            maxAmplitude = sample;
          }
        }
      });

      // Pipe the PCM audio stream through the WAV writer
      audioStream.pipe(wavWriter);

      wavWriter.on('finish', async () => {
        try {
          const recordingEndTime = Date.now();
          const recordingDuration = ((recordingEndTime - recordingStartTime) / 1000).toFixed(2);

          if (bytesWritten === 0) {
            console.log('⚠️  Warning: No audio data captured!');
            resolve('');
            return;
          }

          const fileSizeKB = (bytesWritten / 1024).toFixed(2);
          console.log(`⏱️  Recording: ${recordingDuration}s | Size: ${fileSizeKB} KB | Max amplitude: ${maxAmplitude}`);

          const transcriptionStartTime = Date.now();

          // Use standalone Node.js script to avoid ts-node/import issues
          const { stdout } = await execFileAsync('node', [
            './transcribe.js',
            tempFile,
            this.modelPath
          ], {
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            timeout: 60000 // 60 second timeout
          });

          const transcriptionEndTime = Date.now();
          const transcriptionDuration = ((transcriptionEndTime - transcriptionStartTime) / 1000).toFixed(2);

          const transcribedText = stdout.trim();

          // Clean up temp file
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

      wavWriter.on('error', (error) => {
        console.error('❌ WAV writer error:', error);
        reject(error);
      });

      audioStream.on('error', (error) => {
        console.error('❌ Audio stream error:', error);
        reject(error);
      });
    });
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.release();
      this.context = null;
    }
  }
}
