"""
Async email sender using aiosmtplib (STARTTLS / port 587).

If SMTP credentials are not configured, emails are silently skipped and
a warning is logged — so the app still runs in dev without a mail server.
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("[Email] SMTP not configured — skipping email to %s (subject: %s)", to, subject)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info("[Email] Sent to %s — %s", to, subject)
    except Exception as exc:
        logger.error("[Email] Failed to send to %s: %s", to, exc)
        raise


# ── Templates ─────────────────────────────────────────────────────────────────

def _base(title: str, body: str) -> str:
    return f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:32px 24px;color:#1e293b">
      <h2 style="margin:0 0 8px;font-size:20px">{title}</h2>
      {body}
      <p style="margin-top:32px;font-size:12px;color:#94a3b8">AutoQA Gen · This email was sent automatically.</p>
    </div>"""


def _otp_box(otp: str) -> str:
    digits = "".join(
        f'<span style="display:inline-block;width:40px;height:48px;line-height:48px;text-align:center;'
        f'font-size:24px;font-weight:700;background:#f1f5f9;border-radius:8px;margin:0 4px;color:#1e293b">'
        f'{d}</span>'
        for d in otp
    )
    return f'<div style="margin:24px 0;text-align:center">{digits}</div>'


def _expiry_badge(minutes: int) -> str:
    return (
        f'<p style="margin:0 0 20px;text-align:center">'
        f'<span style="display:inline-block;padding:6px 14px;background:#fef9c3;border:1px solid #fde047;'
        f'border-radius:999px;font-size:13px;font-weight:600;color:#854d0e">'
        f'⏱ Valid for {minutes} minutes</span></p>'
    )


async def send_verification_email(to: str, full_name: str, otp: str) -> None:
    body = f"""
      <p style="margin:0 0 16px;color:#475569">Hi {full_name},</p>
      <p style="margin:0 0 8px;color:#475569">Enter the code below to verify your email address:</p>
      {_otp_box(otp)}
      {_expiry_badge(15)}
      <p style="font-size:12px;color:#94a3b8">If you didn't create an account, you can safely ignore this email.</p>"""
    await send_email(to, "Your AutoQA Gen verification code", _base("Verify your email", body))


async def send_reset_email(to: str, full_name: str, otp: str) -> None:
    body = f"""
      <p style="margin:0 0 16px;color:#475569">Hi {full_name},</p>
      <p style="margin:0 0 8px;color:#475569">Enter the code below to reset your password:</p>
      {_otp_box(otp)}
      {_expiry_badge(15)}
      <p style="font-size:12px;color:#94a3b8">If you didn't request a password reset, you can safely ignore this email.</p>"""
    await send_email(to, "Your AutoQA Gen password reset code", _base("Reset your password", body))
