import { cookies } from "next/headers"
import { ChatInterface } from "./chat-interface"

export default async function AssistantPage() {
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('active_workspace_id')?.value

    return <ChatInterface workspaceId={workspaceId} />
}
