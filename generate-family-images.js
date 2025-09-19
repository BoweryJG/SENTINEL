const https = require('https');
const fs = require('fs').promises;
const path = require('path');

// Replicate API configuration
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || 'YOUR_REPLICATE_API_TOKEN';
const OUTPUT_DIR = '/mnt/c/Users/jason/Bowery Images';

// Award-winning family moment prompts
const IMAGE_PROMPTS = [
  {
    name: 'piano-lesson-golden-hour',
    prompt: 'Award-winning photograph by Annie Leibovitz: Elegant grandmother in cream cashmere sweater teaching young granddaughter piano in sun-drenched conservatory, golden hour light streaming through tall windows creating beautiful lens flares, Steinway grand piano, fresh white peonies in crystal vases, shot from low angle showing both their hands on ivory keys, pure joy and connection on their faces, grandmother age 68 with silver hair in chignon, granddaughter age 7 with blonde curls, photorealistic, 85mm lens, shallow depth of field, Hasselblad quality, emotional storytelling, warm color grading, magazine cover quality'
  },
  {
    name: 'cookie-conspiracy-kitchen',
    prompt: 'Cinematic photograph in style of Mario Testino: Distinguished grandfather in navy Ralph Lauren cable-knit sweater vest and oxford shirt with grandson age 8 playfully stealing warm chocolate chip cookies from marble kitchen island, mischievous matching grins, grandmother laughing warmly in soft-focus background wearing pearls, Williams-Sonoma aesthetic kitchen with copper pots, shot with Rembrandt lighting, 50mm lens, bokeh, photorealistic, warm afternoon light through windows, high-end lifestyle photography, Vanity Fair quality'
  },
  {
    name: 'garden-legacy-roses',
    prompt: 'Vogue garden photography: Sophisticated grandmother in Hermès silk scarf and wide-brimmed straw hat teaching granddaughter age 6 to plant David Austin roses in English cottage garden, morning golden light with dew drops glistening on leaves, monarch butterflies in motion blur, both kneeling on vintage Liberty print gardening cushions, wicker basket with gardening tools, shot through foreground roses for dreamy bokeh, 35mm lens, photorealistic, Town & Country magazine aesthetic, timeless elegance'
  },
  {
    name: 'chess-masters-library',
    prompt: 'Dramatic photograph by Irving Penn: Silver-haired grandfather in forest green tweed jacket with elbow patches teaching focused grandson age 10 chess beside roaring fireplace in mahogany-paneled library, floor-to-ceiling leather-bound books, golden firelight creating Caravaggio shadows on their concentrated faces, antique chess set on leather-inlaid game table, crystal whiskey decanter, overhead shot showing board and hands, photorealistic, medium format camera quality, rich color depth'
  },
  {
    name: 'teatime-tales-sunroom',
    prompt: 'Elegant lifestyle photograph: Refined grandmother in ivory Chanel bouclé suit hosting elaborate afternoon tea with two granddaughters ages 5 and 7 in conservatory sunroom, Wedgwood fine china and sterling silver tea service, three-tier stand with French macarons and petit fours, little girls in smocked Liberty of London dresses, dappled sunlight through lace curtains creating beautiful patterns, everyone laughing naturally, shot at eye level, photorealistic, 85mm portrait lens, Harper\'s Bazaar quality'
  },
  {
    name: 'art-studio-celebration',
    prompt: 'Joyful photograph in Richard Avedon style: Grandfather and three grandchildren painting at easels in bright artist studio, all wearing paint-splattered aprons over nice clothes, high-fiving with colorful paint on hands, abstract paintings on easels, dramatic side window light creating long shadows, genuine uninhibited laughter, grandfather in chambray shirt, children ages 6-9, photorealistic, wide angle 24mm lens showing whole scene, Life magazine quality, authentic emotions'
  },
  {
    name: 'storytime-under-stars',
    prompt: 'Magical evening photograph: Grandparents and four grandchildren on quilted blanket in manicured backyard garden at blue hour dusk, warm string lights overhead creating beautiful bokeh, grandfather holding leather-bound storybook with vintage brass flashlight, children in cozy pajamas leaning in with wonder, telescope and thermos of hot cocoa nearby, shot from above showing intimate family circle, photorealistic, 35mm lens, National Geographic quality, fireflies visible'
  },
  {
    name: 'sunday-brunch-farmhouse',
    prompt: 'Norman Rockwell inspired photograph: Multi-generational family around long reclaimed wood farmhouse table, grandmother in apron serving fresh cinnamon rolls from cast iron skillet, grandfather pouring fresh orange juice into crystal glasses, four grandchildren reaching excitedly, golden morning sunlight streaming through French doors, fresh wildflowers in mason jars, shot length-wise down table, photorealistic, everyone connected and joyful, 24mm lens, Southern Living magazine quality'
  },
  {
    name: 'waltz-lesson-ballroom',
    prompt: 'Romantic photograph by Patrick Demarchelier: Grandfather in navy suspenders and bow tie teaching granddaughter age 8 to waltz in elegant ballroom, her small feet standing on his polished oxfords, grandmother playing Steinway piano in soft background, crystal chandelier casting prismatic rainbow light, parquet floors reflecting light, slight motion blur on dress hem showing movement, shot from low angle, photorealistic, 50mm lens, pure magic and love, Conde Nast quality'
  },
  {
    name: 'victory-lap-backyard',
    prompt: 'Triumphant sports photograph: Grandparents cheering enthusiastically as three grandchildren cross improvised finish line in backyard, homemade ribbons and medals ready, golden hour backlighting creating halos around everyone\'s hair, golden retriever running alongside, American flag on pole in background, grandfather with arms raised, grandmother clapping, freeze-frame capturing pure pride and triumph, photorealistic, 70-200mm telephoto compression, Sports Illustrated emotional quality'
  }
];

async function generateImage(prompt, imageName) {
  console.log(`\nGenerating: ${imageName}`);

  const data = JSON.stringify({
    version: "black-forest-labs/flux-1.1-pro",
    input: {
      prompt: prompt.prompt,
      aspect_ratio: "16:9",
      output_format: "webp",
      output_quality: 100,
      num_inference_steps: 25,
      guidance: 3.5,
      seed: Math.floor(Math.random() * 1000000)
    }
  });

  const options = {
    hostname: 'api.replicate.com',
    path: '/v1/predictions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', async () => {
        try {
          const prediction = JSON.parse(responseData);

          if (prediction.error) {
            console.error(`Error for ${imageName}:`, prediction.error);
            reject(prediction.error);
            return;
          }

          console.log(`Waiting for ${imageName} to complete...`);

          // Poll for completion
          const result = await pollPrediction(prediction.id);

          if (result && result.output) {
            // Download the image
            const imagePath = path.join(OUTPUT_DIR, `sentinel-${prompt.name}.webp`);
            await downloadImage(result.output, imagePath);
            console.log(`✅ Saved: ${imagePath}`);
            resolve(imagePath);
          } else {
            reject('No output from generation');
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function pollPrediction(predictionId) {
  const checkStatus = () => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.replicate.com',
        path: `/v1/predictions/${predictionId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
        }
      };

      https.get(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      }).on('error', reject);
    });
  };

  // Poll every 2 seconds
  while (true) {
    const result = await checkStatus();

    if (result.status === 'succeeded') {
      return result;
    } else if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(`Generation failed: ${result.error || result.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function downloadImage(url, filepath) {
  if (Array.isArray(url)) {
    url = url[0];
  }

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];

      response.on('data', (chunk) => {
        chunks.push(chunk);
      });

      response.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(filepath, buffer);
        resolve();
      });

      response.on('error', reject);
    });
  });
}

async function generateAllImages() {
  console.log('🎨 Starting generation of 10 award-winning family images...');
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);

  // Ensure output directory exists
  try {
    await fs.access(OUTPUT_DIR);
  } catch {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }

  const results = [];

  // Generate images sequentially to avoid rate limits
  for (const prompt of IMAGE_PROMPTS) {
    try {
      const imagePath = await generateImage(prompt, prompt.name);
      results.push({ name: prompt.name, path: imagePath, success: true });

      // Wait between generations to avoid rate limits
      console.log('Waiting 5 seconds before next generation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`Failed to generate ${prompt.name}:`, error);
      results.push({ name: prompt.name, error: error.message, success: false });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('GENERATION COMPLETE');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successfully generated: ${successful.length} images`);
  if (successful.length > 0) {
    successful.forEach(img => {
      console.log(`   - ${img.name}`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length} images`);
    failed.forEach(img => {
      console.log(`   - ${img.name}: ${img.error}`);
    });
  }

  console.log(`\nAll images saved to: ${OUTPUT_DIR}`);
  console.log('\nThese epic family moments are ready for the SENTINEL website!');
}

// Run the generation
generateAllImages().catch(console.error);