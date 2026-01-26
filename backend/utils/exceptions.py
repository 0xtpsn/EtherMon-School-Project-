"""Custom exception classes for the application."""


class AppException(Exception):
    """Base exception for application errors."""
    status_code = 500
    message = "An error occurred"

    def __init__(self, message: str = None, status_code: int = None):
        self.message = message or self.message
        if status_code:
            self.status_code = status_code
        super().__init__(self.message)


class ValidationError(AppException):
    """Raised when input validation fails."""
    status_code = 400
    message = "Validation error"


class NotFoundError(AppException):
    """Raised when a resource is not found."""
    status_code = 404
    message = "Resource not found"


class PermissionError(AppException):
    """Raised when user lacks required permissions."""
    status_code = 403
    message = "Permission denied"


class AuthenticationError(AppException):
    """Raised when authentication fails."""
    status_code = 401
    message = "Authentication required"


class ConflictError(AppException):
    """Raised when a resource conflict occurs (e.g., duplicate)."""
    status_code = 409
    message = "Resource conflict"

