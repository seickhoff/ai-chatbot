// Simple standalone transcription script
const { initWhisper } = require('@fugood/whisper.node');

const filePath = process.argv[2];
const modelPath = process.argv[3] || './models/ggml-base.en.bin';

if (!filePath) {
  console.error('Usage: node transcribe.js <audio-file> [model-path]');
  process.exit(1);
}

(async () => {
  try {
    const context = await initWhisper({
      filePath: modelPath,
      useGpu: process.platform === 'darwin',
    });

    const { promise } = context.transcribeFile(filePath, {
      language: 'en',
      temperature: 0.0,
    });

    const result = await promise;

    // Output ONLY the transcription result (for easy parsing)
    console.log(result.result);

    await context.release();
    process.exit(0);
  } catch (error) {
    console.error('Transcription error:', error.message);
    process.exit(1);
  }
})();
