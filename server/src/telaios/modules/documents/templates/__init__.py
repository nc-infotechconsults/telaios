"""modules/documents/templates public facade."""

from telaios.modules.documents.templates.router import project_templates_router, templates_router
from telaios.modules.documents.templates.schemas import TemplateCreate, TemplatePatch, TemplateRead
from telaios.modules.documents.templates.service import TemplateService

__all__ = [
    "TemplateCreate",
    "TemplatePatch",
    "TemplateRead",
    "TemplateService",
    "project_templates_router",
    "templates_router",
]
