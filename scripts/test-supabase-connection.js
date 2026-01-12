// Test script to verify Supabase admin client connection
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testConnection() {
    console.log('Testing Supabase Admin Connection...\n');

    // Check environment variables
    console.log('Environment Variables:');
    console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing');
    console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✓ Set' : '✗ Missing');
    console.log('');

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.error('Missing required environment variables!');
        process.exit(1);
    }

    // Create admin client
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    console.log('Admin client created successfully\n');

    // Test 1: Try to query workspaces table
    console.log('Test 1: Query workspaces table...');
    try {
        const { data, error } = await supabaseAdmin
            .from('workspaces')
            .select('*')
            .limit(1);

        if (error) {
            console.error('✗ Error querying workspaces:', error.message);
            console.error('Error details:', JSON.stringify(error, null, 2));
        } else {
            console.log('✓ Successfully queried workspaces table');
            console.log('  Found', data?.length || 0, 'workspace(s)');
        }
    } catch (err) {
        console.error('✗ Exception:', err.message);
    }

    console.log('');

    // Test 2: Try to insert a test workspace
    console.log('Test 2: Insert test workspace...');
    try {
        const { data, error } = await supabaseAdmin
            .from('workspaces')
            .insert({
                user_id: '00000000-0000-0000-0000-000000000000', // Test UUID
                name: 'Test Workspace'
            })
            .select()
            .single();

        if (error) {
            console.error('✗ Error inserting workspace:', error.message);
            console.error('Error details:', JSON.stringify(error, null, 2));
        } else {
            console.log('✓ Successfully inserted test workspace');
            console.log('  Workspace ID:', data?.id);

            // Clean up: delete the test workspace
            await supabaseAdmin
                .from('workspaces')
                .delete()
                .eq('id', data.id);
            console.log('  Test workspace cleaned up');
        }
    } catch (err) {
        console.error('✗ Exception:', err.message);
    }

    console.log('\nTest completed.');
}

testConnection().catch(console.error);
