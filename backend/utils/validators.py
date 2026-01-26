"""Input validation utilities."""
from typing import Dict, Any, List, Optional
from backend.utils.exceptions import ValidationError


def validate_required_fields(data: Dict[str, Any], required: List[str]) -> None:
    """Validate that all required fields are present."""
    missing = [field for field in required if not data.get(field)]
    if missing:
        raise ValidationError(f"Missing required fields: {', '.join(missing)}")


def validate_email(email: str) -> None:
    """Validate email format."""
    if not email or "@" not in email:
        raise ValidationError("Invalid email format")


def validate_role(role: str) -> None:
    """Validate user role."""
    if role not in ("buyer", "seller"):
        raise ValidationError("Invalid role. Must be 'buyer' or 'seller'")


def validate_password_length(password: str) -> None:
    """Validate password length."""
    if not password or len(password) < 8:
        raise ValidationError("Password must be at least 8 characters")


def validate_price(price: Optional[float]) -> None:
    """Validate price is non-negative."""
    if price is not None and price < 0:
        raise ValidationError("Price must be non-negative")


def validate_artwork_create(data: Dict[str, Any]) -> None:
    """Validate artwork creation data."""
    required = ["title", "description", "category", "image_url"]
    validate_required_fields(data, required)
    
    if not isinstance(data.get("title"), str) or len(data["title"].strip()) == 0:
        raise ValidationError("Title must be a non-empty string")
    
    if len(data.get("title", "")) > 200:
        raise ValidationError("Title must be 200 characters or less")
    
    if data.get("description") and len(data["description"]) > 5000:
        raise ValidationError("Description must be 5000 characters or less")
    
    validate_price(data.get("price"))
    
    if data.get("price") is not None and data["price"] > 1000000:
        raise ValidationError("Price cannot exceed 1,000,000")


def validate_auction_create(data: Dict[str, Any]) -> None:
    """Validate auction creation data."""
    required = ["title", "description", "category", "start_price", "end_time", "image_url"]
    validate_required_fields(data, required)
    
    validate_price(data.get("start_price"))
    validate_price(data.get("reserve_price"))
    
    if data.get("start_price", 0) < 0:
        raise ValidationError("Start price must be non-negative")
    
    if data.get("reserve_price") is not None and data["reserve_price"] < data.get("start_price", 0):
        raise ValidationError("Reserve price must be greater than or equal to start price")

