"""Configuration management for the Flask application."""
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Base configuration class."""
    
    # Flask Configuration
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")
    DEBUG = os.environ.get("FLASK_DEBUG", "False").lower() == "true"
    TESTING = False
    
    # Database Configuration
    BASE_DIR = Path(__file__).resolve().parent.parent
    DATABASE_PATH = BASE_DIR / os.environ.get("DATABASE_PATH", "auction.db")
    SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"
    
    # Upload Configuration
    UPLOAD_FOLDER = BASE_DIR / os.environ.get("UPLOAD_FOLDER", "uploads")
    MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", str(16 * 1024 * 1024)))  # 16MB
    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
    
    # Email Configuration (Resend API)
    RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
    EMAIL_FROM = os.environ.get("EMAIL_FROM", "ArtSpace <onboarding@resend.dev>")
    
    # Google OAuth Configuration
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
    
    # Scheduler Configuration
    # Process ended auctions every 1 minute for faster response (can be increased for production)
    SCHEDULER_INTERVAL_MINUTES = int(os.environ.get("SCHEDULER_INTERVAL_MINUTES", "1"))
    
    # Platform Fee Configuration (2.5%)
    PLATFORM_FEE_RATE = float(os.environ.get("PLATFORM_FEE_RATE", "0.025"))
    
    # API / Frontend Configuration∏zzz
    API_BASE_URL = os.environ.get("VITE_API_BASE_URL", "http://localhost:5001/api")
    PASSWORD_RESET_BASE_URL = os.environ.get(
        "PASSWORD_RESET_BASE_URL",
        os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173"),
    )
    
    @staticmethod
    def init_app(app):
        """Initialize application with configuration."""
        # Ensure upload directory exists
        Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DATABASE_PATH = Path("/tmp/test.db")


# Configuration dictionary
config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}

# Make config accessible as Config.config
Config.config = config

