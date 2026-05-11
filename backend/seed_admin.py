"""
One-time script: create the first admin account.
Run from backend/: py seed_admin.py
"""

import asyncio
import uuid
from datetime import datetime

from app.core.config import settings
from app.core.security import hash_password
from motor.motor_asyncio import AsyncIOMotorClient


async def main() -> None:
    email = "admin@email.com"
    password = "111111"
    full_name = "Admin"

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB]
    col = db["users"]

    existing = await col.find_one({"email": email})
    if existing:
        if existing.get("role") != "admin":
            await col.update_one({"email": email}, {"$set": {"role": "admin"}})
            print(f"[seed] Existing account upgraded to admin: {email}")
        else:
            print(f"[seed] Admin already exists: {email}")
        client.close()
        return

    await col.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "email": email,
            "full_name": full_name,
            "hashed_password": hash_password(password),
            "created_at": datetime.utcnow(),
            "is_active": True,
            "role": "admin",
            "rate_limit": 0,
            "rate_used": 0,
            "rate_reset_at": None,
        }
    )
    print(f"[seed] Admin created: {email}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
