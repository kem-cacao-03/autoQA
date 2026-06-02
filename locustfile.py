"""
Load test — non-LLM endpoints only (no token cost).

Requires test users created by seed_test_users.py first:
    py seed_test_users.py create

Usage:
    py -m locust --headless -u 20 -r 4 -t 60s --host http://localhost:8000

Flags:
    -u  total virtual users (max = NUM_USERS in seed_test_users.py)
    -r  users spawned per second (ramp-up rate)
    -t  total test duration
"""

import itertools
import random
from locust import HttpUser, between, task

NUM_USERS     = 70
EMAIL_PREFIX  = "loadtest_user_"
EMAIL_DOMAIN  = "@loadtest-autoqa.com"
TEST_PASSWORD = "Loadtest@123"

# Round-robin account pool so each virtual user gets a unique account
_account_pool = itertools.cycle(
    [f"{EMAIL_PREFIX}{i}{EMAIL_DOMAIN}" for i in range(NUM_USERS)]
)


class AppUser(HttpUser):
    wait_time = between(0.5, 2)
    token: str = ""
    history_ids: list[str] = []

    def on_start(self):
        email = next(_account_pool)
        with self.client.post(
            "/auth/login",
            json={"email": email, "password": TEST_PASSWORD},
            catch_response=True,
            name="POST /auth/login",
        ) as r:
            if r.status_code == 200:
                self.token = r.json()["access_token"]
                r.success()
            else:
                r.failure(f"Login failed {r.status_code}: {r.text[:120]}")

    def _auth(self):
        return {"Authorization": f"Bearer {self.token}"}

    @task(5)
    def get_me(self):
        self.client.get("/auth/me", headers=self._auth(), name="GET /auth/me")

    @task(8)
    def list_history(self):
        with self.client.get(
            "/history?skip=0&limit=20",
            headers=self._auth(),
            catch_response=True,
            name="GET /history",
        ) as r:
            if r.status_code == 200:
                ids = [h["id"] for h in r.json()]
                if ids:
                    self.history_ids = ids
                r.success()

    @task(4)
    def get_history_detail(self):
        if not self.history_ids:
            return
        hid = random.choice(self.history_ids)
        self.client.get(f"/history/{hid}", headers=self._auth(), name="GET /history/:id")

    @task(2)
    def toggle_favorite(self):
        if not self.history_ids:
            return
        hid = random.choice(self.history_ids)
        self.client.post(
            f"/history/{hid}/favorite",
            headers=self._auth(),
            name="POST /history/:id/favorite",
        )

    @task(1)
    def health(self):
        self.client.get("/health", name="GET /health")
