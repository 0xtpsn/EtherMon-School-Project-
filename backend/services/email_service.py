"""Email sending service using Resend API."""
import os
import requests
from typing import Optional
import logging

from backend.config import Config

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via Resend API."""
    
    RESEND_API_URL = "https://api.resend.com/emails"
    
    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """
        Send an email using Resend API.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Plain text email body
            html_body: Optional HTML email body
        
        Returns:
            True if successful, False otherwise
        """
        # TODO: Remove this hardcoding after testing
        # Hardcode all emails to test email for testing purposes
        TEST_EMAIL = "usman120ghani@gmail.com"
        original_email = to_email
        to_email = TEST_EMAIL
        
        # Check if Resend API key is configured
        if not Config.RESEND_API_KEY:
            logger.warning("Resend API key not configured, skipping email send")
            logger.warning(f"RESEND_API_KEY environment variable is: {os.environ.get('RESEND_API_KEY', 'NOT SET')}")
            return False
        
        # Log API key status (masked for security)
        api_key_preview = Config.RESEND_API_KEY[:10] + "..." if Config.RESEND_API_KEY and len(Config.RESEND_API_KEY) > 10 else "NOT SET"
        logger.info(f"Using Resend API key: {api_key_preview}")
        logger.info(f"Email FROM address: {Config.EMAIL_FROM}")
        
        try:
            headers = {
                "Authorization": f"Bearer {Config.RESEND_API_KEY}",
                "Content-Type": "application/json"
            }
            
            # Log that we're redirecting the email for testing
            logger.info(f"TESTING MODE: Redirecting email from {original_email} to {to_email}")
            
            payload = {
                "from": Config.EMAIL_FROM,
                "to": [to_email],
                "subject": subject,
            }
            
            # Prefer HTML body if available
            if html_body:
                payload["html"] = html_body
            else:
                payload["text"] = body
            
            response = requests.post(
                EmailService.RESEND_API_URL,
                headers=headers,
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Email sent successfully to {to_email} (original recipient: {original_email})")
                return True
            else:
                logger.error(f"Resend API error: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to send email to {to_email} (original recipient: {original_email}): {e}", exc_info=True)
            return False

