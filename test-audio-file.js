const fs = require('fs');

const filePath = process.argv[2] || '/tmp/audio-1768154386716.wav';

console.log(`📂 Analyzing: ${filePath}`);

if (!fs.existsSync(filePath)) {
  console.log('❌ File not found!');
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
console.log(`📊 File size: ${(buffer.length / 1024).toFixed(2)} KB`);

// Skip WAV header (44 bytes) and analyze audio data
const audioData = buffer.slice(44);
let maxAmplitude = 0;
let totalSamples = 0;
let loudSamples = 0;

for (let i = 0; i < audioData.length; i += 2) {
  const sample = Math.abs(audioData.readInt16LE(i));
  totalSamples++;
  if (sample > maxAmplitude) {
    maxAmplitude = sample;
  }
  if (sample > 1000) {
    loudSamples++;
  }
}

console.log(`🔊 Audio analysis:`);
console.log(`   Total samples: ${totalSamples}`);
console.log(`   Max amplitude: ${maxAmplitude}`);
console.log(`   Loud samples (>1000): ${loudSamples} (${((loudSamples/totalSamples)*100).toFixed(2)}%)`);

if (maxAmplitude > 5000) {
  console.log('   ✅ Contains clear audio!');
} else if (maxAmplitude > 1000) {
  console.log('   ⚠️  Contains quiet audio');
} else {
  console.log('   ❌ Mostly silence or very quiet');
}

// Now test with Whisper
console.log('\n🎵 Testing Whisper transcription...');

const { initWhisper } = require('@fugood/whisper.node');

(async () => {
  const context = await initWhisper({
    filePath: './models/ggml-base.en.bin',
    useGpu: process.platform === 'darwin',
  });

  console.log('✅ Whisper context created');

  const { promise } = context.transcribeFile(filePath, {
    language: 'en',
    temperature: 0.0,
    onProgress: (progress) => {
      if (progress % 25 === 0) {
        console.log(`   Progress: ${progress}%`);
      }
    }
  });

  const result = await promise;
  console.log(`\n✅ Transcription: "${result.result}"`);

  await context.release();
})();
