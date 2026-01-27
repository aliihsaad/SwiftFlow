/**
 * Meta API Publishing Utilities
 * 
 * Functions to publish content to Facebook Pages and Instagram Business accounts
 * via the Meta Graph API.
 */

import { createClient } from '@supabase/supabase-js';

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

export interface PublishResult {
    success: boolean;
    platform: 'facebook' | 'instagram';
    platformPostId?: string;
    permalink?: string;
    error?: string;
}

export interface SocialAccount {
    id: string;
    platform: string;
    account_name: string;
    account_id: string;
    access_token: string;
    metadata?: {
        instagram_business_account_id?: string;
        connected_page_id?: string;
    };
}

/**
 * Get connected social accounts for a workspace
 */
export async function getConnectedAccounts(workspaceId: string): Promise<SocialAccount[]> {
    const { data, error } = await supabaseAdmin
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

    if (error) {
        console.error('[META_PUBLISH] Error fetching accounts:', error);
        return [];
    }

    return data || [];
}

/**
 * Publish a text-only post to a Facebook Page
 */
export async function publishToFacebookText(
    pageId: string,
    accessToken: string,
    message: string
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing text to Facebook Page:', pageId);

        const response = await fetch(`${META_GRAPH_URL}/${pageId}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                access_token: accessToken
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[META_PUBLISH] Facebook error:', data);
            return {
                success: false,
                platform: 'facebook',
                error: data.error?.message || 'Unknown Facebook error'
            };
        }

        console.log('[META_PUBLISH] Facebook post created:', data.id);
        return {
            success: true,
            platform: 'facebook',
            platformPostId: data.id,
            permalink: `https://facebook.com/${data.id}`
        };

    } catch (error) {
        console.error('[META_PUBLISH] Facebook publish error:', error);
        return {
            success: false,
            platform: 'facebook',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Publish a photo post to a Facebook Page
 */
export async function publishToFacebookPhoto(
    pageId: string,
    accessToken: string,
    message: string,
    imageUrl: string
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing photo to Facebook Page:', pageId);

        const response = await fetch(`${META_GRAPH_URL}/${pageId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: imageUrl,
                caption: message,
                access_token: accessToken
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[META_PUBLISH] Facebook photo error:', data);
            return {
                success: false,
                platform: 'facebook',
                error: data.error?.message || 'Unknown Facebook error'
            };
        }

        console.log('[META_PUBLISH] Facebook photo posted:', data.id);
        return {
            success: true,
            platform: 'facebook',
            platformPostId: data.id || data.post_id
        };

    } catch (error) {
        console.error('[META_PUBLISH] Facebook photo error:', error);
        return {
            success: false,
            platform: 'facebook',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Publish to Instagram Business Account
 * Instagram requires a 2-step process: Create media container, then publish
 */
export async function publishToInstagram(
    igAccountId: string,
    accessToken: string,
    caption: string,
    imageUrl: string
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing to Instagram:', igAccountId);

        // Step 1: Create media container
        const containerResponse = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                caption,
                access_token: accessToken
            })
        });

        const containerData = await containerResponse.json();

        if (!containerResponse.ok) {
            console.error('[META_PUBLISH] Instagram container error:', containerData);
            return {
                success: false,
                platform: 'instagram',
                error: containerData.error?.message || 'Failed to create media container'
            };
        }

        const containerId = containerData.id;
        console.log('[META_PUBLISH] Instagram container created:', containerId);

        // Wait a moment for Instagram to process the media
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Publish the container
        const publishResponse = await fetch(`${META_GRAPH_URL}/${igAccountId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerId,
                access_token: accessToken
            })
        });

        const publishData = await publishResponse.json();

        if (!publishResponse.ok) {
            console.error('[META_PUBLISH] Instagram publish error:', publishData);
            return {
                success: false,
                platform: 'instagram',
                error: publishData.error?.message || 'Failed to publish media'
            };
        }

        console.log('[META_PUBLISH] Instagram post published:', publishData.id);

        // Get permalink
        const mediaResponse = await fetch(
            `${META_GRAPH_URL}/${publishData.id}?fields=permalink&access_token=${accessToken}`
        );
        const mediaData = await mediaResponse.json();

        return {
            success: true,
            platform: 'instagram',
            platformPostId: publishData.id,
            permalink: mediaData.permalink
        };

    } catch (error) {
        console.error('[META_PUBLISH] Instagram publish error:', error);
        return {
            success: false,
            platform: 'instagram',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Publish a post to all selected platforms
 */
export async function publishPost(
    workspaceId: string,
    postId: string,
    platforms: string[],
    content: string,
    mediaUrls: string[]
): Promise<{ results: PublishResult[]; allSucceeded: boolean }> {
    const results: PublishResult[] = [];
    const accounts = await getConnectedAccounts(workspaceId);

    console.log('[META_PUBLISH] Publishing post', { postId, platforms, accountsFound: accounts.length });

    for (const platform of platforms) {
        // Find the account for this platform
        const account = accounts.find(a => a.platform === platform);

        if (!account) {
            console.warn(`[META_PUBLISH] No ${platform} account connected`);
            results.push({
                success: false,
                platform: platform as 'facebook' | 'instagram',
                error: `No ${platform} account connected`
            });
            continue;
        }

        let result: PublishResult;

        if (platform === 'facebook') {
            if (mediaUrls.length > 0) {
                result = await publishToFacebookPhoto(
                    account.account_id,
                    account.access_token,
                    content,
                    mediaUrls[0] // First image for now
                );
            } else {
                result = await publishToFacebookText(
                    account.account_id,
                    account.access_token,
                    content
                );
            }
        } else if (platform === 'instagram') {
            if (mediaUrls.length === 0) {
                result = {
                    success: false,
                    platform: 'instagram',
                    error: 'Instagram requires at least one image'
                };
            } else {
                result = await publishToInstagram(
                    account.account_id,
                    account.access_token,
                    content,
                    mediaUrls[0]
                );
            }
        } else {
            result = {
                success: false,
                platform: platform as 'facebook' | 'instagram',
                error: `Unsupported platform: ${platform}`
            };
        }

        results.push(result);

        // Store in published_posts table if successful
        if (result.success && result.platformPostId) {
            await supabaseAdmin.from('published_posts').insert({
                post_id: postId,
                platform,
                platform_post_id: result.platformPostId,
                permalink: result.permalink
            });
        }
    }

    const allSucceeded = results.every(r => r.success);
    return { results, allSucceeded };
}
