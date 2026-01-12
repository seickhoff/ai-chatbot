import * as dotenv from 'dotenv';
import { AudioInputService } from './services/AudioInputService';
import { WhisperSTTService } from './services/WhisperSTTService';
import { ChatGPTService } from './services/ChatGPTService';
import { SayTTSService } from './services/SayTTSService';
import { AudioOutputService } from './services/AudioOutputService';

dotenv.config();

class VoiceAssistant {
  private audioInput: AudioInputService;
  private speechToText: WhisperSTTService;
  private chatGPT: ChatGPTService;
  private textToSpeech: SayTTSService;
  private audioOutput: AudioOutputService;

  constructor() {
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const whisperModelPath = process.env.WHISPER_MODEL_PATH || './models/ggml-base.en.bin';

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
      console.log('\n👂 Listening for wake word "hey you"...\n');

      // Record for up to 5 seconds or until 1 second of silence
      const audioStream = this.audioInput.startRecording(0.5, 1.0);
      const transcriptionPromise = this.speechToText.recognizeStream(audioStream);

      // Wait up to 5 seconds, then force stop if needed
      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          this.audioInput.stopRecording();
          resolve();
        }, 5000);
      });

      await Promise.race([transcriptionPromise, timeout]);
      const userText = await transcriptionPromise;

      console.log(`📋 Heard: "${userText}"`);

      // Check if wake word was detected
      const normalizedText = userText.toLowerCase().trim();
      if (normalizedText.includes('hey you') || normalizedText.includes('hey yu')) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error listening for wake word:', error);
      return false;
    }
  }

  async processVoiceInput(): Promise<void> {
    try {
      // Step 1: Listen for wake word
      const wakeWordDetected = await this.listenForWakeWord();

      if (!wakeWordDetected) {
        console.log('⚠️  Wake word not detected. Listening again...\n');
        return;
      }

      // Step 2: Acknowledge wake word
      console.log('\n✅ Wake word detected!\n');
      await this.textToSpeech.speak('Yes');

      // Step 3: Record user command in chunks, checking for "full stop" after each chunk
      console.log('\n🎙️  Listening for your command...\n');
      console.log('💡 Speak your question, then say "full stop" to finish\n');

      let fullTranscription = '';
      let shouldContinue = true;
      const maxIterations = 12; // 12 x 5 seconds = 60 seconds max
      let iteration = 0;

      while (shouldContinue && iteration < maxIterations) {
        iteration++;

        // Record 5-second chunks
        const audioStream = this.audioInput.startRecording(0, 0);
        const transcriptionPromise = this.speechToText.recognizeStream(audioStream);

        // Stop after 5 seconds
        const chunkTimeout = setTimeout(() => {
          this.audioInput.stopRecording();
        }, 5000);

        const chunkText = await transcriptionPromise;
        clearTimeout(chunkTimeout);

        console.log(`📝 Chunk ${iteration}: "${chunkText}"`);

        // Check if this chunk contains "full stop"
        const normalizedChunk = chunkText.toLowerCase().trim();
        if (normalizedChunk.includes('full stop') ||
            normalizedChunk.includes('fullstop') ||
            normalizedChunk.includes('full-stop')) {
          console.log('🛑 Detected "full stop" - ending recording');
          fullTranscription += ' ' + chunkText;
          shouldContinue = false;
        } else if (chunkText.trim().length > 0) {
          fullTranscription += ' ' + chunkText;
          console.log('💡 Continue speaking or say "full stop"...');
          // Brief pause before next chunk
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // Empty chunk - user might be done
          console.log('⚠️  Silence detected. Say something or "full stop" to finish...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const userText = fullTranscription.trim();

      console.log(`📋 Transcription result: "${userText}"`);

      if (!userText || userText.trim().length === 0) {
        console.log('⚠️  No speech detected. Please try again.\n');
        await this.textToSpeech.speak('I didn\'t hear anything');
        return;
      }

      // Remove "full stop" or "period" from the end of the transcription
      let cleanedText = userText.trim();
      const endPhrases = ['full stop', 'fullstop', 'period', 'full-stop'];

      for (const phrase of endPhrases) {
        // Case insensitive removal of end phrase
        const regex = new RegExp(`\\s*${phrase}\\.?\\s*$`, 'i');
        cleanedText = cleanedText.replace(regex, '');
      }

      // Also remove trailing periods that might have been transcribed
      cleanedText = cleanedText.replace(/\.\s*$/, '');

      if (!cleanedText || cleanedText.trim().length === 0) {
        console.log('⚠️  No content after removing end phrase. Please try again.\n');
        await this.textToSpeech.speak('I didn\'t hear anything');
        return;
      }

      console.log(`\n💬 You said: "${cleanedText}"\n`);

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
          if (normalized.includes('yes') ||
              normalized.includes('yeah') ||
              normalized.includes('continue') ||
              normalized.includes('go ahead') ||
              normalized.includes('keep going')) {
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

  async calibrateNoiseFloor(): Promise<number> {
    console.log('\n🔧 Calibrating noise floor...');
    console.log('💡 Please be quiet for 3 seconds...\n');

    const audioStream = this.audioInput.startRecording(0, 0);

    let maxNoise = 0;
    let sampleCount = 0;

    return new Promise((resolve) => {
      audioStream.on('data', (chunk: Buffer) => {
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = Math.abs(chunk.readInt16LE(i));
          if (sample > maxNoise) {
            maxNoise = sample;
          }
          sampleCount++;
        }
      });

      setTimeout(() => {
        this.audioInput.stopRecording();

        // Suggested threshold is 2x the noise floor
        const suggestedThreshold = maxNoise * 2;

        console.log(`\n📊 Calibration complete:`);
        console.log(`   Noise floor: ${maxNoise}`);
        console.log(`   Suggested threshold: ${suggestedThreshold}`);
        console.log(`   Samples analyzed: ${sampleCount}\n`);

        resolve(suggestedThreshold);
      }, 3000);
    });
  }

  async start(): Promise<void> {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     🎤 Voice Assistant Started 🎤     ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Initialize Whisper model
    await this.speechToText.initialize();

    // Optional: Calibrate noise floor
    if (process.env.CALIBRATE_NOISE === 'true') {
      await this.calibrateNoiseFloor();
    }

    console.log('💡 Say "hey you" to activate the assistant\n');

    // Run continuously in a loop
    while (true) {
      await this.processVoiceInput();

      // Brief pause between interactions
      await new Promise(resolve => setTimeout(resolve, 1000));
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
