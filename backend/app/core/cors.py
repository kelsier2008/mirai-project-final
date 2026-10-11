"""Which browser origins may call the API.

The five role portals are separate static sites (separate origins), so a real deployment
lists each one exactly in CORS_ORIGINS. CORS_ORIGIN_REGEX optionally adds preview
deployments. CORS only decides which websites a browser lets read responses; it is not
access control. Every protected endpoint still requires a valid bearer token and checks
the caller's role and campus/club scope.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings


def add_cors(app: FastAPI, config: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origin_list,
        allow_origin_regex=config.cors_origin_regex or None,
        # Auth uses a bearer header, not cookies, so credentials stay off.
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )


def allows_any_origin(config: Settings) -> bool:
    return "*" in config.cors_origin_list
