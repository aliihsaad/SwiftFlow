import requests
import json
import hashlib
import os
import base64
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import uuid
import time

SUPABASE_URL = "https://txomrdymcawauezlprvn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODExMDQyOCwiZXhwIjoyMDgzNjg2NDI4fQ.bO5zmywqDdNhN41s4lwHHTAJToCgDdXEBbLuNn08xxM"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMTA0MjgsImV4cCI6MjA4MzY4NjQyOH0.dwBcXZ_TZG97GCCvPPtfKETbxnm4jNFSF1K1FwFut0E"
APP_URL = "http://host.docker.internal:3000"
ENCRYPTION_KEY_HEX = "4b229bdfad4dd85e425716090a46674b103ead56275eb3c3b5ddaca558c231c0"

def to_base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def encrypt_secret(plaintext: str) -> str:
    """Replicates the app's encryptSecretIfNeeded() function"""
    # Derive AES key: SHA-256 of the encryption key string
    key = hashlib.sha256(ENCRYPTION_KEY_HEX.encode('utf-8')).digest()

    # Generate random 12-byte IV (nonce)
    iv = secrets.token_bytes(12)

    # Encrypt with AES-256-GCM
    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext + auth_tag (16 bytes appended)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)

    # Split: ciphertext is everything except last 16 bytes (auth tag)
    ciphertext = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]

    iv_b64 = to_base64url(iv)
    tag_b64 = to_base64url(auth_tag)
    ct_b64 = to_base64url(ciphertext)

    return f"enc:v1:{iv_b64}.{tag_b64}.{ct_b64}"

# Step 1: Create and confirm test user
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

# Step 2: Use service key to confirm email via admin API
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

# Step 3: Sign in to get access token
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

# Step 4: Create workspace via app API
print("\nSTEP 4: Create workspace")
# We need to set proper cookies for the Next.js app
# The app uses Supabase SSR cookies
import urllib.parse

# Set the Supabase auth cookies
project_ref = "txomrdymcawauezlprvn"
cookie_name_token = f"sb-{project_ref}-auth-token"

session = requests.Session()
session.cookies.set(
    cookie_name_token,
    urllib.parse.quote(json.dumps({
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": int(time.time()) + 3600,
        "refresh_token": refresh_token,
        "user": signin_data.get("user", {})
    })),
    domain="host.docker.internal"
)

workspace_resp = session.post(
    f"{APP_URL}/api/workspaces",
    json={"name": "SSRF Test Workspace"},
    headers={"Content-Type": "application/json"},
    timeout=15
)
print(f"Create workspace status: {workspace_resp.status_code}")
print(f"Workspace response: {workspace_resp.text[:500]}")

workspace_id = None
try:
    workspace_data = workspace_resp.json()
    workspace_id = workspace_data.get("workspace", {}).get("id") or workspace_data.get("id")
    print(f"Workspace ID: {workspace_id}")
except:
    pass

print("\n" + "=" * 60)
print("SUMMARY")
print(f"access_token: {access_token[:40]}..." if access_token else "access_token: NONE")
print(f"workspace_id: {workspace_id}")
print(f"user_id: {user_id}")
print(f"email: {email}")
