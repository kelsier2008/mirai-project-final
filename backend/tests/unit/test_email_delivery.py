import smtplib

from workers import email_delivery
from workers.email_delivery import is_permanent, render_message


def test_email_disabled_without_smtp_settings(monkeypatch):
    monkeypatch.setattr(email_delivery.settings, "smtp_host", "")
    assert email_delivery.email_config() is None


def test_render_message_uses_only_payload_fields():
    subject, body = render_message(
        "club_day.rescheduled",
        {"club_name": "Robotics", "title": "Build night", "day_date": "2026-11-05",
         "previous_day_date": "2026-11-03", "reason": "Lab booked", "secret": "nope"},
        "Mirai Club Activities Tracker",
    )
    assert subject == "Mirai Club Activities Tracker: Club Day rescheduled"
    assert "Date: 2026-11-05" in body and "Previously: 2026-11-03" in body
    assert "nope" not in body


def test_permanent_and_temporary_failures():
    assert is_permanent("smtp_auth_failed")
    assert is_permanent("smtp_550")
    assert not is_permanent("smtp_timeout")
    assert not is_permanent("smtp_421")


class FakeSMTP:
    sent = []
    fail_with = None

    def __init__(self, host, port, timeout):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        pass

    def login(self, user, password):
        if FakeSMTP.fail_with:
            raise FakeSMTP.fail_with

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)
        return {}


def test_send_reports_success_and_stable_error_codes(monkeypatch):
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    config = {"host": "smtp.example.org", "port": 587, "username": "u", "password": "p",
              "sender": "noreply@example.org", "security": "starttls"}
    assert email_delivery._send_sync(config, "a@example.org", "Hi", "Body") is None
    assert FakeSMTP.sent[-1]["To"] == "a@example.org"
    FakeSMTP.fail_with = smtplib.SMTPAuthenticationError(535, b"bad credentials")
    assert email_delivery._send_sync(config, "a@example.org", "Hi", "Body") == "smtp_auth_failed"
    FakeSMTP.fail_with = OSError("connection refused")
    assert email_delivery._send_sync(config, "a@example.org", "Hi", "Body") == "smtp_connect_error"
    FakeSMTP.fail_with = None
