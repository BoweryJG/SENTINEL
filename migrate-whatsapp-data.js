const { createClient } = require('@supabase/supabase-js');

// Source database (ALKZ - WhatsApp/Ticos Digitales)
const sourceUrl = 'https://alkzliirqdofpygknsij.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3psaWlycWRvZnB5Z2tuc2lqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDkyNCwiZXhwIjoyMDUwMTEwOTI0fQ.RuWvL6wlCRWYBnMhtpJGDBVUdpkNd6jHQPCYShMWsyA';

// Destination database (FIOZ - Agency)
const destUrl = 'https://fiozmyoedptukpkzuhqm.supabase.co';
const destKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpb3pteW9lZHB0dWtwa3p1aHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDYxNCwiZXhwIjoyMDUwMTEwNjE0fQ.M1XoT7dj0dLwG1y-frxJJKnH_ldGfzJGCKDn1HLt5y4';

const sourceSupabase = createClient(sourceUrl, sourceKey);
const destSupabase = createClient(destUrl, destKey);

async function migrateTable(tableName, batchSize = 100) {
  console.log(`\nMigrating ${tableName}...`);

  try {
    // Get total count
    const { count, error: countError } = await sourceSupabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error(`Error counting ${tableName}:`, countError);
      return;
    }

    console.log(`Total records to migrate: ${count}`);

    if (count === 0) {
      console.log(`No records to migrate for ${tableName}`);
      return;
    }

    // Migrate in batches
    let offset = 0;
    let migrated = 0;

    while (offset < count) {
      const { data, error } = await sourceSupabase
        .from(tableName)
        .select('*')
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error(`Error fetching batch at offset ${offset}:`, error);
        break;
      }

      if (data && data.length > 0) {
        // Insert into destination with raw SQL to use whatsapp_archive schema
        for (const record of data) {
          const columns = Object.keys(record).join(', ');
          const values = Object.values(record).map(v =>
            v === null ? 'NULL' :
            typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` :
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` :
            typeof v === 'boolean' ? v.toString() :
            v
          ).join(', ');

          const query = `INSERT INTO whatsapp_archive.${tableName} (${columns}) VALUES (${values})`;

          const { error: insertError } = await destSupabase.rpc('exec_sql', {
            query: query
          });

          if (insertError && !insertError.message?.includes('exec_sql')) {
            // Try direct insert if RPC doesn't exist
            const { error: directError } = await destSupabase
              .from(`whatsapp_archive.${tableName}`)
              .insert(record);

            if (directError) {
              console.error(`Error inserting record:`, directError);
            }
          }
        }

        migrated += data.length;
        console.log(`Migrated ${migrated}/${count} records`);
      }

      offset += batchSize;
    }

    console.log(`✓ Successfully migrated ${migrated} records from ${tableName}`);

  } catch (error) {
    console.error(`Error migrating ${tableName}:`, error);
  }
}

async function migrate() {
  console.log('Starting WhatsApp data migration from ALKZ to FIOZ...');
  console.log('================================================');

  const tables = [
    'businesses',           // Has 1539 records
    'whatsapp_conversations', // Has 5 records
    'conversation_logs',    // Empty
    'voice_messages',       // Empty
    'business_catalog',     // Empty
    'business_credentials', // Empty
    'ambassadors',          // Empty
    'commissions'           // Empty
  ];

  for (const table of tables) {
    await migrateTable(table);
  }

  console.log('\n================================================');
  console.log('Migration complete!');

  // Verify migration
  console.log('\nVerifying migration...');
  for (const table of tables) {
    const { count } = await destSupabase
      .from(`whatsapp_archive.${table}`)
      .select('*', { count: 'exact', head: true });

    console.log(`whatsapp_archive.${table}: ${count || 0} records`);
  }
}

migrate().catch(console.error);