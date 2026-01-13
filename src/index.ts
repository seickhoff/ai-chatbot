import * as dotenv from 'dotenv';
import { AudioInputService } from './services/AudioInputService';
import { WhisperSTTService } from './services/WhisperSTTService';
import { ChatGPTService } from './services/ChatGPTService';
import { SayTTSService } from './services/SayTTSService';
import { AudioOutputService } from './services/AudioOutputService';
import { ContinuousListenerService } from './services/ContinuousListenerService';
import { Readable } from 'stream';

dotenv.config();

class VoiceAssistant {
  private audioInput: AudioInputService;
  private speechToText: WhisperSTTService;
  private chatGPT: ChatGPTService;
  private textToSpeech: SayTTSService;
  private audioOutput: AudioOutputService;
  private continuousListener: ContinuousListenerService | null = null;
  private continuousStream: Readable | null = null;
  private calibratedThreshold: number = 0.5;
  private calibratedSilenceDuration: number = 1.5;

  private volumeThreshold: number;

  constructor() {
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const whisperModelPath = process.env.WHISPER_MODEL_PATH || './models/ggml-base.en.bin';
    this.volumeThreshold = parseInt(process.env.VOLUME_THRESHOLD || '400', 10);

    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.audioInput = new AudioInputService();
    this.speechToText = new WhisperSTTService(whisperModelPath);
    this.chatGPT = new ChatGPTService(openaiKey, openaiModel);
    this.textToSpeech = new SayTTSService();
    this.audioOutput = new AudioOutputService();
  }

  async listenForWakeWord(): Promise<boolean> {
    try {
      console.log('\n👂 Listening continuously for wake word "Isis"...\n');

      // Start continuous recording if not already started
      if (!this.continuousStream || !this.continuousListener) {
        this.continuousStream = this.audioInput.startContinuousRecording();
        this.continuousListener = new ContinuousListenerService(
          this.speechToText,
          this.volumeThreshold,
          1.5
        );
        // Start the continuous listener
        this.continuousListener.startListening(this.continuousStream);
      }

      // Listen for wake word
      await this.continuousListener.listenForWakeWord();
      return true;
    } catch (error) {
      console.error('❌ Error listening for wake word:', error);
      return false;
    }
  }

  async processVoiceInput(): Promise<void> {
    try {
      // Step 1: Listen for wake word (will loop internally until detected)
      await this.listenForWakeWord();

      // Step 2: Acknowledge wake word
      console.log('\n✅ Wake word detected!\n');
      await this.textToSpeech.speak('Yes');

      // Brief pause to let TTS complete and microphone settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Record user command with automatic stop after 1.5 seconds of silence
      console.log('\n🎙️  Listening for your command...\n');
      console.log(
        `💡 Speak your question (will auto-stop after 1.5 seconds of silence below volume ${this.volumeThreshold})\n`
      );

      // Use continuous stream to listen for command
      let userText = '';
      if (this.continuousListener) {
        userText = await this.continuousListener.listenForCommand();
      } else {
        throw new Error('Continuous listener not initialized');
      }

      console.log(`📋 Transcription result: "${userText}"`);

      if (!userText || userText.trim().length === 0) {
        console.log('⚠️  No speech detected. Please try again.\n');
        await this.textToSpeech.speak("I didn't hear anything");
        return;
      }

      console.log(`\n💬 You said: "${userText}"\n`);

      // Step 4: Get ChatGPT response (or use test mode)
      let assistantResponse: string;
      if (process.env.TEST_MODE === 'true') {
        console.log('🧪 Test mode - echoing back what you said...');
        assistantResponse = `I heard you say: ${userText}`;
      } else {
        console.log('🤖 Sending to ChatGPT...');
        assistantResponse = await this.chatGPT.sendMessage(userText);
      }
      console.log(`\n🤖 Assistant: "${assistantResponse}"\n`);

      // Step 5: Speak the response in chunks with continuation prompts
      console.log('🔊 Speaking response...\n');

      // Split response into sentences
      const sentences = assistantResponse.match(/[^.!?]+[.!?]+/g) || [assistantResponse];

      let shouldContinueSpeaking = true;
      let sentenceIndex = 0;

      while (shouldContinueSpeaking && sentenceIndex < sentences.length) {
        // Speak up to 2 sentences at a time
        const chunk = sentences.slice(sentenceIndex, sentenceIndex + 2).join(' ');
        await this.textToSpeech.speak(chunk);

        sentenceIndex += 2;

        // If there are more sentences, ask if user wants to continue
        if (sentenceIndex < sentences.length) {
          await this.textToSpeech.speak('Should I continue?');

          // Listen for yes/no response
          const confirmStream = this.audioInput.startRecording(0, 0);
          const confirmPromise = this.speechToText.recognizeStream(confirmStream);

          setTimeout(() => this.audioInput.stopRecording(), 3000);

          const userResponse = await confirmPromise;
          const normalized = userResponse.toLowerCase().trim();

          console.log(`📋 User response: "${userResponse}"`);

          // Check for affirmative response
          if (
            normalized.includes('yes') ||
            normalized.includes('yeah') ||
            normalized.includes('continue') ||
            normalized.includes('go ahead') ||
            normalized.includes('keep going')
          ) {
            shouldContinueSpeaking = true;
          } else {
            // Any other response (including "no", silence, or unclear) stops
            shouldContinueSpeaking = false;
            await this.textToSpeech.speak('Okay, stopping here.');
          }
        }
      }

      console.log('\n✅ Done!\n');
    } catch (error) {
      console.error('❌ Error processing voice input:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
    }
  }

  async calibrateNoiseFloor(): Promise<{ threshold: number; silenceDuration: number }> {
    console.log('\n🔧 Calibrating audio levels...\n');

    // Step 1: Measure background noise
    console.log('📊 Step 1: Measuring background noise');
    console.log('💡 Please be completely quiet for 3 seconds...\n');

    const silenceStream = this.audioInput.startRecording(0, 0);
    let maxNoise = 0;

    await new Promise<void>((resolve) => {
      silenceStream.on('data', (chunk: Buffer) => {
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = Math.abs(chunk.readInt16LE(i));
          if (sample > maxNoise) {
            maxNoise = sample;
          }
        }
      });

      setTimeout(() => {
        this.audioInput.stopRecording();
        console.log(`✅ Background noise level: ${maxNoise}\n`);
        resolve();
      }, 3000);
    });

    // Brief pause
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 2: Measure speaking volume
    console.log('📊 Step 2: Measuring your speaking volume');
    console.log('💡 Please speak normally for 3 seconds (say anything)...\n');

    const speakStream = this.audioInput.startRecording(0, 0);
    let maxSpeech = 0;

    await new Promise<void>((resolve) => {
      speakStream.on('data', (chunk: Buffer) => {
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = Math.abs(chunk.readInt16LE(i));
          if (sample > maxSpeech) {
            maxSpeech = sample;
          }
        }
      });

      setTimeout(() => {
        this.audioInput.stopRecording();
        console.log(`✅ Speaking volume: ${maxSpeech}\n`);
        resolve();
      }, 3000);
    });

    // Calculate optimal threshold
    // Threshold should be between noise and speech, closer to noise
    const range = maxSpeech - maxNoise;
    const optimalThreshold = maxNoise + range * 0.3; // 30% above noise floor

    // Convert to sox threshold format (0.0 to 1.0 scale)
    // sox threshold is percentage of max possible amplitude (32767)
    let soxThreshold = optimalThreshold / 32767;

    // Cap threshold at reasonable maximum (50% = 0.5)
    // If threshold is too high, silence detection won't work
    if (soxThreshold > 0.5) {
      console.log(
        `⚠️  Calculated threshold too high (${(soxThreshold * 100).toFixed(1)}%), capping at 50%`
      );
      soxThreshold = 0.5;
    }

    // Ensure minimum threshold of 1% to avoid false triggers
    if (soxThreshold < 0.01) {
      console.log(
        `⚠️  Calculated threshold too low (${(soxThreshold * 100).toFixed(1)}%), setting to 1%`
      );
      soxThreshold = 0.01;
    }

    console.log(`\n📊 Calibration Results:`);
    console.log(`   Background noise: ${maxNoise}`);
    console.log(`   Speaking volume: ${maxSpeech}`);
    console.log(
      `   Optimal threshold: ${optimalThreshold.toFixed(0)} (${(soxThreshold * 100).toFixed(1)}%)`
    );
    console.log(`   Recommended silence duration: 1.5s\n`);

    return {
      threshold: parseFloat(soxThreshold.toFixed(2)),
      silenceDuration: 1.5,
    };
  }

  async start(): Promise<void> {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     🎤 Voice Assistant Started 🎤     ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Initialize Whisper model
    await this.speechToText.initialize();

    // Calibrate audio levels
    const calibrationResult = await this.calibrateNoiseFloor();
    this.calibratedThreshold = calibrationResult.threshold;
    this.calibratedSilenceDuration = calibrationResult.silenceDuration;

    console.log('💡 Say "Isis" to activate the assistant\n');

    // Run continuously in a loop
    while (true) {
      await this.processVoiceInput();

      // Brief pause between interactions
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  try {
    const assistant = new VoiceAssistant();
    await assistant.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
