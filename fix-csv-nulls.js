const fs = require('fs');
const path = require('path');

// Read CSV from Windows path
const csvPath = '/mnt/c/Users/jason/Downloads/Supabase Snippet List All Businesses.csv';
const csv = fs.readFileSync(csvPath, 'utf-8');

// Fix null timestamps - replace "null" with empty string
let fixed = csv.replace(/"null"/g, '""');

// Write fixed CSV
const outputPath = '/mnt/c/Users/jason/Downloads/businesses_fixed.csv';
fs.writeFileSync(outputPath, fixed);

console.log('Fixed CSV saved to:', outputPath);
console.log('Upload this file to Supabase instead!');