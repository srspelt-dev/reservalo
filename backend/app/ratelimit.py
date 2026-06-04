"""Minimal in-memory sliding-window rate limiter (no external dependency).

Suitable for a single-instance deployment (our case). For multi-instance, swap the
backing store for Redis. Used to throttle login attempts against brute force.
"""
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_hits: int, window_seconds: int) -> None:
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        dq = self._hits[key]
        while dq and now - dq[0] > self.window:
            dq.popleft()
        if len(dq) >= self.max_hits:
            return False
        dq.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()
