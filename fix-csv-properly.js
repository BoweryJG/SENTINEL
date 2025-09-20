const fs = require('fs');

const csvPath = '/mnt/c/Users/jason/Downloads/Supabase Snippet List All Businesses.csv';
const csv = fs.readFileSync(csvPath, 'utf-8');

// Split into lines
const lines = csv.split('\n');
const header = lines[0];
const rows = lines.slice(1);

// Find timestamp column indices
const columns = header.split(',');
const timestampCols = [];
columns.forEach((col, idx) => {
  if (col.includes('_at') || col.includes('created') || col.includes('updated') || col.includes('claimed')) {
    timestampCols.push(idx);
  }
});

console.log('Timestamp columns found at indices:', timestampCols);

// Process each row
const fixedRows = rows.map(row => {
  if (!row.trim()) return row;

  // Parse CSV row (handle quoted values)
  let inQuotes = false;
  let currentField = '';
  const fields = [];

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentField += char;
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField); // last field

  // Fix null timestamps
  timestampCols.forEach(idx => {
    if (fields[idx] === 'null' || fields[idx] === '"null"') {
      fields[idx] = ''; // Make it empty for NULL
    }
  });

  return fields.join(',');
});

const fixed = header + '\n' + fixedRows.join('\n');
const outputPath = '/mnt/c/Users/jason/Downloads/businesses_really_fixed.csv';
fs.writeFileSync(outputPath, fixed);

console.log('REALLY fixed CSV saved to:', outputPath);
console.log('Upload businesses_really_fixed.csv to Supabase!');