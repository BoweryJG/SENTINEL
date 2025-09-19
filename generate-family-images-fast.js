const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || 'YOUR_REPLICATE_API_TOKEN';
const OUTPUT_DIR = '/mnt/c/Users/jason/Bowery Images';

// Remaining 8 prompts (since 2 already generated)
const IMAGE_PROMPTS = [
  {
    name: 'garden-legacy-roses',
    prompt: 'Award-winning photograph: Elegant grandmother teaching granddaughter to plant roses in English garden, morning golden light, butterflies, both kneeling on gardening cushions, photorealistic, 35mm lens, magazine quality'
  },
  {
    name: 'chess-masters-library',
    prompt: 'Dramatic photograph: Grandfather teaching grandson chess by fireplace in library, leather books, golden firelight, overhead shot of chess board, photorealistic, rich colors'
  },
  {
    name: 'teatime-tales-sunroom',
    prompt: 'Elegant photograph: Grandmother hosting tea party with granddaughters in sunroom, fine china, macarons, girls in pretty dresses, sunlight through curtains, photorealistic'
  },
  {
    name: 'art-studio-celebration',
    prompt: 'Joyful photograph: Grandfather and grandchildren painting together, paint on hands, genuine laughter, bright studio light, photorealistic, authentic emotions'
  },
  {
    name: 'storytime-under-stars',
    prompt: 'Magical evening photograph: Grandparents reading to grandchildren outside at dusk, string lights, storybook, cozy pajamas, photorealistic'
  },
  {
    name: 'sunday-brunch-farmhouse',
    prompt: 'Family photograph: Multi-generational family at farmhouse table, grandmother serving cinnamon rolls, morning sunlight, everyone joyful, photorealistic'
  },
  {
    name: 'waltz-lesson-ballroom',
    prompt: 'Romantic photograph: Grandfather teaching granddaughter to waltz, her feet on his shoes, chandelier light, elegant ballroom, photorealistic'
  },
  {
    name: 'victory-lap-backyard',
    prompt: 'Triumphant photograph: Grandparents cheering as grandchildren finish backyard race, golden hour light, pure joy and pride, photorealistic'
  }
];

async function createPrediction(prompt) {
  const data = JSON.stringify({
    version: "black-forest-labs/flux-schnell",  // Faster model
    input: {
      prompt: prompt.prompt,
      num_outputs: 1,
      aspect_ratio: "16:9",
      output_format: "webp",
      output_quality: 90,
      go_fast: true
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.replicate.com',
      path: '/v1/predictions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const result = JSON.parse(body);
        if (result.error) reject(result.error);
        else resolve(result);
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitForCompletion(id, name) {
  console.log(`⏳ Waiting for ${name}...`);

  while (true) {
    await new Promise(r => setTimeout(r, 1000));

    const result = await new Promise((resolve, reject) => {
      https.get({
        hostname: 'api.replicate.com',
        path: `/v1/predictions/${id}`,
        headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    if (result.status === 'succeeded' && result.output) {
      return result.output;
    } else if (result.status === 'failed') {
      throw new Error(result.error || 'Generation failed');
    }
  }
}

async function downloadImage(url, filepath) {
  if (Array.isArray(url)) url = url[0];

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', async () => {
        await fs.writeFile(filepath, Buffer.concat(chunks));
        resolve();
      });
      res.on('error', reject);
    });
  });
}

async function main() {
  console.log('🚀 Fast parallel generation of remaining 8 family images...\n');

  // Start all generations in parallel
  const predictions = await Promise.all(
    IMAGE_PROMPTS.map(async (prompt) => {
      try {
        console.log(`🎨 Starting: ${prompt.name}`);
        const pred = await createPrediction(prompt);
        return { ...prompt, id: pred.id, status: 'started' };
      } catch (error) {
        console.error(`❌ Failed to start ${prompt.name}: ${error}`);
        return { ...prompt, status: 'failed', error };
      }
    })
  );

  console.log('\n⏳ All generations started, waiting for completion...\n');

  // Wait for all to complete
  const results = await Promise.all(
    predictions.map(async (pred) => {
      if (pred.status === 'failed') return pred;

      try {
        const output = await waitForCompletion(pred.id, pred.name);
        const filepath = path.join(OUTPUT_DIR, `sentinel-${pred.name}.webp`);
        await downloadImage(output, filepath);
        console.log(`✅ Saved: sentinel-${pred.name}.webp`);
        return { ...pred, status: 'success', filepath };
      } catch (error) {
        console.error(`❌ Failed ${pred.name}: ${error.message}`);
        return { ...pred, status: 'failed', error: error.message };
      }
    })
  );

  // Summary
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Successfully generated: ${successful}/8 images`);
  console.log(`❌ Failed: ${failed}/8 images`);
  console.log('\nAll images saved to:', OUTPUT_DIR);
  console.log('\n🎉 Your award-winning family images are ready for SENTINEL!');
}

main().catch(console.error);