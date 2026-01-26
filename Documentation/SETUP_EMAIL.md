# Email Configuration Guide

The application now supports email notifications via SMTP. Email notifications are sent automatically for:
- Auction won notifications
- Auction sold notifications
- Auction ended (no bids) notifications
- Outbid notifications

## Configuration

Email functionality is **optional**. If SMTP is not configured, the application will work normally but emails will not be sent (notifications will still be created in-app).

### Environment Variables

Set the following environment variables to enable email sending:

```bash
# SMTP Server Configuration
SMTP_HOST=smtp.gmail.com          # Your SMTP server hostname
SMTP_PORT=587                    # SMTP port (usually 587 for TLS, 465 for SSL)
SMTP_USER=your-email@gmail.com   # Your SMTP username/email
SMTP_PASSWORD=your-app-password  # Your SMTP password or app-specific password
SMTP_FROM=your-email@gmail.com   # From address (optional, defaults to SMTP_USER)
```

### Example Configurations

#### Gmail
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password  # Use App Password, not regular password
SMTP_FROM=your-email@gmail.com
```

**Note**: For Gmail, you need to:
1. Enable 2-Step Verification
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the App Password (not your regular password)

#### Outlook/Office 365
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-password
SMTP_FROM=your-email@outlook.com
```

#### SendGrid
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM=your-verified-sender@example.com
```

#### AWS SES
```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # Use your region
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASSWORD=your-ses-smtp-password
SMTP_FROM=your-verified-email@example.com
```

### Setting Environment Variables

#### Windows (PowerShell)
```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASSWORD="your-app-password"
$env:SMTP_FROM="your-email@gmail.com"
```

#### Windows (Command Prompt)
```cmd
set SMTP_HOST=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password
set SMTP_FROM=your-email@gmail.com
```

#### Linux/Mac
```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your-email@gmail.com
export SMTP_PASSWORD=your-app-password
export SMTP_FROM=your-email@gmail.com
```

#### Using .env file (recommended)
Create a `.env` file in the project root:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
```

Then load it in your application (you may need to install `python-dotenv`):
```python
from dotenv import load_dotenv
load_dotenv()
```

## User Email Preferences

Users can control email notifications via their notification preferences:
- `notification_email`: Master switch for email notifications
- Individual notification types can be toggled in user settings

If a user has `notification_email` disabled, they will still receive in-app notifications but no emails will be sent.

## Testing

To test email functionality:

1. Configure SMTP settings (see above)
2. Create a test auction and let it end
3. Check that emails are sent to:
   - Winner (if auction has bids)
   - Seller
   - Outbid users

## Troubleshooting

**Emails not sending:**
- Check SMTP credentials are correct
- Verify SMTP server allows connections from your IP
- Check firewall/network settings
- For Gmail: Ensure App Password is used (not regular password)
- Check application logs for error messages

**Emails going to spam:**
- Configure SPF/DKIM records for your domain
- Use a reputable email service (SendGrid, AWS SES, etc.)
- Ensure "From" address matches verified sender

**Connection errors:**
- Verify SMTP_HOST and SMTP_PORT are correct
- Check if your network blocks SMTP ports
- Try different ports (587 for TLS, 465 for SSL, 25 for unencrypted)

