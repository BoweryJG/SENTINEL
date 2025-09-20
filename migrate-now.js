const { createClient } = require('@supabase/supabase-js');

// Source - ALKZ (Ticos)
const source = createClient(
  'https://alkzliirqdofpygknsij.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3psaWlycWRvZnB5Z2tuc2lqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDkyNCwiZXhwIjoyMDUwMTEwOTI0fQ.RuWvL6wlCRWYBnMhtpJGDBVUdpkNd6jHQPCYShMWsyA'
);

// Destination - FIOZ (Agency)
const dest = createClient(
  'https://fiozmyoedptukpkzuhqm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpb3pteW9lZHB0dWtwa3p1aHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDYxNCwiZXhwIjoyMDUwMTEwNjE0fQ.M1XoT7dj0dLwG1y-frxJJKnH_ldGfzJGCKDn1HLt5y4'
);

async function migrate() {
  console.log('Getting ALL businesses from ALKZ...');

  // Get ALL businesses
  const { data: businesses, error } = await source
    .from('businesses')
    .select('*')
    .limit(10000);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Got ${businesses.length} businesses`);

  // Insert ALL to FIOZ in batches
  const batchSize = 100;
  for (let i = 0; i < businesses.length; i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);
    console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}...`);

    const { error: insertError } = await dest
      .from('businesses')
      .insert(batch)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
    }
  }

  // Get conversations
  console.log('\nGetting conversations...');
  const { data: convos } = await source
    .from('whatsapp_conversations')
    .select('*');

  if (convos && convos.length > 0) {
    console.log(`Inserting ${convos.length} conversations...`);
    await dest.from('whatsapp_conversations').insert(convos);
  }

  console.log('\nDONE!!!');
}

migrate();