
export default function DataDeletionInstructions() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Data Deletion Instructions</h1>
                    <p className="mt-2 text-sm text-gray-500">Last updated: January 12, 2026</p>
                </div>

                <div className="prose prose-blue dark:prose-invert max-w-none space-y-6">
                    <section>
                        <p className="text-gray-600 dark:text-gray-300">
                            We respect your privacy and provide you with the option to request the deletion of your data associated with our Social Media Manager AI Tool.
                            Pursuant to Facebook Platform rules, we provide the following instructions for deleting your data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">How to Request Data Deletion</h2>
                        <ol className="list-decimal pl-5 mt-2 space-y-3 text-gray-600 dark:text-gray-300">
                            <li>
                                <strong>Send an Email Request:</strong> To initiate a data deletion request, please send an email to our Data Protection Officer at:
                                <br />
                                <a href="mailto:alisaad_10@hotmail.com" className="text-blue-600 hover:underline font-medium block mt-1">alisaad_10@hotmail.com</a>
                            </li>
                            <li>
                                <strong>Subject Line:</strong> Please use the subject line <strong>"Data Deletion Request"</strong> to ensure timely processing.
                            </li>
                            <li>
                                <strong>Include Account Details:</strong> In the body of the email, please include the email address associated with your account and the specific Facebook/Instagram pages for which you wish to remove data.
                            </li>
                        </ol>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Processing Timeline</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            Upon receiving your request, we will verify your identity and confirm the deletion of your data within <strong>30 days</strong>.
                            You will receive a confirmation email once the process is complete.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Scope of Deletion</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            Deletion will remove all stored authentication tokens, cached profile data, and analytics insights associated with your account from our servers.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
