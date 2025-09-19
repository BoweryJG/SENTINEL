const https = require('https');
const fs = require('fs');
const path = require('path');

const teamImages = [
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/06/Our-Team-1-350x350.webp',
    filename: 'dan-townsley.webp'
  },
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/06/Our-Team-2-350x350.webp',
    filename: 'jennifer-townsley.webp'
  },
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/06/Our-Team-3-350x350.webp',
    filename: 'lucas-seidler.webp'
  },
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/06/Our-Team-5-350x350.webp',
    filename: 'jasmine-doshi.webp'
  },
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/06/Our-Team-6-350x350.webp',
    filename: 'andrea-rivera.webp'
  },
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/06/Our-Team-7-350x350.webp',
    filename: 'shannon-sell.webp'
  },
  {
    url: 'https://www.livingcarehomeservices.com/wp-content/uploads/2025/07/zakrzewski-paul-1467454116-350x350.jpg',
    filename: 'dr-zakrzewski.jpg'
  }
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded: ${path.basename(filepath)}`);
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadAllImages() {
  console.log('Downloading team images...\n');
  
  for (const image of teamImages) {
    try {
      const filepath = path.join('/home/jason/repos/SENTINEL/assets/images/team', image.filename);
      await downloadImage(image.url, filepath);
    } catch (error) {
      console.error(`✗ Failed to download ${image.filename}:`, error.message);
    }
  }
  
  console.log('\n✓ All team images download complete!');
}

downloadAllImages();