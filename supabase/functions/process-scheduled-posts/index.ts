// @ts-nocheck - Deno runtime, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import { canPublishWithMetaAccount, decryptMetaAccountRow } from "../_shared/meta-account.ts";
import { normalizeMetaGraphError } from "../_shared/meta-graph-errors.ts";
import { META_GRAPH_API_BASE_URL } from "../_shared/meta-graph.ts";
import { redactSensitiveLogValue, redactSensitiveString } from "../_shared/log-redaction.ts";

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.m4v'];

function isVideoUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0]; // strip query params
    return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function isPrivateIpv4Host(hostname: string): boolean {
    const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;

    const octets = match.slice(1).map((part) => Number(part));
    if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) return true;

    return (
        octets[0] === 10 ||
        octets[0] === 127 ||
        octets[0] === 0 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
    );
}

function isSafePublicMediaUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (url.username || url.password) return false;

        const hostname = url.hostname.trim().toLowerCase();
        if (!hostname) return false;
        if (
            hostname === 'localhost' ||
            hostname === '0.0.0.0' ||
            hostname === '::1' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.local') ||
            hostname.endsWith('.internal') ||
            hostname.endsWith('.lan') ||
            hostname.endsWith('.home') ||
            hostname.endsWith('.test') ||
            hostname.endsWith('.invalid') ||
            isPrivateIpv4Host(hostname)
        ) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isAuthorizedInternalInvoke(req: Request): boolean {
    const expectedApiKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const providedApiKey = req.headers.get('apikey') || ''

    if (!expectedApiKey) {
        console.error('[process-scheduled-posts] Missing SUPABASE_SERVICE_ROLE_KEY for internal auth check')
        return false
    }

    return providedApiKey === expectedApiKey
}

interface PublishResult {
    success: boolean;
    platform: string;
    platformPostId?: string;
    error?: string;
    errorCode?: string;
}

function buildMetaPublishFailure(
    platform: "facebook" | "instagram",
    graphError: Record<string, unknown> | null | undefined,
    fallbackMessage: string,
): PublishResult {
    const normalized = normalizeMetaGraphError(graphError, {
        feature: "publishing",
        platform,
        operation: "publish_post",
    });

    return {
        success: false,
        platform,
        error: normalized.message || fallbackMessage,
        errorCode: normalized.code,
    };
}

function buildPublishFailure(
    platform: string,
    error: string,
    errorCode: string,
): PublishResult {
    return {
        success: false,
        platform,
        error,
        errorCode,
    };
}

function summarizePublishResults(results: PublishResult[]): {
    errorCode: string | null;
    errorMessage: string | null;
} {
    const failures = results.filter((result) => !result.success);
    if (failures.length === 0) {
        return {
            errorCode: null,
            errorMessage: null,
        };
    }

    const successes = results.filter((result) => result.success);
    const successPlatforms = successes.map((result) => result.platform);
    const failureSummary = failures
        .map((result) => {
            const detail = result.error || "Publishing failed";
            return `${result.platform}: ${detail}`;
        })
        .join(" | ");

    const prefix = successPlatforms.length > 0
        ? `Published to ${successPlatforms.join(", ")} but failed on ${failures.map((result) => result.platform).join(", ")}. `
        : "";

    return {
        errorCode: failures[0]?.errorCode || "publish_failed",
        errorMessage: `${prefix}${failureSummary}`.trim(),
    };
}

function summarizeMetaGraphPayload(payload: any): string {
    const error = payload?.error;
    if (error && typeof error === 'object') {
        const code = error.code ?? 'unknown';
        const subcode = error.error_subcode ?? 'unknown';
        const type = error.type ?? 'unknown';
        const message = typeof error.message === 'string' ? redactSensitiveString(error.message) : 'unknown';
        return `error_type=${type} error_code=${code} error_subcode=${subcode} message=${message}`;
    }

    if (payload && typeof payload === 'object') {
        const keys = Object.keys(payload).slice(0, 6);
        return keys.length > 0 ? `keys=${keys.join(',')}` : 'empty_object';
    }

    return typeof payload === 'string' && payload.length > 0 ? redactSensitiveString(payload) : 'no_details';
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
            return buildMetaPublishFailure('facebook', data?.error, 'Failed to publish to Facebook');
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
            return buildMetaPublishFailure('instagram', containerData?.error, 'Failed to create Instagram media container');
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
            return buildMetaPublishFailure('instagram', publishData?.error, 'Failed to publish to Instagram');
        }

        return { success: true, platform: 'instagram', platformPostId: publishData.id };
    } catch (error) {
        return { success: false, platform: 'instagram', error: String(error) };
    }
}

/**
 * Publish a video (Reel) to Instagram Business Account
 * Videos require: video_url, media_type=REELS, and polling for processing status
 */
async function publishToInstagramVideo(
    igAccountId: string,
    accessToken: string,
    caption: string,
    videoUrl: string
): Promise<PublishResult> {
    try {
        console.log('Publishing Instagram Reel:', igAccountId, 'video:', videoUrl);

        // Step 1: Create video container
        const containerRes = await fetch(`${META_GRAPH_URL}/${igAccountId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_url: videoUrl,
                caption,
                media_type: 'REELS',
                access_token: accessToken
            })
        });

        const containerData = await containerRes.json();
        console.log('Instagram video container response received');
        if (!containerRes.ok) {
            console.error(`Instagram video container FAILED: ${summarizeMetaGraphPayload(containerData)}`);
            return buildMetaPublishFailure('instagram', containerData?.error, 'Failed to create Instagram video container');
        }

        const containerId = containerData.id;
        console.log('Instagram video container created:', containerId);

        // Step 2: Poll for processing status (videos take longer than images)
        let status = 'IN_PROGRESS';
        let attempts = 0;
        const maxAttempts = 30; // up to ~60 seconds

        while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;

            const statusRes = await fetch(
                `${META_GRAPH_URL}/${containerId}?fields=status_code&access_token=${accessToken}`
            );
            const statusData = await statusRes.json();
            status = statusData.status_code || 'IN_PROGRESS';
            console.log(`Instagram video status (attempt ${attempts}): ${status}`);
        }

        if (status !== 'FINISHED') {
            console.error('Instagram video processing did not finish. Final status:', status);
            return buildPublishFailure('instagram', `Video processing failed with status: ${status}`, 'media_processing_failed');
        }

        // Step 3: Publish
        const publishRes = await fetch(`${META_GRAPH_URL}/${igAccountId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerId,
                access_token: accessToken
            })
        });

        const publishData = await publishRes.json();
        console.log('Instagram video publish response received');
        if (!publishRes.ok) {
            console.error(`Instagram video publish FAILED: ${summarizeMetaGraphPayload(publishData)}`);
            return buildMetaPublishFailure('instagram', publishData?.error, 'Failed to publish Instagram video');
        }

        console.log('Instagram Reel published:', publishData.id);
        return { success: true, platform: 'instagram', platformPostId: publishData.id };
    } catch (error) {
        console.error('Instagram video EXCEPTION:', redactSensitiveLogValue(error));
        return { success: false, platform: 'instagram', error: String(error) };
    }
}

/**
 * Publish a video to a Facebook Page
 */
async function publishToFacebookVideo(
    pageId: string,
    accessToken: string,
    message: string,
    videoUrl: string
): Promise<PublishResult> {
    try {
        console.log('Publishing Facebook video:', pageId, 'video:', videoUrl);

        const res = await fetch(`${META_GRAPH_URL}/${pageId}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_url: videoUrl,
                description: message,
                access_token: accessToken
            })
        });

        const data = await res.json();
        console.log('Facebook video publish response received');
        if (!res.ok) {
            console.error(`Facebook video FAILED: ${summarizeMetaGraphPayload(data)}`);
            return buildMetaPublishFailure('facebook', data?.error, 'Failed to publish Facebook video');
        }

        console.log('Facebook video published:', data.id);
        return { success: true, platform: 'facebook', platformPostId: data.id };
    } catch (error) {
        console.error('Facebook video EXCEPTION:', redactSensitiveLogValue(error));
        return { success: false, platform: 'facebook', error: String(error) };
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
                return buildMetaPublishFailure('instagram', data?.error, 'Failed to create Instagram carousel item');
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
            return buildMetaPublishFailure('instagram', carouselData?.error, 'Failed to create Instagram carousel');
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
            return buildMetaPublishFailure('instagram', publishData?.error, 'Failed to publish Instagram carousel');
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
                return buildMetaPublishFailure('facebook', data?.error, 'Failed to upload Facebook photo');
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
            console.error('Facebook multi-photo feed error:', redactSensitiveLogValue(feedData));
            return buildMetaPublishFailure('facebook', feedData?.error, 'Failed to create Facebook multi-photo post');
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

    if (!isAuthorizedInternalInvoke(req)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401
        });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // ATOMIC: Claim posts by updating status in a single operation
        // This prevents race conditions where multiple function invocations
        // could fetch the same post before either locks it.
        // Only rows that are actually updated (status changed from 'scheduled' to 'publishing')
        // will be returned, ensuring each post is processed exactly once.
        const now = new Date().toISOString();
        const { data: duePosts, error: fetchError } = await supabase
            .from('posts')
            .update({ status: 'publishing', updated_at: now })
            .eq('status', 'scheduled')
            .lte('scheduled_for', now)
            .select('*')
            .limit(10);

        if (fetchError) {
            console.error('Error claiming posts:', redactSensitiveLogValue(fetchError));
            return new Response(JSON.stringify({ error: fetchError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            });
        }

        console.log(`Claimed ${duePosts?.length || 0} posts for publishing`);

        const results: { postId: string; results: PublishResult[] }[] = [];

        for (const post of duePosts || []) {
            const postResults: PublishResult[] = [];
            const platforms = post.platforms as string[];
            const rawMediaUrls = Array.isArray(post.media_urls)
                ? (post.media_urls as unknown[]).filter((value): value is string => typeof value === 'string')
                : [];
            const hasUnsafeMediaUrl = rawMediaUrls.some((value) => !isSafePublicMediaUrl(value));
            const mediaUrls = rawMediaUrls.filter((value) => isSafePublicMediaUrl(value));
            const content = post.content || '';

            // Get social accounts for this workspace
            const { data: accounts } = await supabase
                .from('social_accounts')
                .select('id, platform, account_id, access_token, metadata')
                .eq('workspace_id', post.workspace_id);
            const decryptedAccounts = await Promise.all((accounts || []).map((account) => decryptMetaAccountRow(account)));

            for (const platform of platforms) {
                const account = decryptedAccounts.find((candidate) => candidate.platform === platform);

                if (!account) {
                    postResults.push(buildPublishFailure(
                        platform,
                        `No ${platform} account connected`,
                        'no_connected_account',
                    ));
                    continue;
                }
                if (hasUnsafeMediaUrl) {
                    postResults.push(buildPublishFailure(
                        platform,
                        'One or more media URLs are invalid or private. Re-upload the media and try again.',
                        'invalid_media_url',
                    ));
                    continue;
                }
                if (!account.access_token) {
                    postResults.push(buildPublishFailure(
                        platform,
                        `No ${platform} access token available`,
                        'missing_access_token',
                    ));
                    continue;
                }
                if ((platform === 'facebook' || platform === 'instagram') && !canPublishWithMetaAccount(account.metadata, platform)) {
                    postResults.push(buildPublishFailure(
                        platform,
                        platform === 'facebook'
                            ? 'Publishing is not enabled for this Facebook Page. Reconnect with pages_manage_posts.'
                            : 'Publishing is not enabled for this Instagram account. Reconnect with instagram_content_publish.',
                        'meta_missing_permission',
                    ));
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
                        result = buildPublishFailure('instagram', 'Instagram publishing requires at least one media item.', 'media_required');
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
                    result = buildPublishFailure(platform, 'Unsupported platform', 'unsupported_platform');
                }

                console.log(`Platform ${platform} result:`, redactSensitiveString(JSON.stringify(result)));
                postResults.push(result);

                // Store in published_posts if successful
                if (result.success && result.platformPostId) {
                    const insertPayload = {
                        post_id: post.id,
                        platform,
                        platform_post_id: result.platformPostId,
                        social_account_id: account.id,
                        platform_caption: content || null
                    };

                    const { error: publishedInsertError } = await supabase.from('published_posts').insert(insertPayload);
                    if (publishedInsertError) {
                        // Backward compatibility if new columns are not present yet.
                        if (/social_account_id|platform_caption/i.test(String(publishedInsertError.message || ''))) {
                            await supabase.from('published_posts').insert({
                                post_id: post.id,
                                platform,
                                platform_post_id: result.platformPostId
                            });
                        } else {
                            console.error('Failed to insert published_posts:', redactSensitiveLogValue(publishedInsertError));
                        }
                    }
                }
            }

            // Update post status
            console.log(`Post ${post.id} results:`, redactSensitiveString(JSON.stringify(postResults)));
            const allSucceeded = postResults.every(r => r.success);
            const failureSummary = summarizePublishResults(postResults);
            await supabase
                .from('posts')
                .update({
                    status: allSucceeded ? 'published' : 'failed',
                    published_at: allSucceeded ? new Date().toISOString() : null,
                    last_publish_attempted_at: new Date().toISOString(),
                    last_publish_error_code: allSucceeded ? null : failureSummary.errorCode,
                    last_publish_error_message: allSucceeded ? null : failureSummary.errorMessage,
                    last_publish_results: postResults,
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
        console.error('Process scheduled posts error:', redactSensitiveLogValue(error));
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});
