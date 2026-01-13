
import Link from 'next/link'

export function SiteFooter() {
    return (
        <footer className="border-t py-8 bg-muted/20 mt-auto">
            <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                    <span>© 2026 Social Media Manager AI Tool</span>
                    <nav className="flex items-center gap-6">
                        <Link href="/privacy" className="hover:text-foreground transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/terms" className="hover:text-foreground transition-colors">
                            Terms of Service
                        </Link>
                        <Link href="/data-deletion" className="hover:text-foreground transition-colors">
                            Data Deletion
                        </Link>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <a href="mailto:alisaad_10@hotmail.com" className="hover:text-foreground transition-colors">
                        Contact Support
                    </a>
                </div>
            </div>
        </footer>
    )
}
