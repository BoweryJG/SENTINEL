const { chromium } = require('playwright');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Go to the meet the team page
    await page.goto('https://www.livingcarehomeservices.com/meet-the-team/', { waitUntil: 'networkidle' });
    
    // Extract team member information and images
    const teamData = await page.evaluate(() => {
      const teamMembers = [];
      
      // Look for team member sections, images, and text
      const memberElements = document.querySelectorAll('img, .team-member, .staff-member, [class*="team"], [class*="staff"]');
      const allImages = Array.from(document.querySelectorAll('img'));
      
      // Get all images that might be team photos
      const teamImages = allImages.filter(img => {
        const src = img.src || '';
        const alt = img.alt || '';
        const className = img.className || '';
        
        // Filter for likely team/staff photos
        return (
          src.includes('team') || 
          src.includes('staff') || 
          src.includes('founder') ||
          src.includes('member') ||
          alt.toLowerCase().includes('team') ||
          alt.toLowerCase().includes('staff') ||
          alt.toLowerCase().includes('founder') ||
          alt.toLowerCase().includes('dan') ||
          alt.toLowerCase().includes('townsley') ||
          className.includes('team') ||
          className.includes('staff')
        ) && !src.includes('logo') && !src.includes('icon');
      });
      
      // Also get all images from the page to inspect manually
      const allImageData = allImages.map(img => ({
        src: img.src,
        alt: img.alt || '',
        className: img.className || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      }));
      
      return {
        teamImages: teamImages.map(img => ({
          src: img.src,
          alt: img.alt || '',
          className: img.className || ''
        })),
        allImages: allImageData
      };
    });
    
    console.log('=== TEAM IMAGES FOUND ===');
    console.log(JSON.stringify(teamData.teamImages, null, 2));
    
    console.log('\n=== ALL IMAGES FROM PAGE ===');
    teamData.allImages.forEach((img, index) => {
      console.log(`${index + 1}. ${img.src}`);
      console.log(`   Alt: ${img.alt}`);
      console.log(`   Class: ${img.className}`);
      console.log(`   Size: ${img.width}x${img.height}`);
      console.log('');
    });
    
    // Get team member text content
    const teamContent = await page.evaluate(() => {
      return document.body.innerText;
    });
    
    console.log('\n=== TEAM PAGE CONTENT ===');
    console.log(teamContent);
    
    // Try the homepage as well for founder info
    await page.goto('https://www.livingcarehomeservices.com/', { waitUntil: 'networkidle' });
    
    const homeImages = await page.evaluate(() => {
      const allImages = Array.from(document.querySelectorAll('img'));
      return allImages.map(img => ({
        src: img.src,
        alt: img.alt || '',
        className: img.className || ''
      }));
    });
    
    console.log('\n=== HOMEPAGE IMAGES ===');
    homeImages.forEach((img, index) => {
      console.log(`${index + 1}. ${img.src}`);
      console.log(`   Alt: ${img.alt}`);
      console.log(`   Class: ${img.className}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  await browser.close();
})();