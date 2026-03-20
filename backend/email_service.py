import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

logger = logging.getLogger(__name__)


class EmailServiceError(Exception):
    pass


def _smtp_config() -> tuple[str, int, str, str, str] | None:
    """Load SMTP settings from environment. Never log passwords."""
    host = (os.environ.get("SMTP_HOST") or "").strip()
    port_raw = (os.environ.get("SMTP_PORT") or "").strip()
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = os.environ.get("SMTP_PASS")  # may contain spaces; do not strip secrets blindly
    from_addr = (os.environ.get("SMTP_FROM") or "").strip()

    if not host or not port_raw or not user or password is None or password == "" or not from_addr:
        return None

    try:
        port = int(port_raw)
    except ValueError:
        return None

    return (host, port, user, password, from_addr)


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Send a single HTML email via Microsoft 365–compatible SMTP (STARTTLS + auth).

    Uses SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM from the environment.
    """
    cfg = _smtp_config()
    if cfg is None:
        logger.error(
            "SMTP not configured: require SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM"
        )
        raise EmailServiceError("Email service not configured")

    host, port, user, password, from_addr = cfg

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr(("FeelAtHomeNow", from_addr))
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(user, password)
            server.send_message(msg)
    except smtplib.SMTPException as e:
        logger.error("SMTP send failed: %s", e)
        raise EmailServiceError("Failed to send email") from e
    except OSError as e:
        logger.error("SMTP connection error: %s", e)
        raise EmailServiceError("Failed to send email") from e

    return True


def send_contact_notification(
    recipient_email: str,
    contact_name: str,
    contact_email: str,
    contact_phone: str,
    contact_company: str,
    contact_message: str,
    language: str = "de",
) -> bool:
    """
    Send email notification when contact form is submitted.

    Args:
        recipient_email: Email to send notification to (info@feelathomenow.ch)
        contact_name: Name of the person who submitted the form
        contact_email: Email of the person who submitted the form
        contact_phone: Phone number of the person
        contact_company: Company name (optional)
        contact_message: Message content
        language: Language preference (de/en)

    Returns:
        bool: True if email was sent successfully
    """
    # Create subject based on language
    if language == "de":
        subject = f"Neue Kontaktanfrage von {contact_name}"
        company_label = "Unternehmen"
        phone_label = "Telefon"
        message_label = "Nachricht"
        footer_text = "Diese E-Mail wurde automatisch vom FeelAtHomeNow Kontaktformular gesendet."
    else:
        subject = f"New Contact Inquiry from {contact_name}"
        company_label = "Company"
        phone_label = "Phone"
        message_label = "Message"
        footer_text = "This email was automatically sent from the FeelAtHomeNow contact form."

    # Build HTML email content
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #2C3E50;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background: linear-gradient(135deg, #FF7A3D 0%, #FF6A2D 100%);
                padding: 30px;
                border-radius: 8px 8px 0 0;
                text-align: center;
            }}
            .header h1 {{
                color: white;
                margin: 0;
                font-size: 24px;
            }}
            .content {{
                background: #ffffff;
                padding: 30px;
                border: 1px solid #e0e0e0;
                border-top: none;
                border-radius: 0 0 8px 8px;
            }}
            .field {{
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid #f0f0f0;
            }}
            .field:last-child {{
                border-bottom: none;
                margin-bottom: 0;
            }}
            .label {{
                font-size: 12px;
                text-transform: uppercase;
                color: #888;
                letter-spacing: 0.5px;
                margin-bottom: 5px;
            }}
            .value {{
                font-size: 16px;
                color: #2C3E50;
            }}
            .message-box {{
                background: #f8f9fa;
                padding: 20px;
                border-radius: 6px;
                border-left: 4px solid #FF7A3D;
            }}
            .footer {{
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #e0e0e0;
                font-size: 12px;
                color: #888;
                text-align: center;
            }}
            a {{
                color: #FF7A3D;
                text-decoration: none;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>FeelAtHomeNow</h1>
        </div>
        <div class="content">
            <div class="field">
                <div class="label">Name</div>
                <div class="value">{contact_name}</div>
            </div>
            <div class="field">
                <div class="label">Email</div>
                <div class="value"><a href="mailto:{contact_email}">{contact_email}</a></div>
            </div>
            <div class="field">
                <div class="label">{phone_label}</div>
                <div class="value"><a href="tel:{contact_phone}">{contact_phone}</a></div>
            </div>
            {"<div class='field'><div class='label'>" + company_label + "</div><div class='value'>" + contact_company + "</div></div>" if contact_company else ""}
            <div class="field">
                <div class="label">{message_label}</div>
                <div class="message-box">
                    {contact_message.replace(chr(10), '<br>')}
                </div>
            </div>
            <div class="footer">
                {footer_text}
            </div>
        </div>
    </body>
    </html>
    """

    send_email(recipient_email, subject, html_content)
    logger.info("Contact notification email sent successfully to %s", recipient_email)
    return True


def send_password_reset_email(recipient_email: str, reset_link: str) -> bool:
    """
    Send password reset email.

    Security/ops notes:
    - Caller generates the reset token and includes it in reset_link.
    - This function does not log reset_link.
    """
    subject = "Reset your FeelAtHomeNow password"
    html_content = f"""
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: Helvetica Neue, Arial, sans-serif; line-height: 1.6; color: #2C3E50;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 12px 0;">Password reset</h2>
          <p style="margin: 0 0 16px 0;">Use the link below to set a new password. This link will expire soon.</p>
          <p style="margin: 0 0 16px 0;">
            <a href="{reset_link}" style="color: #FF7A3D; text-decoration: none;">Reset password</a>
          </p>
          <p style="font-size: 12px; color: #888;">
            If you did not request this, you can ignore this email.
          </p>
        </div>
      </body>
    </html>
    """.strip()

    send_email(recipient_email, subject, html_content)
    logger.info("Password reset email sent")
    return True
