"""Request validation middleware."""
from functools import wraps
from flask import request, jsonify
from typing import Dict, Any, Optional, List, Callable
from backend.utils.exceptions import ValidationError
import logging

logger = logging.getLogger(__name__)


def validate_request(
    required_fields: Optional[List[str]] = None,
    optional_fields: Optional[List[str]] = None,
    field_validators: Optional[Dict[str, Callable]] = None,
    allow_empty: bool = False
):
    """
    Request validation decorator.
    
    Args:
        required_fields: List of required field names
        optional_fields: List of optional field names (for documentation)
        field_validators: Dict mapping field names to validation functions
        allow_empty: If True, allow empty request body
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                data = request.get_json() or {}
                
                # Check if body is required
                if not allow_empty and not data:
                    raise ValidationError("Request body is required")
                
                # Check required fields
                if required_fields:
                    missing = [field for field in required_fields if field not in data or data[field] is None]
                    if missing:
                        raise ValidationError(f"Missing required fields: {', '.join(missing)}")
                
                # Run field validators
                if field_validators:
                    for field, validator in field_validators.items():
                        if field in data and data[field] is not None:
                            try:
                                validator(data[field])
                            except Exception as e:
                                raise ValidationError(f"Invalid {field}: {str(e)}")
                
                return func(*args, **kwargs)
            except ValidationError as e:
                logger.warning(f"Validation error in {func.__name__}: {e}")
                return jsonify({"error": str(e)}), 400
            except Exception as e:
                logger.error(f"Unexpected error in validation for {func.__name__}: {e}", exc_info=True)
                return jsonify({"error": "Invalid request"}), 400
        return wrapper
    return decorator


def validate_query_params(
    required_params: Optional[List[str]] = None,
    param_validators: Optional[Dict[str, Callable]] = None
):
    """
    Query parameter validation decorator.
    
    Args:
        required_params: List of required parameter names
        param_validators: Dict mapping parameter names to validation functions
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                # Check required params
                if required_params:
                    missing = [param for param in required_params if param not in request.args]
                    if missing:
                        raise ValidationError(f"Missing required query parameters: {', '.join(missing)}")
                
                # Run param validators
                if param_validators:
                    for param, validator in param_validators.items():
                        if param in request.args:
                            try:
                                validator(request.args[param])
                            except Exception as e:
                                raise ValidationError(f"Invalid {param}: {str(e)}")
                
                return func(*args, **kwargs)
            except ValidationError as e:
                logger.warning(f"Query validation error in {func.__name__}: {e}")
                return jsonify({"error": str(e)}), 400
            except Exception as e:
                logger.error(f"Unexpected error in query validation for {func.__name__}: {e}", exc_info=True)
                return jsonify({"error": "Invalid request"}), 400
        return wrapper
    return decorator

