"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles, Loader2, KeyRound, UserPlus } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const router = useRouter()
    const supabase = createClient()

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password
            })
            if (error) throw error
            router.push('/dashboard')
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Authentication failed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            setIsLoading(false)
            return
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters")
            setIsLoading(false)
            return
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${location.origin}/auth/callback`,
                }
            })
            if (error) throw error

            // If Supabase is configured to auto-confirm, redirect immediately
            if (data.session) {
                router.push('/dashboard')
            } else {
                setSuccess("Check your email for a confirmation link to complete your registration.")
            }
        } catch (error: any) {
            console.error(error)
            setError(error.message || "Sign up failed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${location.origin}/auth/callback`,
                },
            })
            if (error) throw error
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <div className="flex h-screen items-center justify-center bg-muted/20">
            <Card className="mx-auto max-w-sm w-full">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">SocialAI</CardTitle>
                    <CardDescription>
                        Social Media Management Platform
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="signin" onValueChange={() => { setError(null); setSuccess(null) }}>
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="signin">Sign In</TabsTrigger>
                            <TabsTrigger value="signup">Sign Up</TabsTrigger>
                        </TabsList>

                        {/* Sign In Tab */}
                        <TabsContent value="signin">
                            <form onSubmit={handleSignIn} className="grid gap-4">
                                {error && (
                                    <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-md">
                                        {error}
                                    </div>
                                )}
                                <div className="grid gap-2">
                                    <Label htmlFor="signin-email">Email</Label>
                                    <Input
                                        id="signin-email"
                                        type="email"
                                        placeholder="you@company.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="signin-password">Password</Label>
                                    <Input
                                        id="signin-password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <KeyRound className="mr-2 h-4 w-4" />
                                    )}
                                    Sign In
                                </Button>
                            </form>
                        </TabsContent>

                        {/* Sign Up Tab */}
                        <TabsContent value="signup">
                            <form onSubmit={handleSignUp} className="grid gap-4">
                                {error && (
                                    <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-md">
                                        {error}
                                    </div>
                                )}
                                {success && (
                                    <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/10 rounded-md">
                                        {success}
                                    </div>
                                )}
                                <div className="grid gap-2">
                                    <Label htmlFor="signup-email">Email</Label>
                                    <Input
                                        id="signup-email"
                                        type="email"
                                        placeholder="you@company.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="signup-password">Password</Label>
                                    <Input
                                        id="signup-password"
                                        type="password"
                                        placeholder="Min. 6 characters"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="confirm-password">Confirm Password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="Confirm your password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="mr-2 h-4 w-4" />
                                    )}
                                    Create Account
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>

                    <div className="mt-4 relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground bg-white dark:bg-slate-950">
                                Or continue with
                            </span>
                        </div>
                    </div>

                    <Button variant="outline" className="w-full mt-4" onClick={handleGoogleLogin}>
                        <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                        Google
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
