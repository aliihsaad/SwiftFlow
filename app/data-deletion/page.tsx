const sectionHeadingClass = "text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3"
const bodyClass = "text-gray-600 dark:text-gray-300"
const listClass = "list-decimal pl-5 mt-2 space-y-3 text-gray-600 dark:text-gray-300"
const bulletClass = "list-disc pl-5 mt-2 space-y-2 text-gray-600 dark:text-gray-300"

export default function DataDeletionInstructions() {
    return (
        <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Data Deletion Instructions</h1>
                    <p className="mt-2 text-sm text-gray-500">Last updated: April 3, 2026</p>
                </div>

                <div className="prose prose-blue dark:prose-invert max-w-none space-y-8">
                    <section>
                        <p className={bodyClass}>
                            We provide deletion support for account, workspace, and Meta-connected data associated with SwiftFlow. These instructions are provided for Meta Platform compliance and for general product privacy requests.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>1. Fastest Self-Service Option</h2>
                        <p className={bodyClass}>
                            If you still have access to your account, the fastest option is to disconnect the social account from the product and then contact us for workspace data removal.
                        </p>
                        <ul className={bulletClass}>
                            <li>Sign in to SwiftFlow.</li>
                            <li>Open <strong>Dashboard → Settings → Brand Profile → Connected Accounts</strong>.</li>
                            <li>Disconnect the connected Facebook Page or Instagram Business account.</li>
                            <li>Email us if you also want workspace posts, AI sessions, generated assets, or other stored records removed.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>2. Email Deletion Request</h2>
                        <ol className={listClass}>
                            <li>
                                Send an email to{" "}
                                <a href="mailto:info@swiftdigital-s.com" className="text-blue-600 hover:underline font-medium">
                                    info@swiftdigital-s.com
                                </a>.
                            </li>
                            <li>
                                Use the subject line <strong>Data Deletion Request - SwiftFlow</strong>.
                            </li>
                            <li>
                                Include the email address used for your account and, if applicable, the Facebook Page name, Instagram Business account, or workspace name involved.
                            </li>
                            <li>
                                Tell us whether you want only connected-platform data removed or the full workspace/account data deleted.
                            </li>
                        </ol>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>3. What We Can Delete</h2>
                        <ul className={bulletClass}>
                            <li>Connected social account records, encrypted tokens, granted scopes, and related connection metadata.</li>
                            <li>Drafts, scheduled posts, published-post mappings, and uploaded/generated media tied to the workspace.</li>
                            <li>Analytics snapshots, comments, message threads, webhook event records, automation logs, and processed trigger records, when present.</li>
                            <li>AI chat sessions, prompts, generated assets, and related workspace AI records.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>4. Processing Timeline</h2>
                        <p className={bodyClass}>
                            We aim to verify and complete deletion requests within <strong>30 days</strong>. If we need more information to confirm ownership of the account or workspace, we will contact you before processing.
                        </p>
                    </section>

                    <section>
                        <h2 className={sectionHeadingClass}>5. Meta Access Removal</h2>
                        <p className={bodyClass}>
                            You may also remove app access directly from your Meta account settings. Removing Meta access stops future data access, but it does not automatically delete all workspace records already stored in SwiftFlow. For full deletion, please send us a request using the steps above.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
