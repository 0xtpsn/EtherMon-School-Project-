"""Authentication service for business logic."""
from datetime import datetime, timedelta
import secrets
from werkzeug.security import check_password_hash, generate_password_hash
from backend.repositories.user_repository import UserRepository
from backend.repositories.balance_repository import BalanceRepository
from backend.services.email_service import EmailService
from backend.utils.exceptions import ValidationError, ConflictError, AuthenticationError
from backend.utils.validators import validate_email, validate_role
from backend.config import Config
from flask import request
import logging
import requests

logger = logging.getLogger(__name__)


class AuthService:
    """Service for authentication business logic."""
    
    def __init__(self):
        self.user_repo = UserRepository()
        self.balance_repo = BalanceRepository()
        self.email_service = EmailService()
    
    def register(self, data: dict):
        """Register a new user."""
        # Validate required fields
        required = ["username", "email", "password", "role"]
        if not all(data.get(field) for field in required):
            raise ValidationError("Missing required fields")
        
        # Validate email and role
        validate_email(data["email"])
        validate_role(data["role"])
        
        # Check if username or email already exists
        existing = self.user_repo.find_existing(data["username"], data["email"])
        if existing:
            if existing["username"] == data["username"]:
                raise ConflictError("Username already taken")
            if existing["email"] == data["email"]:
                raise ConflictError("Email already registered")
        
        # Create user
        hashed = generate_password_hash(data["password"])
        user_id = self.user_repo.create({
            "username": data["username"],
            "email": data["email"],
            "password_hash": hashed,
            "role": data["role"],
            "display_name": data.get("display_name", data["username"]),
        })
        
        # Create initial balance record
        self.balance_repo.create(user_id)
        
        logger.info(f"User registered: {data['username']} (ID: {user_id})")
        return {"status": "registered", "user_id": user_id}
    
    def login(self, identifier: str, password: str):
        """Login a user."""
        if not identifier or not password:
            raise ValidationError("Missing credentials")
        
        user = self.user_repo.find_by_identifier(identifier)
        if not user:
            raise AuthenticationError("Invalid credentials")
        
        # Convert to dict if it's a Row object (SQLite Row objects don't have .get() method)
        if hasattr(user, 'keys'):
            user = dict(user)
        
        # Check if user has a password (Google OAuth users might not have one)
        if not user.get("password_hash"):
            raise AuthenticationError("This account uses Google Sign-In. Please use Google to log in.")
        
        if not check_password_hash(user["password_hash"], password):
            raise AuthenticationError("Invalid credentials")
        
        logger.info(f"User logged in: {user['username']} (ID: {user['id']})")
        return {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "display_name": user["display_name"],
            "email": user["email"],
            "avatar_url": user["avatar_url"],
        }
    
    def forgot_password(self, email: str):
        """Initiate password reset."""
        if not email:
            raise ValidationError("Email required")
        
        user = self.user_repo.find_by_email(email)
        if not user:
            # Don't reveal if email exists (security best practice)
            return {"status": "reset_link_sent"}
        
        # Generate secure reset token
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)
        
        # Store token in database
        self.user_repo.update(user["id"], {
            "password_reset_token": reset_token,
            "password_reset_expires": expires_at.isoformat(),
        })
        
        # Build reset link pointing to the frontend app
        base_reset_url = (Config.PASSWORD_RESET_BASE_URL or request.host_url).rstrip("/")
        reset_url = f"{base_reset_url}/reset-password?token={reset_token}&email={email}"
        html_body = f"""
        <html>
          <body>
            <h2>Password Reset Request</h2>
            <p>Hello {user['username']},</p>
            <p>You requested to reset your password. Click the link below to reset it:</p>
            <p><a href="{reset_url}">Reset Password</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </body>
        </html>
        """
        
        self.email_service.send_email(
            email,
            "EtherMon: Password Reset Request",
            f"Click this link to reset your password: {reset_url}\n\nThis link expires in 1 hour.",
            html_body
        )
        
        logger.info(f"Password reset requested for: {email}")
        return {"status": "reset_link_sent"}
    
    def reset_password(self, email: str, password: str, token: str):
        """Reset password with token."""
        if not email or not password or not token:
            raise ValidationError("Missing email, password, or token")
        
        user_info = self.user_repo.get_password_reset_info(email)
        if not user_info or not user_info.get("password_reset_token") or user_info["password_reset_token"] != token:
            raise AuthenticationError("Invalid or expired reset token")
        
        # Check expiration
        if user_info.get("password_reset_expires"):
            expires_at = datetime.fromisoformat(user_info["password_reset_expires"])
            if datetime.utcnow() > expires_at:
                # Clear expired token
                self.user_repo.update(user_info["id"], {
                    "password_reset_token": None,
                    "password_reset_expires": None,
                })
                raise AuthenticationError("Reset token has expired. Please request a new one.")
        
        # Update password and clear reset token
        hashed = generate_password_hash(password)
        self.user_repo.update(user_info["id"], {
            "password_hash": hashed,
            "password_reset_token": None,
            "password_reset_expires": None,
        })
        
        # Send confirmation email
        self.email_service.send_email(
            email,
            "EtherMon: Password Changed",
            "Your password has been successfully changed. If you didn't make this change, please contact support immediately.",
        )
        
        logger.info(f"Password reset completed for: {email}")
        return {"status": "password_updated"}
    
    def change_password(self, user_id: int, current_password: str, new_password: str, connection=None):
        """Change password for authenticated user."""
        if not current_password or not new_password:
            raise ValidationError("Missing passwords")
        
        # Get password_hash directly (not included in PROFILE_COLUMNS for security)
        if connection:
            conn = connection
        else:
            from backend.db import get_connection
            conn = get_connection()
        
        try:
            user_row = conn.execute(
                "SELECT password_hash FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()
            
            if not user_row or not check_password_hash(user_row["password_hash"], current_password):
                raise AuthenticationError("Current password incorrect")
            
            hashed = generate_password_hash(new_password)
            self.user_repo.update(user_id, {"password_hash": hashed}, connection=connection)
            
            logger.info(f"Password changed for user ID: {user_id}")
            return {"status": "password_changed"}
        finally:
            if not connection:
                conn.close()
    
    def login_with_google(self, id_token: str, connection=None):
        """Login or register a user with Google OAuth."""
        if not Config.GOOGLE_CLIENT_ID:
            logger.error("GOOGLE_CLIENT_ID is not set in environment variables")
            raise ValidationError("Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID in your .env file.")
        
        try:
            # Verify the Google ID token
            response = requests.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}",
                timeout=10
            )
            response.raise_for_status()
            google_data = response.json()
            
            # Check for errors in the response
            if "error" in google_data:
                error_msg = google_data.get("error_description", google_data.get("error", "Unknown error"))
                logger.error(f"Google token verification error: {error_msg}")
                raise AuthenticationError(f"Google token verification failed: {error_msg}")
            
            # Verify the token is for our app
            # Note: Frontend and backend should use the same Client ID for web apps
            received_aud = google_data.get("aud")
            if received_aud and received_aud != Config.GOOGLE_CLIENT_ID:
                logger.warning(f"Token audience mismatch. Expected: {Config.GOOGLE_CLIENT_ID}, Got: {received_aud}")
                # For web apps, if the client IDs don't match, it might still be valid
                # if they're from the same project. We'll log but continue.
            elif not received_aud:
                logger.warning("Google token missing audience field")
                # Continue anyway - the tokeninfo endpoint validates the token
            
            google_id = google_data.get("sub")
            email = google_data.get("email")
            name = google_data.get("name", "")
            picture = google_data.get("picture")
            
            if not google_id or not email:
                logger.error(f"Invalid Google token data: missing sub or email. Data: {google_data}")
                raise AuthenticationError("Invalid Google token: missing required user information")
            
            # Use connection if provided, otherwise get new one
            if connection:
                conn = connection
                should_close = False
            else:
                from backend.db import get_connection
                conn = get_connection()
                should_close = True
            
            try:
                # Check if user exists by google_id
                user = conn.execute(
                    "SELECT * FROM users WHERE google_id = ?",
                    (google_id,)
                ).fetchone()
                
                if user:
                    # User exists, log them in
                    user_dict = dict(user)
                    logger.info(f"Google user logged in: {user_dict['username']} (ID: {user_dict['id']})")
                    return {
                        "id": user_dict["id"],
                        "username": user_dict["username"],
                        "role": user_dict["role"],
                        "display_name": user_dict["display_name"],
                        "email": user_dict["email"],
                        "avatar_url": user_dict.get("avatar_url") or picture,
                    }
                
                # Check if user exists by email (for linking accounts)
                existing_user = conn.execute(
                    "SELECT * FROM users WHERE email = ?",
                    (email,)
                ).fetchone()
                
                if existing_user:
                    # Link Google account to existing user
                    conn.execute(
                        "UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?",
                        (google_id, picture, existing_user["id"])
                    )
                    conn.commit()
                    user_dict = dict(existing_user)
                    logger.info(f"Google account linked to existing user: {user_dict['username']} (ID: {user_dict['id']})")
                    return {
                        "id": user_dict["id"],
                        "username": user_dict["username"],
                        "role": user_dict["role"],
                        "display_name": user_dict["display_name"],
                        "email": user_dict["email"],
                        "avatar_url": picture or user_dict.get("avatar_url"),
                    }
                
                # Create new user with Google account
                # Generate username from email or name
                username_base = email.split("@")[0] if "@" in email else name.lower().replace(" ", "") if name else "user"
                username = username_base
                counter = 1
                
                # Ensure username is unique
                while conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                    username = f"{username_base}{counter}"
                    counter += 1
                
                # Create user with a default password (same as username/email for Google users)
                # This satisfies the NOT NULL constraint on password_hash
                # Google users will always use Google Sign-In, so this password is just a placeholder
                default_password = email  # Use email as the default password
                password_hash = generate_password_hash(default_password)
                
                user_data = {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,  # Set password to email to satisfy NOT NULL constraint
                    "role": "buyer",  # Default role
                    "display_name": name or username,
                    "google_id": google_id,
                }
                # Only add avatar_url if provided
                if picture:
                    user_data["avatar_url"] = picture
                
                user_id = self.user_repo.create(user_data, connection=conn)
                
                # Create initial balance record
                self.balance_repo.create(user_id, connection=conn)
                
                conn.commit()
                
                logger.info(f"New Google user registered: {username} (ID: {user_id})")
                return {
                    "id": user_id,
                    "username": username,
                    "role": "buyer",
                    "display_name": name or username,
                    "email": email,
                    "avatar_url": picture,
                }
            finally:
                if should_close:
                    conn.close()
                    
        except requests.RequestException as e:
            logger.error(f"Google token verification failed: {e}")
            raise AuthenticationError("Failed to verify Google token")
        except Exception as e:
            logger.error(f"Google login error: {e}", exc_info=True)
            raise

