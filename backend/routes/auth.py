"""Authentication routes."""
from flask import Blueprint, jsonify, request, session, g
from backend.services.auth_service import AuthService
from backend.repositories.user_repository import UserRepository
from backend.middleware.auth import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.middleware.request_validator import validate_request
from backend.utils.validators import validate_email, validate_role, validate_password_length
from backend.utils.exceptions import ValidationError, AuthenticationError
from backend.config import Config
import logging
import os

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)
auth_service = AuthService()
user_repo = UserRepository()


@auth_bp.post("/api/register")
@rate_limit(max_requests=5, window_seconds=300, per_user=False)  # 5 registrations per 5 minutes per IP
@validate_request(
    required_fields=["username", "email", "password", "role"],
    field_validators={
        "email": validate_email,
        "role": validate_role,
        "password": validate_password_length
    }
)
def register():
    """Register a new user."""
    try:
        data = request.get_json() or {}
        result = auth_service.register(data)
        logger.info(f"User registered: {data.get('username')}")
        return jsonify(result), 201
    except Exception as e:
        logger.error(f"Registration error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 400


@auth_bp.post("/api/login")
@rate_limit(max_requests=10, window_seconds=300, per_user=False)  # 10 login attempts per 5 minutes per IP
@validate_request(
    required_fields=["password"],
    allow_empty=False
)
def login():
    """Login a user."""
    try:
        data = request.get_json() or {}
        identifier = data.get("identifier") or data.get("username") or data.get("email")
        password = data.get("password")
        
        if not identifier:
            return jsonify({"error": "Username or email required"}), 400
        
        user = auth_service.login(identifier, password)
        
        # Set session
        session["user_id"] = user["id"]
        session["role"] = user["role"]
        
        logger.info(f"User logged in: {user['username']} (ID: {user['id']})")
        return jsonify(user)
    except Exception as e:
        logger.warning(f"Login failed for {data.get('identifier', 'unknown')}: {e}")
        return jsonify({"error": str(e)}), 401


@auth_bp.post("/api/logout")
def logout():
    """Logout current user."""
    session.clear()
    return jsonify({"status": "logged_out"})


@auth_bp.get("/api/session")
def current_session():
    """Get current session."""
    if "user_id" not in session:
        return jsonify({"user": None})
    
    user = user_repo.find_by_id(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"user": None})
    
    return jsonify({
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "display_name": user["display_name"],
            "email": user["email"],
            "avatar_url": user["avatar_url"],
        }
    })


@auth_bp.post("/api/password/forgot")
@rate_limit(max_requests=3, window_seconds=3600, per_user=False)  # 3 requests per hour per IP
@validate_request(
    required_fields=["email"],
    field_validators={"email": validate_email}
)
def forgot_password():
    """Request password reset."""
    try:
        data = request.get_json() or {}
        email = data.get("email")
        result = auth_service.forgot_password(email)
        logger.info(f"Password reset requested for: {email}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Forgot password error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 400


@auth_bp.post("/api/password/reset")
@rate_limit(max_requests=5, window_seconds=300, per_user=False)  # 5 attempts per 5 minutes per IP
@validate_request(
    required_fields=["email", "password", "token"],
    field_validators={
        "email": validate_email,
        "password": validate_password_length
    }
)
def reset_password():
    """Reset password with token."""
    try:
        data = request.get_json() or {}
        email = data.get("email")
        password = data.get("password")
        token = data.get("token")
        
        result = auth_service.reset_password(email, password, token)
        logger.info(f"Password reset completed for: {email}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Reset password error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 400


@auth_bp.post("/api/password/change")
@require_auth()
@validate_request(
    required_fields=["current_password", "new_password"],
    field_validators={
        "new_password": validate_password_length
    }
)
def change_password():
    """Change password for authenticated user."""
    try:
        data = request.get_json() or {}
        current_password = data.get("current_password")
        new_password = data.get("new_password")
        
        # Use the request-scoped database connection
        result = auth_service.change_password(session["user_id"], current_password, new_password, connection=g.db)
        g.db.commit()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Change password error: {e}", exc_info=True)
        if hasattr(g, 'db'):
            g.db.rollback()
        return jsonify({"error": str(e)}), 400


@auth_bp.post("/api/auth/google")
@rate_limit(max_requests=20, window_seconds=60, per_user=False)
@validate_request(
    required_fields=["id_token"]
)
def google_login():
    """Login or register with Google OAuth."""
    try:
        data = request.get_json() or {}
        id_token = data.get("id_token")
        
        if not id_token:
            return jsonify({"error": "Google ID token required"}), 400
        
        if not Config.GOOGLE_CLIENT_ID:
            logger.error("Google OAuth not configured: GOOGLE_CLIENT_ID is missing from backend .env file")
            logger.error(f"Current working directory: {os.getcwd()}")
            logger.error(f"Looking for .env file in: {os.path.dirname(os.path.dirname(os.path.abspath(__file__)))}")
            return jsonify({"error": "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID in your backend .env file."}), 500
        
        user = auth_service.login_with_google(id_token, connection=g.db)
        
        # Set session
        session["user_id"] = user["id"]
        session["role"] = user["role"]
        
        g.db.commit()
        logger.info(f"Google user logged in: {user['username']} (ID: {user['id']})")
        return jsonify(user)
    except ValidationError as e:
        if hasattr(g, 'db'):
            g.db.rollback()
        logger.error(f"Google login validation error: {e}", exc_info=True)
        response = jsonify({"error": str(e)})
        # Add CORS headers for error responses
        origin = request.headers.get('Origin')
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 400
    except AuthenticationError as e:
        if hasattr(g, 'db'):
            g.db.rollback()
        logger.error(f"Google login authentication error: {e}", exc_info=True)
        response = jsonify({"error": str(e)})
        # Add CORS headers for error responses
        origin = request.headers.get('Origin')
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 401
    except Exception as e:
        if hasattr(g, 'db'):
            g.db.rollback()
        logger.error(f"Google login failed: {e}", exc_info=True)
        response = jsonify({"error": f"Failed to authenticate with Google: {str(e)}"})
        # Add CORS headers for error responses
        origin = request.headers.get('Origin')
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 500
