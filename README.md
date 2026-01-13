# AI Voice Chatbot

A voice-activated AI chatbot that listens to your voice, converts it to text, processes it with ChatGPT, and responds with synthesized speech. **Completely free and offline** for speech recognition and text-to-speech!

## Architecture Flow

```
Voice Input (Microphone) → Continuous Recording Stream
   ↓
Wake Word Detection ("Isis") → Volume-based Silence Detection
   ↓
Speech-to-Text (Whisper - FREE & OFFLINE)
   ↓
ChatGPT (OpenAI)
   ↓
Text-to-Speech (say.js - FREE & OFFLINE)
   ↓
Audio Output (Speaker)
   ↓
Return to Wake Word Listening (Continuous Loop)
```

### Key Features

- **Wake Word Activation**: Say "Isis" to activate the assistant
- **Continuous Recording**: Sox/ALSA runs continuously - no stop/start delays
- **Volume-based Silence Detection**: Automatically stops recording after 1.5s of silence
- **Instant Response**: No 3-second delay between wake word cycles
- **Configurable Threshold**: Adjust `VOLUME_THRESHOLD` in `.env` for your environment

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
OPENAI_MODEL=gpt-4o-mini
WHISPER_MODEL_PATH=./models/ggml-base.en.bin

# Volume threshold for silence detection (higher = less sensitive)
# Adjust based on your microphone and environment
VOLUME_THRESHOLD=900

# Optional: Enable test mode to echo back without ChatGPT
TEST_MODE=false

# Optional: Calibrate noise floor on startup
CALIBRATE_NOISE=false
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
│   │   ├── AudioInputService.ts           # Microphone recording (continuous mode)
│   │   ├── ContinuousListenerService.ts   # Wake word & command detection
│   │   ├── WhisperSTTService.ts           # Whisper speech-to-text
│   │   ├── ChatGPTService.ts              # OpenAI conversation
│   │   ├── SayTTSService.ts               # say.js text-to-speech
│   │   └── AudioOutputService.ts          # Speaker output
│   ├── index.ts                            # Main orchestrator
│   └── transcribe.js                       # Whisper transcription worker
├── models/                                 # Whisper models directory
├── package.json
├── tsconfig.json
├── .prettierrc
└── nodemon.json
```

## How It Works

### Continuous Recording Architecture

1. **AudioInputService** starts continuous recording using Sox (macOS) or ALSA (Raspberry Pi)
   - Single sox/arecord process runs throughout the entire session
   - No stop/start delays between interactions

2. **ContinuousListenerService** manages the audio stream in two modes:
   - **Wake Word Mode**: Buffers audio chunks, detects silence, transcribes, checks for "Isis"
   - **Command Mode**: Listens for user command after wake word detected
   - Single data handler switches between modes seamlessly

3. **Volume-based Silence Detection**:
   - Monitors audio volume in real-time
   - Triggers transcription after 1.5s of silence below threshold
   - Threshold configurable via `VOLUME_THRESHOLD` in `.env` (default: 900)

4. **WhisperSTTService** converts buffered audio to text:
   - Uses Whisper.cpp (offline, free)
   - GPU-accelerated on macOS (Metal)
   - CPU-optimized on Raspberry Pi

5. **ChatGPTService** processes the command and generates a response
   - Maintains conversation history

6. **SayTTSService** converts response to speech (offline, free)

7. **AudioOutputService** plays the response through speakers

8. Returns to wake word listening mode (continuous loop)

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

## Raspberry Pi Deployment

This code will work on Raspberry Pi 4 without modification! The architecture uses:

- **ALSA** for audio recording (built into Raspberry Pi OS)
- **Whisper.cpp** for speech-to-text (CPU-optimized)
- **Festival** for text-to-speech (install with `apt-get`)
- **Same continuous recording approach** - single arecord process runs throughout session

### Platform Auto-Detection

The code automatically detects your platform and uses the appropriate tools:

| Component | macOS | Raspberry Pi |
|-----------|-------|--------------|
| Recording | Sox | ALSA (arecord) |
| TTS | Built-in `say` | Festival |
| STT | Whisper (Metal GPU) | Whisper (CPU) |
| Continuous Mode | ✅ | ✅ |

Simply run `npm start` on either platform - everything works the same way!

## Future Enhancements

- Add support for multiple wake words
- Implement conversation context pruning
- Add support for multiple languages
- Create web interface for remote control

## Troubleshooting

### Problem: Wake word not detected

**Solution:** Adjust `VOLUME_THRESHOLD` in `.env`

The volume threshold determines what counts as "silence" vs "speech". If the wake word isn't being detected:

1. Watch the volume logs: `📊 Volume: 6945 (21.2%)`
2. Your speaking volume should be **above** the threshold
3. Background silence should be **below** the threshold
4. Adjust `VOLUME_THRESHOLD` accordingly:
   - **Too high** (e.g., 5000): Won't detect any speech
   - **Too low** (e.g., 200): Triggers on background noise
   - **Good range**: 400-900 for most environments

You can also run calibration on startup by setting `CALIBRATE_NOISE=true` in `.env`

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
