"""Error handling middleware."""
from flask import jsonify, request
from backend.utils.exceptions import (
    AppException,
    ValidationError,
    NotFoundError,
    PermissionError,
    AuthenticationError,
    ConflictError,
)
import logging
import traceback

logger = logging.getLogger(__name__)


def add_cors_headers(response):
    """Add CORS headers to response."""
    origin = request.headers.get('Origin')
    allowed_origins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
    ]
    if origin and (origin in allowed_origins or request.app.config.get("DEBUG")):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response


def register_error_handlers(app):
    """Register error handlers for the Flask application."""
    
    @app.errorhandler(ValidationError)
    def handle_validation_error(e: ValidationError):
        """Handle validation errors."""
        response = jsonify({"error": e.message})
        return add_cors_headers(response), e.status_code
    
    @app.errorhandler(NotFoundError)
    def handle_not_found(e: NotFoundError):
        """Handle not found errors."""
        response = jsonify({"error": e.message})
        return add_cors_headers(response), e.status_code
    
    @app.errorhandler(PermissionError)
    def handle_permission_error(e: PermissionError):
        """Handle permission errors."""
        response = jsonify({"error": e.message})
        return add_cors_headers(response), e.status_code
    
    @app.errorhandler(AuthenticationError)
    def handle_authentication_error(e: AuthenticationError):
        """Handle authentication errors."""
        response = jsonify({"error": e.message})
        return add_cors_headers(response), e.status_code
    
    @app.errorhandler(ConflictError)
    def handle_conflict_error(e: ConflictError):
        """Handle conflict errors."""
        response = jsonify({"error": e.message})
        return add_cors_headers(response), e.status_code
    
    @app.errorhandler(AppException)
    def handle_app_exception(e: AppException):
        """Handle general application exceptions."""
        logger.error(f"Application error: {e.message}", exc_info=True)
        response = jsonify({"error": e.message})
        return add_cors_headers(response), e.status_code
    
    @app.errorhandler(404)
    def handle_404(e):
        """Handle 404 errors."""
        response = jsonify({"error": "Endpoint not found"})
        return add_cors_headers(response), 404
    
    @app.errorhandler(500)
    def handle_500(e):
        """Handle 500 errors."""
        logger.error("Internal server error", exc_info=True)
        response = jsonify({"error": "Internal server error"})
        return add_cors_headers(response), 500
    
    @app.errorhandler(Exception)
    def handle_generic_exception(e: Exception):
        """Handle unhandled exceptions."""
        # Log full traceback for debugging
        logger.error(
            f"Unhandled error in {request.method} {request.path}: {e}",
            exc_info=True,
            extra={
                "path": request.path,
                "method": request.method,
                "user_id": getattr(request, 'user_id', None),
            }
        )
        
        # In production, don't expose internal errors
        error_message = "An unexpected error occurred"
        if app.config.get("DEBUG", False):
            error_message = f"{str(e)}\n{traceback.format_exc()}"
        
        response = jsonify({"error": error_message})
        return add_cors_headers(response), 500
    
    @app.errorhandler(429)  # Rate limit exceeded
    def handle_rate_limit(e):
        """Handle rate limit errors."""
        response = jsonify({
            "error": "Rate limit exceeded. Please try again later.",
            "retry_after": getattr(e, "retry_after", 60)
        })
        return add_cors_headers(response), 429

