import requests
import json
import hashlib
import os
import base64
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import uuid
import time
import urllib.parse

SUPABASE_URL = "https://txomrdymcawauezlprvn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODExMDQyOCwiZXhwIjoyMDgzNjg2NDI4fQ.bO5zmywqDdNhN41s4lwHHTAJToCgDdXEBbLuNn08xxM"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMTA0MjgsImV4cCI6MjA4MzY4NjQyOH0.dwBcXZ_TZG97GCCvPPtfKETbxnm4jNFSF1K1FwFut0E"
APP_URL = "http://host.docker.internal:3000"
ENCRYPTION_KEY_HEX = "4b229bdfad4dd85e425716090a46674b103ead56275eb3c3b5ddaca558c231c0"

def to_base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def encrypt_secret(plaintext: str) -> str:
    """Replicates the app's encryptSecretIfNeeded() function"""
    key = hashlib.sha256(ENCRYPTION_KEY_HEX.encode('utf-8')).digest()
    iv = secrets.token_bytes(12)
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    ciphertext = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]
    iv_b64 = to_base64url(iv)
    tag_b64 = to_base64url(auth_tag)
    ct_b64 = to_base64url(ciphertext)
    return f"enc:v1:{iv_b64}.{tag_b64}.{ct_b64}"

# ============================================================
# STEP 1: Create and confirm test user
# ============================================================
print("=" * 60)
print("STEP 1: Create test user")
email = f"ssrf_test_{uuid.uuid4().hex[:8]}@pentest.local"
password = "PentestPassword123!@#"
print(f"Email: {email}")

signup_resp = requests.post(
    f"{SUPABASE_URL}/auth/v1/signup",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": email, "password": password},
    timeout=15
)
print(f"Signup status: {signup_resp.status_code}")
signup_data = signup_resp.json()
user_id = signup_data.get("id") or (signup_data.get("user") or {}).get("id")
print(f"User ID: {user_id}")

# ============================================================
# STEP 2: Confirm email via admin API
# ============================================================
print("\nSTEP 2: Confirm email via admin API")
confirm_resp = requests.put(
    f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json"
    },
    json={"email_confirm": True},
    timeout=15
)
print(f"Confirm status: {confirm_resp.status_code}")
print(f"Confirm response: {confirm_resp.text[:200]}")

# ============================================================
# STEP 3: Sign in to get access token
# ============================================================
print("\nSTEP 3: Sign in")
signin_resp = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": email, "password": password},
    timeout=15
)
print(f"Signin status: {signin_resp.status_code}")
signin_data = signin_resp.json()
access_token = signin_data.get("access_token")
refresh_token = signin_data.get("refresh_token")
print(f"Access token obtained: {'YES' if access_token else 'NO'}")
if not access_token:
    print(f"Error: {signin_data}")
    exit(1)

# ============================================================
# STEP 4: Create workspace directly via Supabase REST API
# (The app uses a Next.js server action, not a REST endpoint)
# ============================================================
print("\nSTEP 4: Create workspace via Supabase REST API (service role)")

workspace_name = "SSRF Test Workspace"
workspace_slug = f"ssrf-test-{uuid.uuid4().hex[:8]}"
workspace_id_to_insert = str(uuid.uuid4())

# Insert workspace using service key (bypasses RLS)
ws_insert_resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/workspaces",
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    },
    json={
        "name": workspace_name,
        "slug": workspace_slug,
        "owner_id": user_id
    },
    timeout=15
)
print(f"Workspace insert status: {ws_insert_resp.status_code}")
print(f"Workspace insert response: {ws_insert_resp.text[:300]}")

workspace_id = None
if ws_insert_resp.status_code in (200, 201):
    ws_data = ws_insert_resp.json()
    if isinstance(ws_data, list) and len(ws_data) > 0:
        workspace_id = ws_data[0].get("id")
    elif isinstance(ws_data, dict):
        workspace_id = ws_data.get("id")
    print(f"Workspace ID: {workspace_id}")

if not workspace_id:
    print("Workspace creation failed, trying to fetch existing workspaces for user...")
    # Try to find any existing workspace owned by this user
    existing_ws = requests.get(
        f"{SUPABASE_URL}/rest/v1/workspaces?owner_id=eq.{user_id}&select=id,name",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        timeout=15
    )
    print(f"Existing workspaces status: {existing_ws.status_code}")
    print(f"Existing workspaces: {existing_ws.text[:300]}")
    existing_data = existing_ws.json()
    if isinstance(existing_data, list) and len(existing_data) > 0:
        workspace_id = existing_data[0].get("id")
        print(f"Using existing workspace ID: {workspace_id}")

# ============================================================
# STEP 4b: Add user as workspace member
# ============================================================
if workspace_id:
    print("\nSTEP 4b: Add user as workspace member")
    member_resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/workspace_members",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        json={
            "workspace_id": workspace_id,
            "user_id": user_id,
            "role": "owner"
        },
        timeout=15
    )
    print(f"Member insert status: {member_resp.status_code}")
    print(f"Member insert response: {member_resp.text[:200]}")

# ============================================================
# STEP 5: Verify app access with cookies
# ============================================================
print("\nSTEP 5: Test app access with auth cookies")
project_ref = "txomrdymcawauezlprvn"
cookie_name_token = f"sb-{project_ref}-auth-token"

session = requests.Session()
cookie_value = urllib.parse.quote(json.dumps({
    "access_token": access_token,
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": int(time.time()) + 3600,
    "refresh_token": refresh_token,
    "user": signin_data.get("user", {})
}))

session.cookies.set(
    cookie_name_token,
    cookie_value,
    domain="host.docker.internal"
)

# Also try the active_workspace_id cookie
if workspace_id:
    session.cookies.set(
        "active_workspace_id",
        workspace_id,
        domain="host.docker.internal"
    )

# Test an authenticated API endpoint
if workspace_id:
    test_resp = session.get(
        f"{APP_URL}/api/workspace/settings?workspaceId={workspace_id}",
        timeout=15
    )
    print(f"Workspace settings status: {test_resp.status_code}")
    print(f"Workspace settings response: {test_resp.text[:300]}")

print("\n" + "=" * 60)
print("SUMMARY")
print(f"user_id:      {user_id}")
print(f"email:        {email}")
print(f"workspace_id: {workspace_id}")
print(f"access_token: {access_token[:40] if access_token else 'NONE'}...")
print(f"refresh_token: {refresh_token[:20] if refresh_token else 'NONE'}...")
print("=" * 60)
