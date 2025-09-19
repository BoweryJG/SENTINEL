const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class LivingCareScraper {
  constructor() {
    this.baseUrl = 'https://www.livingcarehomeservices.com';
    this.visitedUrls = new Set();
    this.allData = {
      pages: [],
      images: [],
      contactInfo: {
        phones: new Set(),
        emails: new Set(),
        addresses: new Set()
      },
      services: [],
      testimonials: [],
      team: [],
      metadata: {}
    };
  }

  async init() {
    // Create directories for storing data
    await fs.mkdir('scraped-data', { recursive: true });
    await fs.mkdir('scraped-data/images', { recursive: true });
    await fs.mkdir('scraped-data/content', { recursive: true });

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });
  }

  async scrapeAllPages() {
    console.log('Starting comprehensive scrape of Living Care Home Services...');

    try {
      // Start with the homepage
      await this.scrapePage(this.baseUrl);

      // Get all internal links from homepage
      const page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(this.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      const internalLinks = await page.evaluate((baseUrl) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        return links
          .map(link => link.href)
          .filter(href => href.startsWith(baseUrl) || href.startsWith('/'))
          .map(href => {
            if (href.startsWith('/')) {
              return new URL(href, baseUrl).href;
            }
            return href;
          });
      }, this.baseUrl);

      await page.close();

      // Scrape each internal page
      for (const link of [...new Set(internalLinks)]) {
        if (!this.visitedUrls.has(link)) {
          await this.scrapePage(link);
        }
      }

    } catch (error) {
      console.error('Error during scraping:', error);
    }
  }

  async scrapePage(url) {
    if (this.visitedUrls.has(url)) return;
    this.visitedUrls.add(url);

    console.log(`Scraping: ${url}`);
    const page = await this.browser.newPage();

    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract all data from the page
      const pageData = await page.evaluate(() => {
        const data = {
          url: window.location.href,
          title: document.title,
          meta: {},
          content: {
            headings: {},
            paragraphs: [],
            lists: [],
            tables: [],
            forms: []
          },
          images: [],
          links: [],
          scripts: [],
          styles: []
        };

        // Get meta tags
        document.querySelectorAll('meta').forEach(meta => {
          const name = meta.getAttribute('name') || meta.getAttribute('property');
          if (name) {
            data.meta[name] = meta.getAttribute('content');
          }
        });

        // Get all headings
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
          data.content.headings[tag] = Array.from(document.querySelectorAll(tag))
            .map(el => el.textContent.trim());
        });

        // Get paragraphs
        data.content.paragraphs = Array.from(document.querySelectorAll('p'))
          .map(p => p.textContent.trim())
          .filter(text => text.length > 0);

        // Get lists
        data.content.lists = Array.from(document.querySelectorAll('ul, ol')).map(list => ({
          type: list.tagName.toLowerCase(),
          items: Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim())
        }));

        // Get images with all attributes
        data.images = Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.alt,
          title: img.title,
          width: img.width,
          height: img.height,
          dataset: {...img.dataset}
        }));

        // Get all links
        data.links = Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.textContent.trim(),
          title: a.title,
          target: a.target
        }));

        // Get forms
        data.content.forms = Array.from(document.querySelectorAll('form')).map(form => ({
          action: form.action,
          method: form.method,
          fields: Array.from(form.querySelectorAll('input, textarea, select')).map(field => ({
            type: field.type || field.tagName.toLowerCase(),
            name: field.name,
            placeholder: field.placeholder,
            required: field.required,
            value: field.value
          }))
        }));

        // Get all text content
        data.content.fullText = document.body.innerText;

        // Get HTML for preservation
        data.content.html = document.documentElement.outerHTML;

        return data;
      });

      // Extract contact information
      this.extractContactInfo(pageData);

      // Extract services
      this.extractServices(pageData);

      // Extract testimonials
      this.extractTestimonials(pageData);

      // Extract team information
      this.extractTeamInfo(pageData);

      // Store page data
      this.allData.pages.push(pageData);

      // Save page HTML
      const pageName = url.replace(this.baseUrl, '').replace(/\//g, '_') || 'index';
      await fs.writeFile(
        path.join('scraped-data', 'content', `${pageName}.html`),
        pageData.content.html
      );

      // Download images from this page
      await this.downloadImages(pageData.images);

      // Take full page screenshot
      await page.screenshot({
        path: path.join('scraped-data', 'images', `screenshot_${pageName}.png`),
        fullPage: true
      });

    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
    } finally {
      await page.close();
    }
  }

  extractContactInfo(pageData) {
    const text = pageData.content.fullText;

    // Extract phone numbers
    const phoneRegex = /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phones = text.match(phoneRegex) || [];
    phones.forEach(phone => this.allData.contactInfo.phones.add(phone.trim()));

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    emails.forEach(email => this.allData.contactInfo.emails.add(email.toLowerCase()));

    // Extract addresses (looking for patterns)
    const addressRegex = /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Place|Pl)[,.\s]+[A-Za-z\s]+[,.\s]+[A-Z]{2}\s+\d{5}(?:-\d{4})?/gi;
    const addresses = text.match(addressRegex) || [];
    addresses.forEach(addr => this.allData.contactInfo.addresses.add(addr.trim()));
  }

  extractServices(pageData) {
    // Look for services in headings and lists
    const serviceKeywords = ['service', 'care', 'support', 'assistance', 'program', 'therapy'];

    pageData.content.lists.forEach(list => {
      list.items.forEach(item => {
        if (serviceKeywords.some(keyword => item.toLowerCase().includes(keyword))) {
          this.allData.services.push(item);
        }
      });
    });

    // Also check headings
    Object.values(pageData.content.headings).flat().forEach(heading => {
      if (serviceKeywords.some(keyword => heading.toLowerCase().includes(keyword))) {
        this.allData.services.push(heading);
      }
    });
  }

  extractTestimonials(pageData) {
    // Look for testimonial patterns
    const testimonialKeywords = ['testimonial', 'review', 'feedback', 'said', 'says', '"'];

    pageData.content.paragraphs.forEach(paragraph => {
      if (testimonialKeywords.some(keyword => paragraph.toLowerCase().includes(keyword)) &&
          paragraph.length > 50) {
        this.allData.testimonials.push(paragraph);
      }
    });
  }

  extractTeamInfo(pageData) {
    // Look for team member information
    const teamKeywords = ['team', 'staff', 'member', 'director', 'manager', 'coordinator', 'specialist'];

    pageData.content.paragraphs.forEach(paragraph => {
      if (teamKeywords.some(keyword => paragraph.toLowerCase().includes(keyword))) {
        this.allData.team.push(paragraph);
      }
    });
  }

  async downloadImages(images) {
    for (const img of images) {
      if (!img.src || img.src.startsWith('data:')) continue;

      try {
        const imgUrl = new URL(img.src, this.baseUrl);
        const filename = path.basename(imgUrl.pathname) || `image_${Date.now()}.jpg`;
        const filepath = path.join('scraped-data', 'images', filename);

        // Check if already downloaded
        if (this.allData.images.some(i => i.originalUrl === img.src)) continue;

        await this.downloadFile(imgUrl.href, filepath);

        this.allData.images.push({
          originalUrl: img.src,
          localPath: filepath,
          alt: img.alt,
          title: img.title,
          dimensions: { width: img.width, height: img.height }
        });

        console.log(`Downloaded image: ${filename}`);
      } catch (error) {
        console.error(`Error downloading image ${img.src}:`, error.message);
      }
    }
  }

  downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = require('fs').createWriteStream(filepath);

      protocol.get(url, response => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', err => {
        require('fs').unlink(filepath, () => {});
        reject(err);
      });
    });
  }

  async saveAllData() {
    // Convert Sets to Arrays for JSON serialization
    const dataToSave = {
      ...this.allData,
      contactInfo: {
        phones: Array.from(this.allData.contactInfo.phones),
        emails: Array.from(this.allData.contactInfo.emails),
        addresses: Array.from(this.allData.contactInfo.addresses)
      },
      services: [...new Set(this.allData.services)],
      testimonials: [...new Set(this.allData.testimonials)],
      team: [...new Set(this.allData.team)],
      scrapedAt: new Date().toISOString(),
      totalPages: this.visitedUrls.size,
      totalImages: this.allData.images.length
    };

    await fs.writeFile(
      'scraped-data/all-data.json',
      JSON.stringify(dataToSave, null, 2)
    );

    // Create a summary report
    const summary = `
# Living Care Home Services - Scraped Data Summary
Generated: ${new Date().toISOString()}

## Statistics
- Total Pages Scraped: ${this.visitedUrls.size}
- Total Images Downloaded: ${this.allData.images.length}
- Services Found: ${dataToSave.services.length}
- Testimonials Found: ${dataToSave.testimonials.length}

## Contact Information
### Phone Numbers
${dataToSave.contactInfo.phones.map(p => `- ${p}`).join('\n')}

### Email Addresses
${dataToSave.contactInfo.emails.map(e => `- ${e}`).join('\n')}

### Physical Addresses
${dataToSave.contactInfo.addresses.map(a => `- ${a}`).join('\n')}

## Services Offered
${dataToSave.services.map(s => `- ${s}`).join('\n')}

## Pages Scraped
${Array.from(this.visitedUrls).map(url => `- ${url}`).join('\n')}
`;

    await fs.writeFile('scraped-data/summary.md', summary);

    console.log('\n=== Scraping Complete ===');
    console.log(`Total pages scraped: ${this.visitedUrls.size}`);
    console.log(`Total images downloaded: ${this.allData.images.length}`);
    console.log(`Phone numbers found: ${dataToSave.contactInfo.phones.length}`);
    console.log(`Email addresses found: ${dataToSave.contactInfo.emails.length}`);
    console.log(`Physical addresses found: ${dataToSave.contactInfo.addresses.length}`);
    console.log('\nAll data saved to scraped-data/ directory');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Run the scraper
async function main() {
  const scraper = new LivingCareScraper();

  try {
    await scraper.init();
    await scraper.scrapeAllPages();
    await scraper.saveAllData();
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await scraper.close();
  }
}

// Execute
main().catch(console.error);