const record = require('node-record-lpcm16');

console.log('🎤 Testing microphone...');
console.log(`Platform: ${process.platform}`);
console.log(`Record program: ${process.platform === 'darwin' ? 'sox' : 'arecord'}`);
console.log('\nStarting 5-second recording...\n');

let bytesReceived = 0;
let chunkCount = 0;
let maxAmplitude = 0;

const mic = record.record({
  sampleRate: 16000,
  threshold: 0,
  verbose: true,
  recordProgram: process.platform === 'darwin' ? 'sox' : 'arecord',
});

const stream = mic.stream();

stream.on('data', (chunk) => {
  bytesReceived += chunk.length;
  chunkCount++;

  // Calculate max amplitude
  for (let i = 0; i < chunk.length; i += 2) {
    const sample = Math.abs(chunk.readInt16LE(i));
    if (sample > maxAmplitude) {
      maxAmplitude = sample;
    }
  }

  if (chunkCount % 10 === 0) {
    console.log(`Chunk ${chunkCount}: ${(bytesReceived / 1024).toFixed(2)} KB received, max amplitude: ${maxAmplitude}`);
  }
});

stream.on('error', (err) => {
  console.error('❌ Stream error:', err);
});

// Stop after 5 seconds
setTimeout(() => {
  mic.stop();
  console.log('\n📊 Recording complete:');
  console.log(`   Total chunks: ${chunkCount}`);
  console.log(`   Total bytes: ${bytesReceived} (${(bytesReceived / 1024).toFixed(2)} KB)`);
  console.log(`   Max amplitude: ${maxAmplitude}`);

  if (maxAmplitude > 1000) {
    console.log('   ✅ SOUND DETECTED - Microphone is working!');
  } else if (maxAmplitude > 100) {
    console.log('   ⚠️  Very quiet - speak louder or check mic input level');
  } else {
    console.log('   ❌ No sound detected - microphone may not be working');
    console.log('\nTroubleshooting:');
    console.log('   1. Check System Preferences > Sound > Input');
    console.log('   2. Make sure input level is turned up');
    console.log('   3. Try running: sox -d -r 16000 -c 1 test.wav');
  }

  process.exit(0);
}, 5000);

console.log('🎙️  Speak now for 5 seconds...\n');
