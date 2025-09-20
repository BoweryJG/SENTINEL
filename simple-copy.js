const { createClient } = require('@supabase/supabase-js');

// Create clients
const sourceClient = createClient(
  'https://alkzliirqdofpygknsij.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3psaWlycWRvZnB5Z2tuc2lqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDkyNCwiZXhwIjoyMDUwMTEwOTI0fQ.RuWvL6wlCRWYBnMhtpJGDBVUdpkNd6jHQPCYShMWsyA'
);

const destClient = createClient(
  'https://fiozmyoedptukpkzuhqm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpb3pteW9lZHB0dWtwa3p1aHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDYxNCwiZXhwIjoyMDUwMTEwNjE0fQ.M1XoT7dj0dLwG1y-frxJJKnH_ldGfzJGCKDn1HLt5y4'
);

async function copyData() {
  console.log('Copying businesses...');

  // Get all businesses from source
  const { data: businesses, error: fetchError } = await sourceClient
    .from('businesses')
    .select('*');

  if (fetchError) {
    console.error('Error fetching:', fetchError);
    return;
  }

  console.log(`Found ${businesses.length} businesses`);

  // Insert into destination using raw SQL to target whatsapp_archive schema
  for (let i = 0; i < businesses.length; i += 100) {
    const batch = businesses.slice(i, i + 100);
    console.log(`Inserting batch ${i/100 + 1}...`);

    const { error: insertError } = await destClient
      .from('businesses')
      .upsert(batch, { onConflict: 'id', schema: 'whatsapp_archive' });

    if (insertError) {
      // Try raw SQL approach
      for (const biz of batch) {
        await destClient.rpc('exec_sql', {
          query: `INSERT INTO whatsapp_archive.businesses SELECT * FROM jsonb_populate_record(null::whatsapp_archive.businesses, '${JSON.stringify(biz)}'::jsonb) ON CONFLICT (id) DO NOTHING`
        }).catch(err => console.log('Skipping record:', biz.id));
      }
    }
  }

  console.log('Copying whatsapp_conversations...');

  // Get conversations
  const { data: convos } = await sourceClient
    .from('whatsapp_conversations')
    .select('*');

  if (convos && convos.length > 0) {
    console.log(`Found ${convos.length} conversations`);

    for (const convo of convos) {
      await destClient.rpc('exec_sql', {
        query: `INSERT INTO whatsapp_archive.whatsapp_conversations SELECT * FROM jsonb_populate_record(null::whatsapp_archive.whatsapp_conversations, '${JSON.stringify(convo)}'::jsonb) ON CONFLICT (id) DO NOTHING`
      }).catch(err => console.log('Skipping convo:', convo.id));
    }
  }

  console.log('Done!');
}

copyData().catch(console.error);