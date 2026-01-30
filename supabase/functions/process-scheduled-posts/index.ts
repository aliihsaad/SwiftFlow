// @ts-nocheck - Deno runtime, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PublishResult {
    success: boolean;
    platform: string;
    platformPostId?: string;
    error?: string;
}

/**
 * Publish to Facebook Page
 */
async function publishToFacebook(
    pageId: string,
    accessToken: string,
    message: string,
    imageUrl?: string
): Promise<PublishResult> {
    try {
        let endpoint = `${META_GRAPH_URL}/${pageId}/feed`;
        let body: Record<string, string> = { message, access_token: accessToken };

        // If image, use photos endpoint
        if (imageUrl) {
            endpoint = `${META_GRAPH_URL}/${pageId}/photos`;
            body = { url: imageUrl, caption: message, access_token: accessToken };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, platform: 'facebook', error: data.error?.message };
        }

        return { success: true, platform: 'facebook', platformPostId: data.id || data.post_id };
    } catch (error) {
        return { success: false, platform: 'facebook', error: String(error) };
    }
}

/**
 * Publish a single image to Instagram Business Account
 */
async function publishToInstagram(
    igAccountId: string,
    accessToken: string,
    caption: string,
    imageUrl: string
): Promise<PublishResult> {
    try {
        // Step 1: Create container
        const containerRes = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                caption,
                access_token: accessToken
            })
        });

        const containerData = await containerRes.json();
        if (!containerRes.ok) {
            return { success: false, platform: 'instagram', error: containerData.error?.message };
        }

        // Wait for processing
        await new Promise(r => setTimeout(r, 2000));

        // Step 2: Publish
        const publishRes = await fetch(`${META_GRAPH_URL}/${igAccountId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerData.id,
                access_token: accessToken
            })
        });

        const publishData = await publishRes.json();
        if (!publishRes.ok) {
            return { success: false, platform: 'instagram', error: publishData.error?.message };
        }

        return { success: true, platform: 'instagram', platformPostId: publishData.id };
    } catch (error) {
        return { success: false, platform: 'instagram', error: String(error) };
    }
}

/**
 * Publish a carousel (multiple images) to Instagram Business Account
 * 1. Create individual child containers for each image
 * 2. Create a carousel container referencing all children
 * 3. Publish the carousel container
 */
async function publishToInstagramCarousel(
    igAccountId: string,
    accessToken: string,
    caption: string,
    imageUrls: string[]
): Promise<PublishResult> {
    try {
        console.log(`Publishing Instagram carousel with ${imageUrls.length} images`);

        // Step 1: Create child containers
        const childIds: string[] = [];
        for (const imageUrl of imageUrls) {
            const res = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_url: imageUrl,
                    is_carousel_item: true,
                    access_token: accessToken
                })
            });

            const data = await res.json();
            if (!res.ok) {
                return { success: false, platform: 'instagram', error: data.error?.message || 'Failed to create carousel item' };
            }
            childIds.push(data.id);
        }

        // Wait for processing
        await new Promise(r => setTimeout(r, 3000));

        // Step 2: Create carousel container
        const carouselRes = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_type: 'CAROUSEL',
                children: childIds,
                caption,
                access_token: accessToken
            })
        });

        const carouselData = await carouselRes.json();
        if (!carouselRes.ok) {
            return { success: false, platform: 'instagram', error: carouselData.error?.message || 'Failed to create carousel' };
        }

        // Wait for carousel to be ready
        await new Promise(r => setTimeout(r, 2000));

        // Step 3: Publish the carousel
        const publishRes = await fetch(`${META_GRAPH_URL}/${igAccountId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: carouselData.id,
                access_token: accessToken
            })
        });

        const publishData = await publishRes.json();
        if (!publishRes.ok) {
            return { success: false, platform: 'instagram', error: publishData.error?.message || 'Failed to publish carousel' };
        }

        return { success: true, platform: 'instagram', platformPostId: publishData.id };
    } catch (error) {
        return { success: false, platform: 'instagram', error: String(error) };
    }
}

/**
 * Publish multiple photos to Facebook as a multi-photo post
 * 1. Upload each photo as unpublished
 * 2. Create a feed post with all photos attached (form-urlencoded)
 */
async function publishToFacebookMultiPhoto(
    pageId: string,
    accessToken: string,
    message: string,
    imageUrls: string[]
): Promise<PublishResult> {
    try {
        console.log(`Publishing Facebook multi-photo with ${imageUrls.length} images`);

        // Step 1: Upload each photo as unpublished
        const photoIds: string[] = [];
        for (const imageUrl of imageUrls) {
            const res = await fetch(`${META_GRAPH_URL}/${pageId}/photos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: imageUrl,
                    published: false,
                    access_token: accessToken
                })
            });

            const data = await res.json();
            if (!res.ok) {
                return { success: false, platform: 'facebook', error: data.error?.message || 'Failed to upload photo' };
            }
            console.log(`Facebook unpublished photo uploaded: ${data.id}`);
            photoIds.push(data.id);
        }

        // Step 2: Create feed post with attached media using form-urlencoded
        // Facebook requires attached_media to be sent as form params, not JSON
        const params = new URLSearchParams();
        params.append('message', message);
        params.append('access_token', accessToken);
        photoIds.forEach((id, index) => {
            params.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
        });

        const feedRes = await fetch(`${META_GRAPH_URL}/${pageId}/feed`, {
            method: 'POST',
            body: params
        });

        const feedData = await feedRes.json();
        if (!feedRes.ok) {
            console.error('Facebook multi-photo feed error:', feedData);
            return { success: false, platform: 'facebook', error: feedData.error?.message || 'Failed to create multi-photo post' };
        }

        return { success: true, platform: 'facebook', platformPostId: feedData.id };
    } catch (error) {
        return { success: false, platform: 'facebook', error: String(error) };
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // Find posts that are due for publishing
        const now = new Date().toISOString();
        const { data: duePosts, error: fetchError } = await supabase
            .from('posts')
            .select('*')
            .eq('status', 'scheduled')
            .lte('scheduled_for', now)
            .limit(10);

        if (fetchError) {
            console.error('Error fetching due posts:', fetchError);
            return new Response(JSON.stringify({ error: fetchError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            });
        }

        console.log(`Found ${duePosts?.length || 0} posts to publish`);

        // Immediately lock all due posts by setting status to 'publishing'
        // This prevents duplicate processing if the function is invoked again
        if (duePosts && duePosts.length > 0) {
            const postIds = duePosts.map(p => p.id);
            await supabase
                .from('posts')
                .update({ status: 'publishing', updated_at: new Date().toISOString() })
                .in('id', postIds);
            console.log(`Locked ${postIds.length} posts with status 'publishing'`);
        }

        const results: { postId: string; results: PublishResult[] }[] = [];

        for (const post of duePosts || []) {
            const postResults: PublishResult[] = [];
            const platforms = post.platforms as string[];
            const mediaUrls = post.media_urls as string[];
            const content = post.content || '';

            // Get social accounts for this workspace
            const { data: accounts } = await supabase
                .from('social_accounts')
                .select('*')
                .eq('workspace_id', post.workspace_id);

            for (const platform of platforms) {
                const account = accounts?.find(a => a.platform === platform);

                if (!account) {
                    postResults.push({
                        success: false,
                        platform,
                        error: `No ${platform} account connected`
                    });
                    continue;
                }

                let result: PublishResult;

                if (platform === 'facebook') {
                    if (mediaUrls.length > 1) {
                        result = await publishToFacebookMultiPhoto(
                            account.account_id,
                            account.access_token,
                            content,
                            mediaUrls
                        );
                    } else {
                        result = await publishToFacebook(
                            account.account_id,
                            account.access_token,
                            content,
                            mediaUrls[0]
                        );
                    }
                } else if (platform === 'instagram') {
                    if (!mediaUrls[0]) {
                        result = { success: false, platform: 'instagram', error: 'Image required' };
                    } else if (mediaUrls.length > 1) {
                        result = await publishToInstagramCarousel(
                            account.account_id,
                            account.access_token,
                            content,
                            mediaUrls
                        );
                    } else {
                        result = await publishToInstagram(
                            account.account_id,
                            account.access_token,
                            content,
                            mediaUrls[0]
                        );
                    }
                } else {
                    result = { success: false, platform, error: 'Unsupported platform' };
                }

                postResults.push(result);

                // Store in published_posts if successful
                if (result.success && result.platformPostId) {
                    await supabase.from('published_posts').insert({
                        post_id: post.id,
                        platform,
                        platform_post_id: result.platformPostId
                    });
                }
            }

            // Update post status
            const allSucceeded = postResults.every(r => r.success);
            await supabase
                .from('posts')
                .update({
                    status: allSucceeded ? 'published' : 'failed',
                    published_at: allSucceeded ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', post.id);

            results.push({ postId: post.id, results: postResults });
        }

        return new Response(JSON.stringify({
            processed: duePosts?.length || 0,
            results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error('Process scheduled posts error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});
