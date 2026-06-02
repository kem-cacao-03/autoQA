"""
Create / delete test users directly in MongoDB for load testing.
Bypasses email OTP — do NOT use in production.

Usage:
    py seed_test_users.py create   # insert 20 test users
    py seed_test_users.py delete   # remove all test users
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

# Read from backend/.env so we always use the same DB as the running server
_env = Path(__file__).parent / "backend" / ".env"
for line in _env.read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

MONGO_URL = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
MONGO_DB  = os.environ.get("MONGODB_DB", "autoqa_gen")

NUM_USERS     = 70
EMAIL_PREFIX  = "loadtest_user_"
EMAIL_DOMAIN  = "@loadtest-autoqa.com"
TEST_PASSWORD = "Loadtest@123"

def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

async def create_users():
    client = AsyncIOMotorClient(MONGO_URL)
    col = client[MONGO_DB]["users"]

    docs = []
    for i in range(NUM_USERS):
        docs.append({
            "_id":             str(uuid.uuid4()),
            "email":           f"{EMAIL_PREFIX}{i}{EMAIL_DOMAIN}",
            "full_name":       f"Load Test User {i}",
            "hashed_password": _hash(TEST_PASSWORD),
            "created_at":      datetime.now(timezone.utc),
            "is_active":       True,
            "role":            "user",
            "rate_limit":      0,
            "rate_used":       0,
            "rate_reset_at":   None,
        })

    # Skip already existing ones
    existing = await col.distinct("email", {"email": {"$regex": f"^{EMAIL_PREFIX}"}})
    new_docs = [d for d in docs if d["email"] not in existing]

    if not new_docs:
        print(f"All {NUM_USERS} test users already exist.")
    else:
        await col.insert_many(new_docs)
        print(f"Created {len(new_docs)} test users  ({EMAIL_PREFIX}0..{NUM_USERS-1}{EMAIL_DOMAIN})")

    client.close()

async def delete_users():
    client = AsyncIOMotorClient(MONGO_URL)
    col = client[MONGO_DB]["users"]
    result = await col.delete_many({"email": {"$regex": f"^{EMAIL_PREFIX}"}})
    print(f"Deleted {result.deleted_count} test users.")
    client.close()

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "create"
    if cmd == "delete":
        asyncio.run(delete_users())
    else:
        asyncio.run(create_users())
