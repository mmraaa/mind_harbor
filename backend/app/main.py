from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, chat, doodles, favorites, health, journals, reminders
from app.api.admin import router as admin_router
from app.api.counselor.chat import router as counselor_chat_router
from app.api.counselor.stats import router as counselor_stats_router
from app.core.config import get_settings
from app.core.logging import setup_logging

setup_logging()
settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(journals.router, prefix=settings.api_prefix)
app.include_router(favorites.router, prefix=settings.api_prefix)
app.include_router(reminders.router, prefix=settings.api_prefix)
app.include_router(doodles.router, prefix=settings.api_prefix)
app.include_router(counselor_chat_router, prefix=settings.api_prefix)
app.include_router(counselor_stats_router, prefix=settings.api_prefix)
app.include_router(admin_router, prefix=settings.api_prefix)
