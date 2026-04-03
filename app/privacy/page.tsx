const sectionHeadingClass = "text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3"
const bodyClass = "text-gray-600 dark:text-gray-300"
const listClass = "list-disc pl-5 mt-2 space-y-2 text-gray-600 dark:text-gray-300"

export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Privacy Policy</h1>
                    <p className="mt-2 text-sm text-gray-500">Last updated: April 3, 2026</p>
                </div>

                <div className="prose prose-blue dark:prose-invert max-w-none space-y-8">
                    <section>
                        <h2 className={sectionHeadingClass}>1. Scope</h2>
                        <p className={bodyClass}>
                            Swift Digital Solutions LLC (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates SwiftFlow, a social media management platform
                            for businesses. This Privacy Policy explains what information we collect, store, process, and delete when you use the product,
                            including data accessed through Meta products such as Facebook Pages and Instagram Business accounts.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>2. Information We Process</h2>
                        <p className={bodyClass}>
                            The categories below reflect the current product and reviewer-safe release behavior.
                        </p>
                        <ul className={listClass}>
                            <li><strong>Workspace and account information:</strong> user account identifiers, workspace membership, roles, and basic profile details needed to authenticate and authorize access.</li>
                            <li><strong>Connected social account records:</strong> Facebook Page IDs, Instagram Business account IDs, usernames, account names, profile pictures, granted scopes, token expiry timestamps, and connection metadata.</li>
                            <li><strong>Authentication secrets:</strong> Meta tokens and workspace AI provider keys. These are stored encrypted at the application layer and used only in server-side routes and server-side functions.</li>
                            <li><strong>Post data:</strong> draft posts, scheduled posts, published post content, media URLs, target platforms, schedule timestamps, publishing status, Meta-side published post IDs, and permalinks.</li>
                            <li><strong>Analytics data when enabled:</strong> follower metrics, engagement metrics, post analytics snapshots, and related sync timestamps.</li>
                            <li><strong>Comments and messages when enabled:</strong> comment content, conversation threads, message bodies, attachment metadata, participant usernames, and related account identifiers.</li>
                            <li><strong>Webhook and automation records when enabled:</strong> webhook event IDs, automation logs, processed trigger records, and execution context needed to prevent duplicate processing and maintain audit history.</li>
                            <li><strong>AI usage data:</strong> AI prompts, chat sessions, generated content, generated assets, image prompts, and provider/model metadata needed to deliver workspace AI features.</li>
                            <li><strong>Support and operational data:</strong> error logs, request metadata, invite emails, and deletion/support communications.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>3. How We Use Information</h2>
                        <ul className={listClass}>
                            <li>Authenticate users and enforce workspace permissions.</li>
                            <li>Connect one Facebook Page and its linked Instagram Business account to a workspace.</li>
                            <li>Create, schedule, and publish user-authored social content.</li>
                            <li>Display connected account state, publishing history, and health or permission status.</li>
                            <li>Generate AI-assisted draft content, image prompts, and reply suggestions.</li>
                            <li>Operate analytics, comments, messaging, webhook, and automation features when those features are enabled in the product release and supported by granted permissions.</li>
                            <li>Respond to support, compliance, and deletion requests.</li>
                        </ul>
                        <p className={`${bodyClass} mt-3`}>
                            We do not sell personal information or use Meta data for unrelated advertising resale. Meta data is used only to operate the product features authorized by the user.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>4. Reviewer-Safe Release Scope</h2>
                        <p className={bodyClass}>
                            The Meta review deployment is intentionally narrower than the full internal product. In the reviewer release, the visible flow is limited to:
                        </p>
                        <ul className={listClass}>
                            <li>connecting a Facebook Page and linked Instagram Business account,</li>
                            <li>creating a post,</li>
                            <li>publishing immediately, and</li>
                            <li>scheduling a future publish.</li>
                        </ul>
                        <p className={`${bodyClass} mt-3`}>
                            Messaging, comment moderation, analytics, automation, and subscription flows are hidden or blocked in the reviewer deployment until they are ready for their own review phase.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>5. Retention</h2>
                        <ul className={listClass}>
                            <li>Connected account records and encrypted tokens are retained until the user disconnects the account, the workspace is deleted, or a deletion request is fulfilled.</li>
                            <li>Post records, published post mappings, AI sessions, and generated assets are retained until they are deleted by the workspace or removed as part of an account deletion request.</li>
                            <li>Webhook, automation, analytics, comments, and messaging records are retained only for product operation, troubleshooting, and audit needs, and may be deleted earlier if those features are disabled or a deletion request applies.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>6. Security</h2>
                        <ul className={listClass}>
                            <li>Workspace AI keys and Meta tokens are stored encrypted at the application layer.</li>
                            <li>Secrets are used only in server-side routes or server-side functions, not exposed directly to other end users.</li>
                            <li>Workspace access is restricted through authentication, role-based access control, and workspace-scoped data checks.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>7. Data Sharing</h2>
                        <p className={bodyClass}>
                            We share data only with service providers needed to operate the product, such as Supabase for infrastructure and storage, Vercel for hosting, AI providers for requested AI tasks, and Meta for the platform actions the user authorizes.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>8. Deletion Requests</h2>
                        <p className={bodyClass}>
                            You may request deletion of your workspace or connected-platform data at any time. Instructions are available on our{" "}
                            <a href="/data-deletion" className="text-blue-600 hover:underline">Data Deletion</a> page.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>9. Contact</h2>
                        <p className={bodyClass}>
                            For privacy, support, or compliance questions, contact{" "}
                            <a href="mailto:info@swiftdigital-s.com" className="text-blue-600 hover:underline">info@swiftdigital-s.com</a>.
                        </p>
                        <p className="mt-2 text-sm text-gray-500">
                            Swift Digital Solutions LLC<br />
                            <a href="https://swiftdigital-s.com" className="hover:underline">https://swiftdigital-s.com</a>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
