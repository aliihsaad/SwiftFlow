
export default function PrivacyPolicy() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Privacy Policy</h1>
                    <p className="mt-2 text-sm text-gray-500">Last updated: January 12, 2026</p>
                </div>

                <div className="prose prose-blue dark:prose-invert max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">1. Introduction</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            Swift Digital Solutions LLC ("we", "us", or "our") operates the Social Media Manager AI Tool.
                            This Privacy Policy explains how we handle data accessed from Facebook and Instagram via the Meta Graph API.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">2. Data We Collect & Access</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            Our application accesses the following data from your Facebook and Instagram accounts solely for the purpose of providing digital marketing, automation, and social media management services:
                        </p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600 dark:text-gray-300">
                            <li><strong>Pages & Profiles:</strong> Names, IDs, and profile pictures of managed pages.</li>
                            <li><strong>Content:</strong> Posts, photos, videos, and captions you publish.</li>
                            <li><strong>Insights:</strong> Performance analytics (likes, views, engagement) for your content.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">3. How We Use Data</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            Data accessed via the Meta Platform is used exclusively to:
                        </p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-600 dark:text-gray-300">
                            <li>Display your social media content within our management dashboard.</li>
                            <li>Provide analytics and performance insights.</li>
                            <li>Enable scheduling and publishing of new content.</li>
                        </ul>
                        <p className="mt-3 text-gray-600 dark:text-gray-300">
                            <strong>We do not sell, trade, or transfer your data to outside parties.</strong> Data is strictly used for the functionality of our digital marketing and automation tools.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">4. Data Security</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            We implement appropriate security measures to maintain the safety of your personal information.
                            Authentication tokens are stored securely and are only used to make authorized API requests on your behalf.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">5. Data Deletion</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            You have the right to request the deletion of your data. Please refer to our <a href="/data-deletion" className="text-blue-600 hover:underline">Data Deletion Instructions</a> page for details on how to remove your data from our system.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">6. Jurisdiction</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            This policy shall be governed by the laws of the State of Michigan, United States.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">7. Contact Us</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            If you have any questions regarding this Privacy Policy, please contact us via email:
                        </p>
                        <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">
                            <a href="mailto:info@swiftdigital-s.com" className="text-blue-600 hover:underline">info@swiftdigital-s.com</a>
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                            Swift Digital Solutions LLC<br />
                            <a href="https://swiftdigital-s.com" className="hover:underline">https://swiftdigital-s.com</a>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
