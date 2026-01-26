"""Rate limiting middleware."""
from functools import wraps
from flask import request, jsonify, g
from collections import defaultdict
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Simple in-memory rate limiter (for production, use Redis)
_rate_limit_store = defaultdict(list)


def rate_limit(max_requests: int = 60, window_seconds: int = 60, per_user: bool = False):
    """
    Rate limiting decorator.
    
    Args:
        max_requests: Maximum number of requests allowed
        window_seconds: Time window in seconds
        per_user: If True, rate limit per user_id, else per IP
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get identifier (user_id or IP)
            if per_user:
                from flask import session
                user_id = session.get("user_id")
                if user_id:
                    identifier = f"user:{user_id}"
                else:
                    identifier = f"ip:{request.remote_addr}"
            else:
                identifier = f"ip:{request.remote_addr}"
            
            key = f"{func.__name__}:{identifier}"
            now = datetime.utcnow()
            
            # Clean old entries
            _rate_limit_store[key] = [
                timestamp for timestamp in _rate_limit_store[key]
                if now - timestamp < timedelta(seconds=window_seconds)
            ]
            
            # Check limit
            if len(_rate_limit_store[key]) >= max_requests:
                logger.warning(f"Rate limit exceeded for {identifier} on {func.__name__}")
                return jsonify({
                    "error": "Rate limit exceeded. Please try again later."
                }), 429
            
            # Record request
            _rate_limit_store[key].append(now)
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

