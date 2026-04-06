import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDashboardPathBlockedInCurrentRelease } from "@/lib/release-channel";

function applySecurityHeaders(response: NextResponse) {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
        "Permissions-Policy",
        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    );

    if (process.env.NODE_ENV === "production") {
        response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    return response;
}

export async function proxy(request: NextRequest) {
    let response = applySecurityHeaders(NextResponse.next({
        request: {
            headers: request.headers,
        },
    }));

    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) =>
                            request.cookies.set(name, value)
                        );
                        response = NextResponse.next({
                            request: {
                                headers: request.headers,
                            },
                        });
                        cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
                            response.cookies.set(name, value, cookieOptions)
                        );
                        applySecurityHeaders(response);
                    },
                },
            }
        );

        const {
            data: { user },
        } = await supabase.auth.getUser();

        // Protected Routes Logic
        if (request.nextUrl.pathname.startsWith("/dashboard")) {
            if (!user) {
                return applySecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
            }

            if (isDashboardPathBlockedInCurrentRelease(request.nextUrl.pathname)) {
                return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
            }

            // Workspace Check
            // If we're already on the onboarding page, allow it
            if (request.nextUrl.pathname === "/dashboard/onboarding") {
                return response;
            }

            const activeWorkspaceId = request.cookies.get("active_workspace_id")?.value;

            if (!activeWorkspaceId) {
                // No cookie? Check if user has ANY workspaces
                const { data: member } = await supabase
                    .from("workspace_members")
                    .select("workspace_id")
                    .eq("user_id", user.id)
                    .limit(1)
                    .single();

                if (member) {
                    // Has workspace -> Set cookie and continue
                    response.cookies.set("active_workspace_id", member.workspace_id, {
                        path: "/",
                        httpOnly: true,
                        sameSite: "lax",
                        secure: process.env.NODE_ENV === "production",
                    });
                } else {
                    // No workspaces -> Redirect to onboarding
                    return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard/onboarding", request.url)));
                }
            }
        }

        // Auth Page Logic (if logged in, go to dashboard)
        if (["/login", "/signup"].includes(request.nextUrl.pathname)) {
            if (user) {
                return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
            }
        }

        return applySecurityHeaders(response);
    } catch (error) {
        console.error("Middleware error:", error);
        // On error, allow the request to proceed
        // This prevents the middleware from blocking the entire app
        return applySecurityHeaders(response);
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
         * Feel free to modify this pattern to include more paths.
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
