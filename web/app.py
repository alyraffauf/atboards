import os

import httpx
from quart import Quart

from core.auth.config import load_secrets
from core.auth.session import SessionStore
from core.util import format_datetime_utc


def create_app() -> Quart:
    app = Quart(__name__)

    # Data directory for secrets and database
    data_dir = os.environ.get("ATBOARDS_DATA_DIR", ".")

    # Load secrets
    secrets = load_secrets(data_dir)
    app.secret_key = secrets["secret_key"]
    app.config["CLIENT_SECRET_JWK"] = secrets["client_secret_jwk"]
    app.config["PUBLIC_URL"] = os.environ.get("PUBLIC_URL", "http://127.0.0.1:5000")

    # Session store
    db_path = os.path.join(data_dir, "atboards.db")
    app.session_store = SessionStore(db_path)

    # Jinja filters
    app.jinja_env.filters["datetime"] = format_datetime_utc

    @app.before_serving
    async def startup():
        app.http_client = httpx.AsyncClient()

    @app.after_serving
    async def shutdown():
        await app.http_client.aclose()

    # Load user for templates
    @app.before_request
    async def load_user():
        from quart import g, session
        did = session.get("did")
        if did:
            g.user = app.session_store.get_session(did)
        else:
            g.user = None

    # Register blueprints
    from web.routes import bp as main_bp
    from web.routes_auth import bp as auth_bp
    from web.routes_write import bp as write_bp
    from web.routes_sysop import bp as sysop_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(write_bp)
    app.register_blueprint(sysop_bp)

    return app
