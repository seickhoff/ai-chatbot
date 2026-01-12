# AI Voice Chatbot

A voice-activated AI chatbot that listens to your voice, converts it to text, processes it with ChatGPT, and responds with synthesized speech. **Completely free and offline** for speech recognition and text-to-speech!

## Architecture Flow

```
Voice Input (Microphone)
   ↓
Speech-to-Text (Whisper - FREE & OFFLINE)
   ↓
ChatGPT (OpenAI)
   ↓
Text-to-Speech (say.js - FREE & OFFLINE)
   ↓
Audio Output (Speaker)
```

## Tech Stack

- TypeScript
- Node.js
- OpenAI API (ChatGPT) - Only paid component
- **Whisper.cpp** - Free, offline speech-to-text (via @fugood/whisper.node)
- **say.js** - Free, offline text-to-speech
- node-record-lpcm16 (audio recording)
- speaker (audio playback)

## Why This Stack?

- **No Google Cloud costs** - Whisper and say.js are completely free
- **Offline capable** - Works without internet (except for ChatGPT API)
- **GPU accelerated** - Uses Metal on macOS Apple Silicon for fast transcription
- **Cross-platform** - Same code runs on macOS and Raspberry Pi
- **State-of-the-art accuracy** - OpenAI's Whisper model is highly accurate

## Prerequisites

Follow the instructions **for your platform only** (macOS OR Raspberry Pi, not both).

---

### If you're on **macOS** (MacBook Pro):

**Step 1: Use Node.js v20 (LTS)**

**IMPORTANT:** This project requires Node.js v20. Node.js v22 will cause compilation errors.

```bash
# If using nvm:
nvm install 20
nvm use 20
node --version  # Should show v20.x.x
```

**Step 2: Install SoX for audio recording**
```bash
brew install sox
```

**Step 3: Text-to-speech**
Nothing to install! macOS has built-in speech synthesis.

---

### If you're on **Raspberry Pi 4 / Linux**:

**Step 1: Audio recording**
Nothing to install! ALSA is pre-installed on Raspberry Pi OS.

**Step 2: Install Festival for text-to-speech**
```bash
sudo apt-get update
sudo apt-get install festival festvox-kallpc16k
```

---

### For **ALL platforms** (macOS AND Raspberry Pi):

#### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key

#### 2. Download Whisper Speech Model

Download a Whisper model (choose based on your needs):

| Model | Size | Quality | Speed | Recommended For |
|-------|------|---------|-------|-----------------|
| ggml-tiny.en.bin | 75 MB | Basic | Very Fast | Testing |
| **ggml-base.en.bin** | **142 MB** | **Good** | **Fast** | **Recommended** |
| ggml-small.en.bin | 466 MB | Better | Medium | Desktop |
| ggml-medium.en.bin | 1.5 GB | Great | Slow | High Accuracy |

**On macOS:**
```bash
mkdir -p models
cd models
# Download base model (recommended)
curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
cd ..
```

**On Raspberry Pi:**
```bash
mkdir -p models
cd models
# Download base model (recommended)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
cd ..
```

**Or download manually:**
1. Visit [Whisper Models on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
2. Download `ggml-base.en.bin` (142MB)
3. Save to `./models/` directory in your project

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit [.env](.env) and add your OpenAI API key:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview
WHISPER_MODEL_PATH=./models/ggml-base.en.bin
```

## Usage

### Development mode with auto-reload

```bash
npm run dev
```

### Build and run production

```bash
npm run build
npm start
```

### Format code

```bash
npm run format
```

## Project Structure

```
ai-chatbot/
├── src/
│   ├── services/
│   │   ├── AudioInputService.ts      # Microphone recording
│   │   ├── WhisperSTTService.ts      # Whisper speech-to-text
│   │   ├── ChatGPTService.ts         # OpenAI conversation
│   │   ├── SayTTSService.ts          # say.js text-to-speech
│   │   └── AudioOutputService.ts     # Speaker output
│   └── index.ts                       # Main orchestrator
├── models/                            # Whisper models directory
├── package.json
├── tsconfig.json
├── .prettierrc
└── nodemon.json
```

## How It Works

1. **AudioInputService** captures audio from your microphone (automatically uses SoX on macOS or ALSA on Raspberry Pi)
2. **WhisperSTTService** converts the audio stream to text using Whisper.cpp (offline, free, GPU-accelerated on macOS)
3. **ChatGPTService** processes the text and generates a response (maintains conversation history)
4. **SayTTSService** converts the response text to audio using say.js (offline, free)
5. **AudioOutputService** plays the audio response through your speakers

## Platform Support

The code is designed to run on both:
- **macOS** - For prototyping and development (uses SoX for recording, native speech for TTS, Metal GPU acceleration for STT)
- **Raspberry Pi 4** - For deployment (uses ALSA for recording, Festival for TTS, CPU-optimized STT)

Simply run the same code on either platform - all components are auto-detected!

## Cost Breakdown

- **Speech-to-Text (Whisper):** FREE ✅
- **Text-to-Speech (say.js):** FREE ✅
- **ChatGPT API:** Pay per use (only cost in the system)
- **Total setup cost:** $0 + OpenAI API usage

## Next Steps

- Add continuous listening loop
- Implement wake word detection
- Add support for multiple languages (Vosk supports 20+ languages)
- Create web interface

## Troubleshooting

### Problem: npm install fails with compilation errors

**This should no longer happen!** The project now uses Whisper instead of Vosk, which doesn't have ffi-napi compatibility issues. If you still encounter errors, ensure you're using Node.js v20.

### Problem: Audio recording not working

**On macOS only:**
Ensure SoX is installed:
```bash
sox --version
```
If not installed: `brew install sox`

**On Raspberry Pi only:**
Test your microphone with ALSA:
```bash
arecord -l  # List recording devices
arecord -d 3 test.wav  # Record 3 second test
aplay test.wav  # Play it back
```

### Problem: Whisper model not found error

**All platforms:**
Make sure you've downloaded the Whisper model to `./models/`:
```bash
ls -la models/
# Should show: ggml-base.en.bin (or whichever model you downloaded)
```

If missing, download it:
```bash
cd models
curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
cd ..
```

### Problem: Text-to-speech not working

**On macOS:**
Should work out of the box. Test with:
```bash
say "Hello world"
```

**On Raspberry Pi only:**
Install Festival:
```bash
sudo apt-get install festival festvox-kallpc16k
# Test it:
echo "Hello world" | festival --tts
```

### Problem: OpenAI API errors

**All platforms:**
Check that your API key is valid and you have sufficient credits in your `.env` file.

## Upgrading Speech Quality

For better TTS quality on Raspberry Pi, consider:
- **Piper TTS** - Neural TTS with excellent quality (requires additional setup)
- See [Piper TTS GitHub](https://github.com/rhasspy/piper) for installation

For better STT accuracy:
- Use a larger Vosk model (e.g., `vosk-model-en-us-0.22`)
- Trade-off: Larger models use more memory
