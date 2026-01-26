"""Authentication middleware."""
from functools import wraps
from flask import jsonify, session
from typing import Optional, Callable
from backend.utils.exceptions import AuthenticationError, PermissionError


def require_auth(role: Optional[str] = None):
    """
    Decorator to require authentication and optionally a specific role.
    
    Args:
        role: Optional role requirement ('buyer' or 'seller')
    
    Returns:
        Decorator function
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_id = session.get("user_id")
            if not user_id:
                raise AuthenticationError("Authentication required")
            
            if role:
                user_role = session.get("role")
                if user_role != role:
                    raise PermissionError(f"Insufficient permissions. Required role: {role}")
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator

