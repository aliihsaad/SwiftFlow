const sectionHeadingClass = "text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3"
const bodyClass = "text-gray-600 dark:text-gray-300"
const listClass = "list-disc pl-5 mt-2 space-y-2 text-gray-600 dark:text-gray-300"

export default function TermsOfService() {
    return (
        <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Terms of Service</h1>
                    <p className="mt-2 text-sm text-gray-500">Last updated: April 3, 2026</p>
                </div>

                <div className="prose prose-blue dark:prose-invert max-w-none space-y-8">
                    <section>
                        <h2 className={sectionHeadingClass}>1. Acceptance</h2>
                        <p className={bodyClass}>
                            By using SwiftFlow, you agree to these Terms of Service. If you are using the service on behalf of a business, you confirm that you have authority to bind that business to these terms.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>2. Service Description</h2>
                        <p className={bodyClass}>
                            SwiftFlow is a workspace-based social media management product. Depending on release scope and granted permissions, the service may support connected-account setup, post drafting, scheduling, publishing, analytics, comments, messaging, automations, and AI-assisted content workflows.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>3. User Responsibilities</h2>
                        <ul className={listClass}>
                            <li>You are responsible for the content, prompts, media, and publishing decisions made through your workspace.</li>
                            <li>You must have authority to manage any connected Facebook Page, Instagram Business account, or other platform account you connect.</li>
                            <li>You agree to comply with applicable platform rules, intellectual property rules, and local law.</li>
                            <li>You must not use the service to impersonate others, distribute unlawful content, or automate abusive messaging or engagement behavior.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>4. AI Features</h2>
                        <p className={bodyClass}>
                            AI features are assistive tools. You remain responsible for reviewing outputs before publishing, sending, or acting on them. We do not guarantee that AI-generated text, images, or recommendations are accurate, original, or appropriate for every use case.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>5. Third-Party Platforms</h2>
                        <p className={bodyClass}>
                            The service depends on third-party platforms and providers such as Meta, Supabase, hosting providers, and AI providers. Those providers may impose rate limits, policy restrictions, outages, or enforcement actions outside our control.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>6. Availability and Changes</h2>
                        <p className={bodyClass}>
                            We may modify, suspend, or remove features as the product evolves, including narrowing functionality for security, compliance, or staged rollout reasons. We do not guarantee uninterrupted availability.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>7. Termination</h2>
                        <p className={bodyClass}>
                            We may suspend or terminate access if use of the service creates security, compliance, payment, or abuse risk. You may stop using the service at any time and request deletion as described on the Data Deletion page.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>8. Limitation of Liability</h2>
                        <p className={bodyClass}>
                            The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law, we disclaim warranties and are not liable for indirect, incidental, or consequential damages arising from platform changes, API failures, publishing errors, AI output quality, or content moderation actions by third-party platforms.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>9. Contact</h2>
                        <p className={bodyClass}>
                            Questions about these terms can be sent to{" "}
                            <a href="mailto:info@swiftdigital-s.com" className="text-blue-600 hover:underline">info@swiftdigital-s.com</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
