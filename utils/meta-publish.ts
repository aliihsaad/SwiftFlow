/**
 * Meta API Publishing Utilities
 * 
 * Functions to publish content to Facebook Pages and Instagram Business accounts
 * via the Meta Graph API.
 */

import { createClient } from '@supabase/supabase-js';

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.m4v'];

function isVideoUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0];
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

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
 * Publish a single image to Instagram Business Account
 * Instagram requires a 2-step process: Create media container, then publish
 */
export async function publishToInstagram(
    igAccountId: string,
    accessToken: string,
    caption: string,
    imageUrl: string
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing single image to Instagram:', igAccountId);

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
 * Publish a carousel (multiple images) to Instagram Business Account
 *
 * Instagram carousel flow:
 * 1. Create individual media containers for each image (children, no caption)
 * 2. Create a carousel container referencing all children (with caption)
 * 3. Publish the carousel container
 */
export async function publishToInstagramCarousel(
    igAccountId: string,
    accessToken: string,
    caption: string,
    imageUrls: string[]
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing carousel to Instagram:', igAccountId, `(${imageUrls.length} images)`);

        // Step 1: Create individual media containers for each image
        const childIds: string[] = [];
        for (const imageUrl of imageUrls) {
            const containerResponse = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_url: imageUrl,
                    is_carousel_item: true,
                    access_token: accessToken
                })
            });

            const containerData = await containerResponse.json();

            if (!containerResponse.ok) {
                console.error('[META_PUBLISH] Instagram carousel child error:', containerData);
                return {
                    success: false,
                    platform: 'instagram',
                    error: containerData.error?.message || `Failed to create carousel item for image`
                };
            }

            console.log('[META_PUBLISH] Instagram carousel child created:', containerData.id);
            childIds.push(containerData.id);
        }

        // Wait for Instagram to process all media items
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 2: Create carousel container with all children
        const carouselResponse = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_type: 'CAROUSEL',
                children: childIds,
                caption,
                access_token: accessToken
            })
        });

        const carouselData = await carouselResponse.json();

        if (!carouselResponse.ok) {
            console.error('[META_PUBLISH] Instagram carousel container error:', carouselData);
            return {
                success: false,
                platform: 'instagram',
                error: carouselData.error?.message || 'Failed to create carousel container'
            };
        }

        const carouselContainerId = carouselData.id;
        console.log('[META_PUBLISH] Instagram carousel container created:', carouselContainerId);

        // Wait for carousel to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Publish the carousel
        const publishResponse = await fetch(`${META_GRAPH_URL}/${igAccountId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: carouselContainerId,
                access_token: accessToken
            })
        });

        const publishData = await publishResponse.json();

        if (!publishResponse.ok) {
            console.error('[META_PUBLISH] Instagram carousel publish error:', publishData);
            return {
                success: false,
                platform: 'instagram',
                error: publishData.error?.message || 'Failed to publish carousel'
            };
        }

        console.log('[META_PUBLISH] Instagram carousel published:', publishData.id);

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
        console.error('[META_PUBLISH] Instagram carousel error:', error);
        return {
            success: false,
            platform: 'instagram',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Publish a video (Reel) to Instagram Business Account
 * Videos require: video_url, media_type=REELS, and polling for processing status
 */
export async function publishToInstagramVideo(
    igAccountId: string,
    accessToken: string,
    caption: string,
    videoUrl: string
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing Reel to Instagram:', igAccountId);

        // Step 1: Create video container
        const containerResponse = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_url: videoUrl,
                caption,
                media_type: 'REELS',
                access_token: accessToken
            })
        });

        const containerData = await containerResponse.json();

        if (!containerResponse.ok) {
            console.error('[META_PUBLISH] Instagram video container error:', containerData);
            return {
                success: false,
                platform: 'instagram',
                error: containerData.error?.message || 'Failed to create video container'
            };
        }

        const containerId = containerData.id;
        console.log('[META_PUBLISH] Instagram video container created:', containerId);

        // Step 2: Poll for processing status (videos take longer than images)
        let status = 'IN_PROGRESS';
        let attempts = 0;
        const maxAttempts = 30; // up to ~60 seconds

        while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;

            const statusResponse = await fetch(
                `${META_GRAPH_URL}/${containerId}?fields=status_code&access_token=${accessToken}`
            );
            const statusData = await statusResponse.json();
            status = statusData.status_code || 'IN_PROGRESS';
            console.log(`[META_PUBLISH] Instagram video status (attempt ${attempts}): ${status}`);
        }

        if (status !== 'FINISHED') {
            return {
                success: false,
                platform: 'instagram',
                error: `Video processing failed with status: ${status}`
            };
        }

        // Step 3: Publish
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
            console.error('[META_PUBLISH] Instagram video publish error:', publishData);
            return {
                success: false,
                platform: 'instagram',
                error: publishData.error?.message || 'Failed to publish video'
            };
        }

        console.log('[META_PUBLISH] Instagram Reel published:', publishData.id);

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
        console.error('[META_PUBLISH] Instagram video error:', error);
        return {
            success: false,
            platform: 'instagram',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Publish a video to a Facebook Page
 */
export async function publishToFacebookVideo(
    pageId: string,
    accessToken: string,
    message: string,
    videoUrl: string
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing video to Facebook Page:', pageId);

        const response = await fetch(`${META_GRAPH_URL}/${pageId}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_url: videoUrl,
                description: message,
                access_token: accessToken
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[META_PUBLISH] Facebook video error:', data);
            return {
                success: false,
                platform: 'facebook',
                error: data.error?.message || 'Unknown Facebook video error'
            };
        }

        console.log('[META_PUBLISH] Facebook video posted:', data.id);
        return {
            success: true,
            platform: 'facebook',
            platformPostId: data.id
        };

    } catch (error) {
        console.error('[META_PUBLISH] Facebook video error:', error);
        return {
            success: false,
            platform: 'facebook',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Publish multiple photos to a Facebook Page as a multi-photo post
 *
 * Facebook multi-photo flow:
 * 1. Upload each photo as unpublished
 * 2. Create a feed post with all photos attached
 */
export async function publishToFacebookMultiPhoto(
    pageId: string,
    accessToken: string,
    message: string,
    imageUrls: string[]
): Promise<PublishResult> {
    try {
        console.log('[META_PUBLISH] Publishing multi-photo to Facebook:', pageId, `(${imageUrls.length} images)`);

        // Step 1: Upload each photo as unpublished
        const photoIds: string[] = [];
        for (const imageUrl of imageUrls) {
            const response = await fetch(`${META_GRAPH_URL}/${pageId}/photos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: imageUrl,
                    published: false,
                    access_token: accessToken
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('[META_PUBLISH] Facebook unpublished photo error:', data);
                return {
                    success: false,
                    platform: 'facebook',
                    error: data.error?.message || 'Failed to upload photo'
                };
            }

            console.log('[META_PUBLISH] Facebook unpublished photo uploaded:', data.id);
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

        const feedResponse = await fetch(`${META_GRAPH_URL}/${pageId}/feed`, {
            method: 'POST',
            body: params
        });

        const feedData = await feedResponse.json();

        if (!feedResponse.ok) {
            console.error('[META_PUBLISH] Facebook multi-photo feed error:', feedData);
            return {
                success: false,
                platform: 'facebook',
                error: feedData.error?.message || 'Failed to create multi-photo post'
            };
        }

        console.log('[META_PUBLISH] Facebook multi-photo post created:', feedData.id);
        return {
            success: true,
            platform: 'facebook',
            platformPostId: feedData.id,
            permalink: `https://facebook.com/${feedData.id}`
        };

    } catch (error) {
        console.error('[META_PUBLISH] Facebook multi-photo error:', error);
        return {
            success: false,
            platform: 'facebook',
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
        const hasVideo = mediaUrls.length === 1 && isVideoUrl(mediaUrls[0]);

        if (platform === 'facebook') {
            if (hasVideo) {
                result = await publishToFacebookVideo(
                    account.account_id,
                    account.access_token,
                    content,
                    mediaUrls[0]
                );
            } else if (mediaUrls.length > 1) {
                result = await publishToFacebookMultiPhoto(
                    account.account_id,
                    account.access_token,
                    content,
                    mediaUrls
                );
            } else if (mediaUrls.length === 1) {
                result = await publishToFacebookPhoto(
                    account.account_id,
                    account.access_token,
                    content,
                    mediaUrls[0]
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
                    error: 'Instagram requires at least one media'
                };
            } else if (hasVideo) {
                result = await publishToInstagramVideo(
                    account.account_id,
                    account.access_token,
                    content,
                    mediaUrls[0]
                );
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
