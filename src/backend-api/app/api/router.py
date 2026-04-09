from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.research_catalog import router as research_catalog_router
from app.api.routes.research import router as research_router

api_router = APIRouter()
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(health_router)
api_router.include_router(research_catalog_router)
api_router.include_router(research_router)
