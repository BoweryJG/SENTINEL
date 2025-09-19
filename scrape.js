const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const allContent = {};
  
  const pagesToScrape = [
    { name: 'Home', url: 'https://www.livingcarehomeservices.com/' },
    { name: 'About Us', url: 'https://www.livingcarehomeservices.com/meet-the-team/' },
    { name: 'Services Overview', url: 'https://www.livingcarehomeservices.com/services/our-caregivers-and-service/' },
    { name: 'Live-in Care', url: 'https://www.livingcarehomeservices.com/services/live-in-caregiver/' },
    { name: 'Hourly Care', url: 'https://www.livingcarehomeservices.com/services/home-care-services/' },
    { name: 'Private Duty Nursing', url: 'https://www.livingcarehomeservices.com/services/private-duty-nursing/' },
    { name: 'Surgery Transition Care', url: 'https://www.livingcarehomeservices.com/services/surgery-iillness-transition-care/' },
    { name: 'Personal Care', url: 'https://www.livingcarehomeservices.com/services/personal-care/' },
    { name: 'Occupational Therapy', url: 'https://www.livingcarehomeservices.com/services/occupational-and-physical-therapy/' },
    { name: 'Testimonials', url: 'https://www.livingcarehomeservices.com/testimonials/' },
    { name: 'FAQs', url: 'https://www.livingcarehomeservices.com/faqs/' },
    { name: 'Contact', url: 'https://www.livingcarehomeservices.com/contact/' }
  ];
  
  for (const pageInfo of pagesToScrape) {
    try {
      console.log(`\n==================== SCRAPING: ${pageInfo.name} ====================`);
      await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Get all the text content
      const content = await page.evaluate(() => {
        // Remove script and style elements
        const scripts = document.querySelectorAll('script, style, nav, footer, header');
        scripts.forEach(el => el.remove());
        
        return document.body.innerText;
      });
      
      // Get page title
      const title = await page.title();
      
      // Get headings
      const headings = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        return headings.map(h => ({
          tag: h.tagName,
          text: h.textContent.trim()
        }));
      });
      
      // Get specific service details if available
      const serviceDetails = await page.evaluate(() => {
        const lists = Array.from(document.querySelectorAll('ul, ol'));
        const listItems = lists.map(list => {
          return Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim());
        });
        return listItems.flat();
      });
      
      allContent[pageInfo.name] = {
        url: pageInfo.url,
        title: title,
        content: content,
        headings: headings,
        serviceDetails: serviceDetails
      };
      
      console.log(`✓ Successfully scraped ${pageInfo.name}`);
      
      // Add a small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error scraping ${pageInfo.name}:`, error.message);
      allContent[pageInfo.name] = { error: error.message };
    }
  }
  
  // Save all content to a JSON file
  fs.writeFileSync('scraped_content.json', JSON.stringify(allContent, null, 2));
  console.log('\n✓ All content saved to scraped_content.json');
  
  // Print summary
  console.log('\n==================== SCRAPING SUMMARY ====================');
  Object.keys(allContent).forEach(pageName => {
    if (allContent[pageName].error) {
      console.log(`❌ ${pageName}: ERROR - ${allContent[pageName].error}`);
    } else {
      console.log(`✅ ${pageName}: ${allContent[pageName].content.length} characters`);
    }
  });
  
  await browser.close();
})();