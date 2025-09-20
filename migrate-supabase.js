#!/usr/bin/env node

const https = require('https');

// Configuration
const SOURCE_PROJECT = 'alkzliirqdofpygknsij';
const DEST_PROJECT = 'fiozmyoedptukpkzuhqm';
const SOURCE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3psaWlycWRvZnB5Z2tuc2lqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDkyNCwiZXhwIjoyMDUwMTEwOTI0fQ.RuWvL6wlCRWYBnMhtpJGDBVUdpkNd6jHQPCYShMWsyA';
const DEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpb3pteW9lZHB0dWtwa3p1aHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDYxNCwiZXhwIjoyMDUwMTEwNjE0fQ.M1XoT7dj0dLwG1y-frxJJKnH_ldGfzJGCKDn1HLt5y4';

async function executeSQL(projectId, apiKey, query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });

    const options = {
      hostname: `${projectId}.supabase.co`,
      port: 443,
      path: '/rest/v1/rpc/exec_raw_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve(responseData);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function migrateBusinesses() {
  console.log('Starting businesses migration...');

  try {
    // Get count from source
    const countResult = await executeSQL(SOURCE_PROJECT, SOURCE_KEY,
      'SELECT COUNT(*) as count FROM public.businesses'
    );
    console.log('Total businesses to migrate:', countResult);

    // Migrate in batches of 50
    const batchSize = 50;
    let offset = 0;
    let totalMigrated = 0;

    while (offset < 1539) { // We know there are 1539 businesses
      console.log(`Fetching batch starting at offset ${offset}...`);

      // Fetch batch from source
      const selectQuery = `
        SELECT id, name, whatsapp_number, business_type, subscription_tier,
               voice_persona_id, active, created_at, updated_at, business_code,
               claimed_by, claimed_at, owner_phone, owner_email,
               ai_settings, business_hours, menu_items, auto_responses,
               languages, is_tico_owned, owner_nationality,
               monthly_fee, setup_fee, commission_rate
        FROM public.businesses
        ORDER BY created_at
        LIMIT ${batchSize} OFFSET ${offset}
      `;

      const businesses = await executeSQL(SOURCE_PROJECT, SOURCE_KEY, selectQuery);

      if (!businesses || businesses.length === 0) {
        console.log('No more businesses to migrate');
        break;
      }

      console.log(`Fetched ${businesses.length} businesses, inserting into destination...`);

      // Insert each business into destination
      for (const business of businesses) {
        const insertQuery = `
          INSERT INTO whatsapp_archive.businesses (
            id, name, whatsapp_number, business_type, subscription_tier,
            voice_persona_id, active, created_at, updated_at, business_code,
            claimed_by, claimed_at, owner_phone, owner_email,
            ai_settings, business_hours, menu_items, auto_responses,
            languages, is_tico_owned, owner_nationality,
            monthly_fee, setup_fee, commission_rate
          ) VALUES (
            '${business.id}'::uuid,
            ${business.name ? `'${business.name.replace(/'/g, "''")}'` : 'NULL'},
            ${business.whatsapp_number ? `'${business.whatsapp_number}'` : 'NULL'},
            ${business.business_type ? `'${business.business_type}'` : 'NULL'},
            ${business.subscription_tier ? `'${business.subscription_tier}'` : 'NULL'},
            ${business.voice_persona_id ? `'${business.voice_persona_id}'` : 'NULL'},
            ${business.active !== null ? business.active : true},
            '${business.created_at}'::timestamptz,
            '${business.updated_at}'::timestamptz,
            ${business.business_code ? `'${business.business_code}'` : 'NULL'},
            ${business.claimed_by ? `'${business.claimed_by}'` : 'NULL'},
            ${business.claimed_at ? `'${business.claimed_at}'::timestamptz` : 'NULL'},
            ${business.owner_phone ? `'${business.owner_phone}'` : 'NULL'},
            ${business.owner_email ? `'${business.owner_email}'` : 'NULL'},
            ${business.ai_settings ? `'${JSON.stringify(business.ai_settings).replace(/'/g, "''")}'::jsonb` : "'{}'::jsonb"},
            ${business.business_hours ? `'${JSON.stringify(business.business_hours).replace(/'/g, "''")}'::jsonb` : "'{}'::jsonb"},
            ${business.menu_items ? `'${JSON.stringify(business.menu_items).replace(/'/g, "''")}'::jsonb` : "'[]'::jsonb"},
            ${business.auto_responses ? `'${JSON.stringify(business.auto_responses).replace(/'/g, "''")}'::jsonb` : "'{}'::jsonb"},
            ${business.languages ? `ARRAY[${business.languages.map(l => `'${l}'`).join(',')}]` : 'NULL'},
            ${business.is_tico_owned !== null ? business.is_tico_owned : false},
            ${business.owner_nationality ? `'${business.owner_nationality}'` : 'NULL'},
            ${business.monthly_fee !== null ? business.monthly_fee : 'NULL'},
            ${business.setup_fee !== null ? business.setup_fee : 'NULL'},
            ${business.commission_rate !== null ? business.commission_rate : 'NULL'}
          ) ON CONFLICT (id) DO NOTHING
        `;

        try {
          await executeSQL(DEST_PROJECT, DEST_KEY, insertQuery);
          totalMigrated++;
        } catch (error) {
          console.error(`Error inserting business ${business.id}:`, error.message);
        }
      }

      console.log(`Migrated ${totalMigrated} businesses so far...`);
      offset += batchSize;
    }

    console.log(`✓ Successfully migrated ${totalMigrated} businesses`);

  } catch (error) {
    console.error('Error during migration:', error);
  }
}

async function migrateWhatsAppConversations() {
  console.log('\nMigrating WhatsApp conversations...');

  try {
    const conversations = await executeSQL(SOURCE_PROJECT, SOURCE_KEY,
      'SELECT * FROM public.whatsapp_conversations'
    );

    console.log(`Found ${conversations.length} conversations to migrate`);

    for (const conv of conversations) {
      const insertQuery = `
        INSERT INTO whatsapp_archive.whatsapp_conversations (
          id, business_id, customer_phone, thread_id,
          last_message_at, context, status, created_at, updated_at
        ) VALUES (
          '${conv.id}'::uuid,
          ${conv.business_id ? `'${conv.business_id}'::uuid` : 'NULL'},
          '${conv.customer_phone}',
          ${conv.thread_id ? `'${conv.thread_id}'` : 'NULL'},
          ${conv.last_message_at ? `'${conv.last_message_at}'::timestamptz` : 'NULL'},
          ${conv.context ? `'${JSON.stringify(conv.context).replace(/'/g, "''")}'::jsonb` : "'{}'::jsonb"},
          ${conv.status ? `'${conv.status}'` : "'active'"},
          '${conv.created_at}'::timestamptz,
          '${conv.updated_at}'::timestamptz
        ) ON CONFLICT (id) DO NOTHING
      `;

      await executeSQL(DEST_PROJECT, DEST_KEY, insertQuery);
    }

    console.log(`✓ Successfully migrated ${conversations.length} conversations`);

  } catch (error) {
    console.error('Error migrating conversations:', error);
  }
}

async function verifyMigration() {
  console.log('\n=== Verifying Migration ===');

  const tables = [
    'businesses',
    'whatsapp_conversations',
    'conversation_logs',
    'voice_messages',
    'business_catalog',
    'business_credentials',
    'ambassadors',
    'commissions'
  ];

  for (const table of tables) {
    try {
      const result = await executeSQL(DEST_PROJECT, DEST_KEY,
        `SELECT COUNT(*) as count FROM whatsapp_archive.${table}`
      );
      console.log(`whatsapp_archive.${table}: ${result[0]?.count || 0} records`);
    } catch (error) {
      console.log(`whatsapp_archive.${table}: Error checking - ${error.message}`);
    }
  }
}

async function main() {
  console.log('=== WhatsApp Data Migration Tool ===');
  console.log('From: ALKZ (Ticos Digitales)');
  console.log('To: FIOZ (Agency) - whatsapp_archive schema');
  console.log('=====================================\n');

  await migrateBusinesses();
  await migrateWhatsAppConversations();
  await verifyMigration();

  console.log('\n=== Migration Complete ===');
}

main().catch(console.error);