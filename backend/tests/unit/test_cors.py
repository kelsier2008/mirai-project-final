"""CORS for the five separately hosted role portals (frontend/apps/*)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.core.cors import add_cors, allows_any_origin

PORTALS = [
    "https://mirai-super-admin.pages.dev",
    "https://mirai-campus-manager.pages.dev",
    "https://mirai-advisor.pages.dev",
    "https://mirai-coordinator.pages.dev",
    "https://mirai-student.pages.dev",
]
PREVIEWS = r"^https://[a-z0-9-]+\.mirai-(super-admin|campus-manager|advisor|coordinator|student)\.pages\.dev$"


def client(**overrides) -> TestClient:
    app = FastAPI()

    @app.get("/auth/me")
    def me():
        return {"ok": True}

    add_cors(app, Settings(**overrides))
    return TestClient(app)


def preflight(c: TestClient, origin: str):
    return c.options("/auth/me", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    })


def test_origin_list_is_trimmed():
    s = Settings(cors_origins=" https://a.pages.dev/ ,https://b.pages.dev,, ")
    assert s.cors_origin_list == ["https://a.pages.dev", "https://b.pages.dev"]
    assert not allows_any_origin(s)
    assert allows_any_origin(Settings(cors_origins="*"))


@pytest.mark.parametrize("origin", PORTALS)
def test_each_portal_origin_may_call_the_api(origin):
    c = client(cors_origins=",".join(PORTALS))
    r = preflight(c, origin)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin
    assert "authorization" in r.headers["access-control-allow-headers"].lower()
    assert c.get("/auth/me", headers={"Origin": origin}).headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", [
    "https://evil.example",
    "https://mirai-student.pages.dev.evil.example",
    "http://mirai-student.pages.dev",  # plain http is a different origin
])
def test_other_origins_are_not_allowed(origin):
    c = client(cors_origins=",".join(PORTALS))
    assert "access-control-allow-origin" not in preflight(c, origin).headers
    assert "access-control-allow-origin" not in c.get("/auth/me", headers={"Origin": origin}).headers


def test_preview_deployments_need_the_optional_pattern():
    preview = "https://3f2a1b9c.mirai-student.pages.dev"
    assert "access-control-allow-origin" not in preflight(client(cors_origins=",".join(PORTALS)), preview).headers
    c = client(cors_origins=",".join(PORTALS), cors_origin_regex=PREVIEWS)
    assert preflight(c, preview).headers["access-control-allow-origin"] == preview
    assert "access-control-allow-origin" not in preflight(c, "https://x.mirai-student.pages.dev.evil.example").headers


def test_invalid_pattern_fails_at_startup():
    with pytest.raises(ValidationError, match="CORS_ORIGIN_REGEX"):
        Settings(cors_origin_regex="^https://(unclosed")


def test_credentials_stay_off():
    r = preflight(client(cors_origins=PORTALS[0]), PORTALS[0])
    assert r.headers.get("access-control-allow-credentials") is None
