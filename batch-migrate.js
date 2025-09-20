#!/usr/bin/env node

const fetch = require('node-fetch');

// Source and destination configurations
const SOURCE = {
  url: 'https://alkzliirqdofpygknsij.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsa3psaWlycWRvZnB5Z2tuc2lqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDkyNCwiZXhwIjoyMDUwMTEwOTI0fQ.RuWvL6wlCRWYBnMhtpJGDBVUdpkNd6jHQPCYShMWsyA'
};

const DEST = {
  url: 'https://fiozmyoedptukpkzuhqm.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpb3pteW9lZHB0dWtwa3p1aHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDUzNDYxNCwiZXhwIjoyMDUwMTEwNjE0fQ.M1XoT7dj0dLwG1y-frxJJKnH_ldGfzJGCKDn1HLt5y4'
};

async function fetchFromSupabase(baseUrl, apiKey, table, limit = 100, offset = 0) {
  const url = `${baseUrl}/rest/v1/${table}?limit=${limit}&offset=${offset}&order=created_at.asc`;

  const response = await fetch(url, {
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

async function insertToSupabase(baseUrl, apiKey, table, data) {
  const url = `${baseUrl}/rest/v1/${table}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates'
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Insert error:', error);
    return false;
  }

  return true;
}

async function migrateBusinesses() {
  console.log('Starting businesses migration...');
  const batchSize = 50;
  let offset = 0;
  let totalMigrated = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      console.log(`\nFetching batch at offset ${offset}...`);
      const businesses = await fetchFromSupabase(SOURCE.url, SOURCE.key, 'businesses', batchSize, offset);

      if (businesses.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Fetched ${businesses.length} businesses`);

      // Transform data for whatsapp_archive schema
      const transformedData = businesses.map(b => ({
        id: b.id,
        name: b.name,
        whatsapp_number: b.whatsapp_number,
        business_type: b.business_type,
        subscription_tier: b.subscription_tier,
        voice_persona_id: b.voice_persona_id,
        active: b.active,
        created_at: b.created_at,
        updated_at: b.updated_at,
        business_code: b.business_code,
        claimed_by: b.claimed_by,
        claimed_at: b.claimed_at,
        owner_phone: b.owner_phone,
        owner_email: b.owner_email,
        ai_settings: b.ai_settings || {},
        business_hours: b.business_hours || {},
        menu_items: b.menu_items || [],
        auto_responses: b.auto_responses || {},
        languages: b.languages,
        is_tico_owned: b.is_tico_owned,
        owner_nationality: b.owner_nationality,
        monthly_fee: b.monthly_fee,
        setup_fee: b.setup_fee,
        commission_rate: b.commission_rate
      }));

      // Insert to destination
      const success = await insertToSupabase(DEST.url, DEST.key, 'whatsapp_archive.businesses', transformedData);

      if (success) {
        totalMigrated += businesses.length;
        console.log(`✓ Migrated ${businesses.length} businesses (Total: ${totalMigrated})`);
      } else {
        console.log(`⚠ Some businesses may not have been migrated in this batch`);
      }

      offset += batchSize;

      // Stop if we got less than batch size (means we're at the end)
      if (businesses.length < batchSize) {
        hasMore = false;
      }

    } catch (error) {
      console.error(`Error at offset ${offset}:`, error.message);
      // Continue with next batch
      offset += batchSize;
    }
  }

  console.log(`\n✓ Migration complete! Total migrated: ${totalMigrated}`);
  return totalMigrated;
}

async function migrateWhatsAppConversations() {
  console.log('\nMigrating WhatsApp conversations...');

  try {
    const conversations = await fetchFromSupabase(SOURCE.url, SOURCE.key, 'whatsapp_conversations', 100, 0);
    console.log(`Found ${conversations.length} conversations`);

    if (conversations.length > 0) {
      const success = await insertToSupabase(DEST.url, DEST.key, 'whatsapp_archive.whatsapp_conversations', conversations);
      if (success) {
        console.log(`✓ Migrated ${conversations.length} conversations`);
      }
    }
  } catch (error) {
    console.error('Error migrating conversations:', error.message);
  }
}

async function verifyMigration() {
  console.log('\n=== Verifying Migration ===');

  try {
    // Check businesses count
    const businessResponse = await fetch(
      `${DEST.url}/rest/v1/whatsapp_archive.businesses?select=id&limit=1`,
      {
        headers: {
          'apikey': DEST.key,
          'Authorization': `Bearer ${DEST.key}`,
          'Prefer': 'count=exact'
        }
      }
    );

    const totalCount = businessResponse.headers.get('content-range');
    if (totalCount) {
      const match = totalCount.match(/\/(\d+)/);
      if (match) {
        console.log(`whatsapp_archive.businesses: ${match[1]} records`);
      }
    }

    // Check conversations count
    const convResponse = await fetch(
      `${DEST.url}/rest/v1/whatsapp_archive.whatsapp_conversations?select=id&limit=1`,
      {
        headers: {
          'apikey': DEST.key,
          'Authorization': `Bearer ${DEST.key}`,
          'Prefer': 'count=exact'
        }
      }
    );

    const convCount = convResponse.headers.get('content-range');
    if (convCount) {
      const match = convCount.match(/\/(\d+)/);
      if (match) {
        console.log(`whatsapp_archive.whatsapp_conversations: ${match[1]} records`);
      }
    }

  } catch (error) {
    console.error('Error verifying:', error.message);
  }
}

async function main() {
  console.log('=== WhatsApp Data Migration (Batch Mode) ===');
  console.log('From: ALKZ (alkzliirqdofpygknsij)');
  console.log('To: FIOZ (fiozmyoedptukpkzuhqm) - whatsapp_archive schema');
  console.log('============================================\n');

  try {
    await migrateBusinesses();
    await migrateWhatsAppConversations();
    await verifyMigration();

    console.log('\n=== Migration Complete! ===');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Check if node-fetch is installed
try {
  require.resolve('node-fetch');
  main();
} catch(e) {
  console.log('Installing node-fetch...');
  const { execSync } = require('child_process');
  execSync('npm install node-fetch@2', { stdio: 'inherit' });
  console.log('node-fetch installed. Please run the script again.');
}